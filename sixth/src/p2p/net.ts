/** Transport. Two ways to reach another manager, neither of which is a game server:
 *  1. Trystero over public Nostr relays (peer discovery only; game data is direct, end-to-end encrypted WebRTC)
 *  2. Hand-carried codes: an offer and an answer pasted through any chat. No infrastructure beyond a STUN lookup. */
import { joinRoom, type Room } from 'trystero';
export interface NetPrefs {
  relays: string[];
  turn: { urls: string; username?: string; credential?: string }[];
  loopback?: boolean;
}
export const loadPrefs = (): NetPrefs => {
  try {
    return { relays: [], turn: [], ...JSON.parse(localStorage.getItem('sixth.net') ?? '{}') };
  } catch {
    return { relays: [], turn: [] };
  }
};
export const savePrefs = (p: NetPrefs) => localStorage.setItem('sixth.net', JSON.stringify(p));
type Handler = (data: any, from: string) => void;
const STUN = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }];
export interface Channel {
  kind: 'room' | 'code';
  send(t: string, d: unknown, to?: string): void;
  on(t: string, f: Handler): () => void;
  peers(): string[];
  onJoin(f: (id: string) => void): void;
  onLeave(f: (id: string) => void): void;
  leave(): void;
}
class Base {
  h = new Map<string, Set<Handler>>();
  js = new Set<(id: string) => void>();
  ls = new Set<(id: string) => void>();
  on(t: string, f: Handler) {
    let s = this.h.get(t);
    if (!s) this.h.set(t, (s = new Set()));
    s.add(f);
    return () => {
      s!.delete(f);
    };
  }
  onJoin(f: (id: string) => void) {
    this.js.add(f);
  }
  onLeave(f: (id: string) => void) {
    this.ls.add(f);
  }
  protected emit(m: any, from: string) {
    if (!m || typeof m.t !== 'string') return;
    this.h.get(m.t)?.forEach(f => {
      try {
        f(m.d, from);
      } catch (e) {
        console.warn('p2p handler', m.t, e);
      }
    });
  }
}
export class RoomChannel extends Base implements Channel {
  kind = 'room' as const;
  room: Room;
  private ids = new Set<string>();
  private act: any;
  error = '';
  constructor(name: string, password?: string) {
    super();
    const p = loadPrefs();
    this.room = joinRoom(
      {
        appId: 'sixth-esports-manager-v1',
        ...(password ? { password } : {}),
        rtcConfig: { iceServers: STUN },
        ...(p.turn.length ? { turnConfig: p.turn } : {}),
        ...(p.relays.length ? { relayConfig: { urls: p.relays } } : {}),
        ...(p.loopback ? { _test_only_mdnsHostFallbackToLoopback: true } : {}),
      } as any,
      name,
      {
        onJoinError: (e: any) => {
          this.error = e.error;
        },
      } as any,
    );
    this.act = this.room.makeAction('m');
    this.act.onMessage = (d: any, ctx: any) => {
      let m = d;
      if (typeof d === 'string') {
        try {
          m = JSON.parse(d);
        } catch {
          return;
        }
      }
      this.emit(m, ctx.peerId);
    };
    this.room.onPeerJoin = (id: string) => {
      this.ids.add(id);
      this.js.forEach(f => f(id));
    };
    this.room.onPeerLeave = (id: string) => {
      this.ids.delete(id);
      this.ls.forEach(f => f(id));
    };
  }
  send(t: string, d: unknown, to?: string) {
    const s = JSON.stringify({ t, d });
    const p = this.act.send(s, to ? { target: to } : undefined);
    p?.catch?.(() => {});
  }
  peers() {
    return [...this.ids];
  }
  leave() {
    this.room.leave();
  }
}
/** Direct connection by pasted codes. Messages are chunked: data channels choke on single messages above 64 KB. */
export class CodeChannel extends Base implements Channel {
  kind = 'code' as const;
  pc: RTCPeerConnection;
  dc: RTCDataChannel | null = null;
  up = false;
  private parts = new Map<string, string[]>();
  state = 'new';
  onState: ((s: string) => void) | null = null;
  constructor() {
    super();
    const p = loadPrefs();
    this.pc = new RTCPeerConnection({ iceServers: [...STUN, ...p.turn] });
    this.pc.onconnectionstatechange = () => {
      this.state = this.pc.connectionState;
      this.onState?.(this.state);
      if (this.state === 'failed' || this.state === 'closed' || this.state === 'disconnected') {
        if (this.up) {
          this.up = false;
          this.ls.forEach(f => f('direct'));
        }
      }
    };
    this.pc.ondatachannel = e => this.bind(e.channel);
  }
  private bind(dc: RTCDataChannel) {
    this.dc = dc;
    const opened = () => {
      if (this.up) return;
      this.up = true;
      this.js.forEach(f => f('direct'));
    };
    dc.onopen = opened;
    if (dc.readyState === 'open') setTimeout(opened, 0);
    dc.onclose = () => {
      if (this.up) {
        this.up = false;
        this.ls.forEach(f => f('direct'));
      }
    };
    dc.onmessage = e => {
      const s = String(e.data);
      const i = s.indexOf('|');
      const [id, n, tot] = s.slice(0, i).split(',');
      const T = +tot;
      if (T > 4000) return;
      let a = this.parts.get(id);
      if (!a) this.parts.set(id, (a = []));
      a[+n] = s.slice(i + 1);
      if (a.filter(x => x !== undefined).length === T) {
        this.parts.delete(id);
        try {
          this.emit(JSON.parse(a.join('')), 'direct');
        } catch {
          /* malformed */
        }
      }
    };
  }
  private async ice() {
    if (this.pc.iceGatheringState === 'complete') return;
    await new Promise<void>(r => {
      const t = setTimeout(r, 3500);
      this.pc.onicegatheringstatechange = () => {
        if (this.pc.iceGatheringState === 'complete') {
          clearTimeout(t);
          r();
        }
      };
    });
  }
  private enc() {
    return btoa(JSON.stringify(this.pc.localDescription));
  }
  async offer() {
    this.bind(this.pc.createDataChannel('sixth'));
    await this.pc.setLocalDescription(await this.pc.createOffer());
    await this.ice();
    return 'SX1-' + this.enc();
  }
  async answer(code: string) {
    await this.pc.setRemoteDescription(JSON.parse(atob(code.trim().replace(/^SX1-/, ''))));
    await this.pc.setLocalDescription(await this.pc.createAnswer());
    await this.ice();
    return 'SX2-' + this.enc();
  }
  async accept(code: string) {
    await this.pc.setRemoteDescription(JSON.parse(atob(code.trim().replace(/^SX2-/, ''))));
  }
  send(t: string, d: unknown) {
    if (!this.dc || this.dc.readyState !== 'open') return;
    const s = JSON.stringify({ t, d }),
      N = 15000,
      n = Math.ceil(s.length / N),
      id = Math.random().toString(36).slice(2, 9);
    for (let i = 0; i < n; i++) this.dc.send(`${id},${i},${n}|${s.slice(i * N, (i + 1) * N)}`);
  }
  peers() {
    return this.up ? ['direct'] : [];
  }
  leave() {
    this.pc.close();
  }
}
