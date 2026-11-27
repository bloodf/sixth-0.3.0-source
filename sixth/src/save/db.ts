/** Minimal promise wrapper over IndexedDB. */
let dbp: Promise<IDBDatabase> | null = null;
export const STORES = ['keys', 'careers', 'log', 'flags', 'anchors', 'peers', 'ladder', 'prefs'] as const;
export type Store = (typeof STORES)[number];
export function db(): Promise<IDBDatabase> {
  return (dbp ??= new Promise((res, rej) => {
    const q = indexedDB.open('sixth', 1);
    q.onupgradeneeded = () => {
      for (const s of STORES) if (!q.result.objectStoreNames.contains(s)) q.result.createObjectStore(s);
    };
    q.onsuccess = () => res(q.result);
    q.onerror = () => rej(q.error);
  }));
}
const p = <T>(r: IDBRequest<T>) =>
  new Promise<T>((a, b) => {
    r.onsuccess = () => a(r.result);
    r.onerror = () => b(r.error);
  });
export async function get<T>(s: Store, k: string): Promise<T | undefined> {
  return p((await db()).transaction(s).objectStore(s).get(k)) as any;
}
export async function put(s: Store, k: string, v: unknown) {
  const t = (await db()).transaction(s, 'readwrite');
  t.objectStore(s).put(v, k);
  return done(t);
}
export async function del(s: Store, k: string) {
  const t = (await db()).transaction(s, 'readwrite');
  t.objectStore(s).delete(k);
  return done(t);
}
export async function all<T>(s: Store, range?: IDBKeyRange): Promise<{ k: string; v: T }[]> {
  const o = (await db()).transaction(s).objectStore(s);
  const [ks, vs] = await Promise.all([p(o.getAllKeys(range)), p(o.getAll(range))]);
  return ks.map((k, i) => ({ k: String(k), v: vs[i] as T }));
}
export const done = (t: IDBTransaction) =>
  new Promise<void>((a, b) => {
    t.oncomplete = () => a();
    t.onerror = () => b(t.error);
    t.onabort = () => b(t.error ?? new Error('aborted'));
  });
export async function multi(stores: Store[], fn: (s: (n: Store) => IDBObjectStore) => void) {
  const t = (await db()).transaction(stores, 'readwrite');
  fn(n => t.objectStore(n));
  return done(t);
}
