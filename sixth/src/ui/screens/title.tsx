import { useEffect, useState } from 'preact/hooks';
import * as vault from '../../save/vault.ts';
import { app, bump, openCareer, refreshFlags, toast, tShort, titleScene, useApp } from '../store.ts';
import { $, ask, B, CrestI, Modal, UI } from '../kit.tsx';
import { fingerprint, myId } from '../../save/crypto.ts';
import { fmtDay } from './shell.tsx';
import type { TitleId } from '../../data/titles.ts';
export const Logo = ({ s = 1 }: { s?: number }) => (
  <svg viewBox="0 0 108 92" width={108 * s} height={92 * s} aria-hidden="true">
    <g fill="#f3f0e8">
      {[0, 1, 2, 3, 4].map(i => (
        <rect x={i * 23} y="0" width="15" height="66" key={i} />
      ))}
    </g>
    <rect x="0" y="77" width="107" height="15" fill="#ffc61a" />
  </svg>
);
export function TitleScreen() {
  useApp();
  const [rows, setRows] = useState<vault.Entry[] | null>(null);
  const [id, setId] = useState('');
  // opening the list checks every header, and may flag
  const load = () => vault.list().then(r => (setRows(r), refreshFlags()));
  useEffect(() => {
    load();
    myId().then(p => setId(fingerprint(p)));
  }, []);
  const [file, setFile] = useState<Uint8Array | null>(null);
  const imp = () => {
    const i = document.createElement('input');
    i.type = 'file';
    i.accept = '.sixth';
    i.onchange = async () => {
      const f = i.files?.[0];
      if (!f) return;
      const u = new Uint8Array(await f.arrayBuffer());
      if (vault.isBackup(u)) setFile(u);
      else toast('This is not a SIXTH backup file', 'err');
    };
    i.click();
  };
  return (
    <div class="title">
      <div class="logo">
        <h1>
          <Logo s={1} />
          SIXTH
        </h1>
        <p>Five play. You are the sixth.</p>
      </div>
      <div class="menu">
        {app.busy && <div class="mitem wait">{app.busy}…</div>}
        {rows?.slice(0, 3).map((r, i) => (
          <div class="srow" key={r.id}>
            <button
              class={'mitem ' + (i === 0 && !r.sealed ? 'main' : '')}
              disabled={!!r.sealed || !!app.busy}
              onClick={() => openCareer(r.id)}
            >
              <CrestI c={r.meta.crest} s={46} />
              <span class="grow">
                <small>{r.sealed ? 'Sealed: save data was altered' : i === 0 ? 'Continue' : 'Career'}</small>
                <b>{r.meta.name}</b>
                {!r.sealed && (
                  <small>
                    {fmtDay(r.meta.day)}, {$(r.meta.cash, true)}, {r.meta.titles.map(t => tShort(t as TitleId)).join(', ')}
                  </small>
                )}
              </span>
              {r.sealed ? <span class="chip r">sealed</span> : !r.ranked && <span class="chip a">unranked</span>}
            </button>
            <button
              class="ib del"
              aria-label={'Delete ' + r.meta.name}
              onClick={() =>
                ask(
                  'Delete this career?',
                  `${r.meta.name} will be gone from this device. A flag, if there is one, stays.`,
                  'Delete',
                  async () => {
                    await vault.remove(r.id);
                    load();
                  },
                  true,
                )
              }
            >
              {UI('trash', 17)}
            </button>
          </div>
        ))}
        <button
          class={'mitem ' + (rows && !rows.length ? 'main' : '')}
          disabled={!!app.busy}
          onClick={() => {
            app.screen = 'new';
            bump();
          }}
        >
          <b>New career</b>
          {UI('arrow-right', 24)}
        </button>
        <button class="mitem" onClick={imp}>
          <b>Restore backup</b>
        </button>
        <button
          class="mitem"
          onClick={() => {
            app.settings = true;
            bump();
          }}
        >
          <b>Settings</b>
        </button>
      </div>
      <div class="foot">
        Manager ID <b class="num sel">{id}</b>
        {app.flagged > 0 && (
          <>
            {' '}
            <span class="chip r">flagged: tampering</span>
          </>
        )}
        <br />
        Everything runs in this browser. No account, no server.
      </div>
      {file && (
        <Password
          title="Restore backup"
          text="Type the password this backup was made with."
          yes="Restore"
          close={() => setFile(null)}
          run={async pass => {
            try {
              const r = await vault.importSave(file, pass);
              toast(r.ranked ? 'Backup restored' : 'Backup restored as unranked', 'ok');
              setFile(null);
              load();
            } catch (e) {
              if (e instanceof vault.TamperError) {
                app.sealed = e.reason;
                app.screen = 'sealed';
                await refreshFlags();
                bump();
              } else throw e;
            }
          }}
        />
      )}
    </div>
  );
}
/** asks for a backup password; errors stay in the dialog */
function Password({
  title,
  text,
  yes,
  twice,
  run,
  close,
}: {
  title: string;
  text: string;
  yes: string;
  twice?: boolean;
  run: (p: string) => Promise<void>;
  close: () => void;
}) {
  const [p, setP] = useState('');
  const [q, setQ] = useState('');
  const [er, setEr] = useState('');
  const [busy, setBusy] = useState(false);
  const bad = p.length < 6 || (twice && p !== q);
  const go = async () => {
    if (bad || busy) return;
    setBusy(true);
    setEr('');
    try {
      await run(p);
    } catch (e) {
      setEr(String((e as Error).message ?? e));
    }
    setBusy(false);
  };
  return (
    <Modal close={close}>
      <form
        onSubmit={e => {
          e.preventDefault();
          go();
        }}
      >
        <div class="hd">
          <h1>{title}</h1>
        </div>
        <div class="bd col">
          <p class="sec">{text}</p>
          <label class="f">
            <span>Password{twice ? ', six characters or more' : ''}</span>
            <input
              type="password"
              autoFocus
              value={p}
              autocomplete={twice ? 'new-password' : 'current-password'}
              onInput={e => setP((e.target as HTMLInputElement).value)}
            />
          </label>
          {twice && (
            <label class="f">
              <span>Again</span>
              <input type="password" value={q} autocomplete="new-password" onInput={e => setQ((e.target as HTMLInputElement).value)} />
            </label>
          )}
          {er && <p class="neg">{er}</p>}
          {twice && p && q && p !== q && <p class="neg">The two passwords differ</p>}
          <div class="row end">
            <B k="q" onClick={close}>
              Cancel
            </B>
            <B k="p" type="submit" disabled={bad || busy}>
              {busy ? 'Working' : yes}
            </B>
          </div>
        </div>
      </form>
    </Modal>
  );
}
export function Sealed() {
  useApp();
  const [id, setId] = useState('');
  useEffect(() => {
    myId().then(p => setId(fingerprint(p)));
  }, []);
  return (
    <div class="sealed">
      <div>
        <h1>Save sealed</h1>
        <p style={{ fontSize: 19, marginBottom: 14 }}>{app.sealed}.</p>
        <p class="sec">
          This career can no longer be opened. Manager <b class="num">{id}</b> now carries a signed tampering flag. Other managers will see
          it, and it blocks world ladder and open league matches from this browser profile.
        </p>
        <p class="sec" style={{ marginTop: 10 }}>
          You can still start a new career and play offline.
        </p>
        <div class="row" style={{ marginTop: 22 }}>
          <B k="p l" onClick={() => titleScene()}>
            Back to title
          </B>
        </div>
      </div>
    </div>
  );
}
export function Settings() {
  const a = useApp();
  const [ask, setAsk] = useState(false);
  const c = a.career;
  const ex = async (pass: string) => {
    if (!c) return;
    await c.flush();
    const u = await vault.exportSave(c.id, pass);
    const b = new Blob([u as any]);
    const l = document.createElement('a');
    l.href = URL.createObjectURL(b);
    l.download = `${c.g.club.tag}-${fmtDay(c.g.day).replace(/ /g, '-')}.sixth`;
    l.click();
    setTimeout(() => URL.revokeObjectURL(l.href), 4000);
    setAsk(false);
    toast('Backup saved', 'ok');
  };
  if (ask)
    return (
      <Password
        title="Encrypted backup"
        text="The file can only be opened with this password. It is not kept anywhere: without it the backup is lost."
        yes="Save backup"
        twice
        run={ex}
        close={() => setAsk(false)}
      />
    );
  return <SettingsBody ex={c ? () => setAsk(true) : null} />;
}
import { audio } from '../../audio/audio.ts';
import { leaveCareer, setNames, setQuality } from '../store.ts';
import { loadPrefs, savePrefs } from '../../p2p/net.ts';
function SettingsBody({ ex }: { ex: (() => void) | null }) {
  const a = useApp();
  const [v, setV] = useState({ ...audio.vol });
  const [net, setNet] = useState(loadPrefs().relays.join('\n'));
  const c = a.career;
  const close = () => {
    a.settings = false;
    savePrefs({ ...loadPrefs(), relays: net.split(/\s+/).filter(x => /^wss?:\/\//.test(x)) });
    bump();
  };
  const manualQ = localStorage.getItem('sixth.q');
  return (
    <Modal close={close} wide>
      <div class="hd">
        <h1 class="grow">Settings</h1>
        <button class="ib" aria-label="Close" onClick={close}>
          {UI('x', 22)}
        </button>
      </div>
      <div class="bd">
        <div class="g2">
          <div class="col">
            <h2>Graphics</h2>
            <div class="opts">
              {(['auto', 'low', 'medium', 'high', 'ultra'] as const).map(q => (
                <B
                  disabled={a.screen === 'match'}
                  k={'s ' + ((q === 'auto' ? !manualQ : manualQ === q) ? 'on' : '')}
                  onClick={() => setQuality(q)}
                  key={q}
                >
                  {q[0].toUpperCase() + q.slice(1)}
                </B>
              ))}
            </div>
            <p class="sm mut">
              Running at {a.quality}
              {a.engine?.software
                ? '. This machine draws 3D in software, so Low keeps it smooth.'
                : `, ${Math.round(a.engine?.fps ?? 0)} fps.`}{' '}
              Change it between matches.
            </p>
            <h2>Time</h2>
            <label class="row">
              <input
                type="checkbox"
                checked={a.fast}
                onChange={e => {
                  a.fast = (e.target as HTMLInputElement).checked;
                  bump();
                }}
              />
              Skip the day time-lapse
            </label>
            <h2>Names</h2>
            <div class="opts">
              <B k={'s ' + (a.names === 'real' ? 'on' : '')} onClick={() => setNames('real')}>
                Real game titles
              </B>
              <B k={'s ' + (a.names === 'studio' ? 'on' : '')} onClick={() => setNames('studio')}>
                Original titles
              </B>
            </div>
            <p class="sm mut">
              Original titles replace the trademarked names everywhere. Maps, heroes, teams and players are always original.
            </p>
          </div>
          <div class="col">
            <h2>Sound</h2>
            {(['master', 'sfx', 'music'] as const).map(k => (
              <label class="f" key={k}>
                <span>{{ master: 'Master', sfx: 'Effects', music: 'Music' }[k]}</span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.02"
                  value={v[k]}
                  onInput={e => {
                    const n = +(e.target as HTMLInputElement).value;
                    audio.setVol(k, n);
                    setV({ ...v, [k]: n });
                  }}
                />
              </label>
            ))}
            <h2>Network</h2>
            <label class="f">
              <span>Discovery relays, one per line (blank for public defaults)</span>
              <textarea value={net} placeholder="wss://relay.example" onInput={e => setNet((e.target as HTMLTextAreaElement).value)} />
            </label>
          </div>
        </div>
        {c && (
          <>
            <h2>Save and integrity</h2>
            <div class="row w">
              <span class={'chip ' + (c.ranked && !a.flagged ? 'g' : 'a')}>
                {c.ranked && !a.flagged ? 'Ranked career' : a.flagged ? 'Flagged identity' : 'Unranked career'}
              </span>
              <span class={'chip ' + (c.auditState === 'ok' ? 'g' : c.auditState === 'failed' ? 'r' : 'i')}>
                {
                  {
                    pending: 'Replay audit waiting',
                    running: 'Replay audit running',
                    ok: 'Replay audit passed',
                    failed: 'Replay audit failed',
                  }[c.auditState]
                }
              </span>
              <span class="chip">{c.seq} signed actions</span>
              <span class="chip">head {c.head.slice(0, 10)}</span>
            </div>
            <p class="sm mut">
              Saves and backups are encrypted, hash-chained and signed. Changing one by hand seals it and flags this manager.
            </p>
            <div class="row w">
              <B onClick={() => ex?.()}>{UI('download', 17)}Download backup</B>
              <B
                onClick={() => {
                  a.settings = false;
                  leaveCareer();
                }}
              >
                {UI('log-out', 17)}Save and quit to title
              </B>
            </div>
          </>
        )}
        <p class="xs mut">
          SIXTH is free software: GNU AGPL 3.0 or later. Its source comes with it. People: MakeHuman (AGPL 3.0). Icons: game-icons.net
          contributors (CC BY 3.0) and Lucide (ISC). Type: Anybody and Sofia Sans (OFL). Rendering: Three.js (MIT). Peer discovery: Trystero
          (MIT).
        </p>
      </div>
    </Modal>
  );
}
