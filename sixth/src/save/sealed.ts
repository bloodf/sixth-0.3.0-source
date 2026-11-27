/** IndexedDB values encrypted with the profile's non-extractable key. The key name is authenticated, so values cannot be swapped around. */
import { all, get, put, type Store } from './db.ts';
import { open, seal, type Sealed } from './crypto.ts';
export const isSealed = (v: any): v is Sealed => !!v && v.iv instanceof Uint8Array && v.ct instanceof Uint8Array;
export async function sput(s: Store, k: string, v: unknown) {
  await put(s, k, await seal(JSON.stringify(v), `${s}/${k}`));
}
/** undefined when absent, unreadable or altered */
export async function sget<T>(s: Store, k: string): Promise<T | undefined> {
  const v = await get<Sealed>(s, k);
  if (!isSealed(v)) return undefined;
  try {
    return JSON.parse(await open(v, `${s}/${k}`));
  } catch {
    return undefined;
  }
}
/** `plain` receives values written before encryption was added */
export async function sall<T>(s: Store, range?: IDBKeyRange, plain?: (k: string, v: any) => void): Promise<{ k: string; v: T }[]> {
  const out: { k: string; v: T }[] = [];
  for (const { k, v } of await all<any>(s, range)) {
    if (!isSealed(v)) {
      plain?.(k, v);
      continue;
    }
    try {
      out.push({ k, v: JSON.parse(await open(v, `${s}/${k}`)) });
    } catch {
      /* altered: ignored */
    }
  }
  return out;
}
