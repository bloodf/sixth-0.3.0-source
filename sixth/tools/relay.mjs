// A tiny Nostr relay for local play and tests: node tools/relay.mjs [port]. Keeps nothing on disk.
import { WebSocketServer } from 'ws';
const port = +(process.argv[2] ?? 7777);
const wss = new WebSocketServer({ port, host: process.argv[3] ?? '127.0.0.1' });
const subs = new Map();
const ok = (f, e) =>
  (!f.kinds || f.kinds.includes(e.kind)) &&
  (!f.since || e.created_at >= f.since) &&
  Object.entries(f).every(([k, v]) => k[0] !== '#' || e.tags.some(t => t[0] === k.slice(1) && v.includes(t[1])));
wss.on('connection', ws => {
  subs.set(ws, new Map());
  ws.on('message', m => {
    let a;
    try {
      a = JSON.parse(m);
    } catch {
      return;
    }
    const s = subs.get(ws);
    if (a[0] === 'REQ') {
      s.set(a[1], a.slice(2));
      ws.send(JSON.stringify(['EOSE', a[1]]));
    } else if (a[0] === 'CLOSE') s.delete(a[1]);
    else if (a[0] === 'EVENT') {
      ws.send(JSON.stringify(['OK', a[1].id, true, '']));
      for (const [w, q] of subs) for (const [id, fs] of q) if (fs.some(f => ok(f, a[1]))) w.send(JSON.stringify(['EVENT', id, a[1]]));
    }
  });
  ws.on('close', () => subs.delete(ws));
  ws.on('error', () => {});
});
console.log('relay on ws://127.0.0.1:' + port);
