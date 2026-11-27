import { get, put } from './db.ts';
import { sha256 } from '../core/hash.ts';
const te = new TextEncoder(),
  td = new TextDecoder();
/** TS 5.9+ types Uint8Array as possibly shared; WebCrypto wants a plain ArrayBuffer view. */
const ab = (u: Uint8Array): Uint8Array<ArrayBuffer> => new Uint8Array(u) as Uint8Array<ArrayBuffer>;
export const b64 = (u: Uint8Array) => {
  let s = '';
  for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode(...u.subarray(i, i + 8192));
  return btoa(s);
};
export const ub64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
interface Keys {
  priv: CryptoKey;
  pub: string;
  enc: CryptoKey;
  mac: CryptoKey;
}
let keys: Keys | null = null;
export async function loadKeys(): Promise<Keys> {
  if (keys) return keys;
  let k = await get<Keys>('keys', 'id');
  if (!k) {
    const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
    const raw = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
    k = {
      priv: kp.privateKey,
      pub: b64(raw),
      enc: await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']),
      mac: (await crypto.subtle.generateKey({ name: 'HMAC', hash: 'SHA-256', length: 256 }, false, ['sign', 'verify'])) as CryptoKey,
    };
    await put('keys', 'id', k);
  }
  return (keys = k);
}
export const fingerprint = (pub: string) =>
  sha256(pub)
    .slice(0, 12)
    .toUpperCase()
    .replace(/(.{4})(?=.)/g, '$1-');
export async function myId() {
  return (await loadKeys()).pub;
}
export async function sign(s: string) {
  const k = await loadKeys();
  return b64(new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, k.priv, te.encode(s))));
}
const pubCache = new Map<string, CryptoKey>();
export async function verify(pub: string, s: string, sig: string): Promise<boolean> {
  try {
    let k = pubCache.get(pub);
    if (!k) {
      k = await crypto.subtle.importKey('raw', ab(ub64(pub)), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
      pubCache.set(pub, k);
    }
    return await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, k, ab(ub64(sig)), te.encode(s));
  } catch {
    return false;
  }
}
export interface Sealed {
  iv: Uint8Array;
  ct: Uint8Array;
}
export async function seal(s: string, aad: string): Promise<Sealed> {
  const k = await loadKeys();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: te.encode(aad) }, k.enc, te.encode(s)));
  return { iv, ct };
}
export async function open(b: Sealed, aad: string): Promise<string> {
  const k = await loadKeys();
  return td.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ab(b.iv), additionalData: te.encode(aad) }, k.enc, ab(b.ct)));
}
export async function mac(s: string) {
  const k = await loadKeys();
  return b64(new Uint8Array(await crypto.subtle.sign('HMAC', k.mac, te.encode(s)))).slice(0, 32);
}
export async function gzip(s: string): Promise<Uint8Array> {
  return new Uint8Array(await new Response(new Blob([s]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
}
export async function gunzip(u: Uint8Array): Promise<string> {
  return new Response(new Blob([ab(u)]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
}
export const randHex = (n: number) => [...crypto.getRandomValues(new Uint8Array(n))].map(x => x.toString(16).padStart(2, '0')).join('');
