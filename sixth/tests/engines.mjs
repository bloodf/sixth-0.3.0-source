// Runs the same matches and the same career in V8 and in QuickJS (a different JavaScript engine) and compares hashes.
// If this passes, two managers on different browsers will agree on every result.
import { build } from 'esbuild';
import { getQuickJS } from 'quickjs-emscripten';
const FULL = process.argv[2] === 'full';
globalThis.__FULL = FULL;
const r = await build({
  entryPoints: ['tests/engine-entry.ts'],
  bundle: true,
  write: false,
  format: 'iife',
  target: 'es2020',
  minify: true,
});
const js =
  `globalThis.__FULL=${FULL};if(typeof TextEncoder==='undefined'){globalThis.TextEncoder=class{encode(s){const o=[];for(let i=0;i<s.length;i++){let c=s.codePointAt(i);if(c>0xffff)i++;if(c<128)o.push(c);else if(c<2048)o.push(192|c>>6,128|c&63);else if(c<65536)o.push(224|c>>12,128|c>>6&63,128|c&63);else o.push(240|c>>18,128|c>>12&63,128|c>>6&63,128|c&63)}return new Uint8Array(o)}}}` +
  r.outputFiles[0].text;
(0, eval)(js);
const q = await getQuickJS();
const vm = q.newContext();
vm.runtime.setMemoryLimit(1 << 30);
vm.runtime.setMaxStackSize(1 << 20);
const e = vm.evalCode(js);
if (e.error) {
  console.log(vm.dump(e.error));
  process.exit(1);
}
let bad = 0;
for (let i = 0; i < globalThis.__parts.length; i++) {
  const a = globalThis.__parts[i]();
  const t = Date.now();
  const x = vm.evalCode(`__parts[${i}]()`);
  if (x.error) {
    console.log(vm.dump(x.error));
    bad++;
    continue;
  }
  const b = vm.dump(x.value);
  if (a !== b) bad++;
  console.log(a === b ? 'SAME     ' : 'DIFFERENT', a, a === b ? '' : b, (((Date.now() - t) / 1000) | 0) + 's in QuickJS');
}
console.log(bad ? bad + ' differ' : 'All identical across engines');
process.exit(bad ? 1 : 0);
