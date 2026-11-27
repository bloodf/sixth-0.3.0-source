import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Character, civPalette } from '../src/gfx/character.ts';
import { loadHumans } from '../src/gfx/human.ts';
import { specOf } from '../src/gfx/look.ts';
import { genLook } from '../src/game/gen.ts';
import { Rng } from '../src/core/rng.ts';
const q = new URLSearchParams(location.search);
const r = new THREE.WebGLRenderer({ canvas: document.getElementById('c') as any, antialias: true, preserveDrawingBuffer: true });
r.setSize(innerWidth, innerHeight, false);
r.shadowMap.enabled = true;
r.shadowMap.type = THREE.PCFSoftShadowMap;
r.toneMapping = THREE.ACESFilmicToneMapping;
const sc = new THREE.Scene();
sc.background = new THREE.Color('#2a3238');
sc.environment = new THREE.PMREMGenerator(r).fromScene(new RoomEnvironment(), 0.04).texture;
sc.environmentIntensity = 0.35;
const cam = new THREE.PerspectiveCamera(24, innerWidth / innerHeight, 0.1, 100);
const key = new THREE.DirectionalLight('#fff1df', 2.6);
key.position.set(3, 5, 5);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
const rim = new THREE.DirectionalLight('#9fc4ff', 2.2);
rim.position.set(-4, 3, -4);
sc.add(key, rim, new THREE.HemisphereLight('#cfdbe8', '#4a4038', 0.5));
await loadHumans();
const R = Rng.of(q.get('seed') ?? 'x');
const close = q.get('close');
const lod = (close ? 0 : +(q.get('lod') ?? 0)) as 0 | 1;
const N = +(q.get('n') ?? (close ? 5 : 9));
const fits = ['tee', 'tee', 'polo', 'long', 'jacket', 'shirt', 'suit', 'work', 'tee'] as const;
const acts = (q.get('acts') ?? 'idle').split(',');
const nats = ['DK', 'KR', 'BR', 'US', 'SE', 'CN', 'US', 'FR', 'BR'];
const C: Character[] = [];
for (let i = 0; i < N; i++) {
  const l = genLook(R, nats[i % 9], i % 3 === 1);
  if (i % 4 === 2) l.skin = 5;
  const s = specOf(l, 'p' + i, { outfit: fits[i % 9], age: 19 + i * 3, mood: q.get('mood') ? { [q.get('mood')!]: 1 } : {} });
  const c = new Character(
    q.get('low') === '1',
    { outfit: 'civil', head: 'hair0', cape: false, headset: false } as any,
    civPalette(l, '#1f7f86', '#ffb23e', '#1f7f86'),
    { human: s, lod },
  );
  const sp = close ? 0.42 : 0.8;
  c.root.position.set((i - (N - 1) / 2) * sp, 0, 0);
  c.root.rotation.y = close ? 0.25 : 0.3 - i * 0.07;
  c.rig.act = acts[i % acts.length] as any;
  if (c.rig.act === 'move') c.rig.speed = 1.6;
  sc.add(c.root);
  C.push(c);
}
const fl = new THREE.Mesh(
  new THREE.PlaneGeometry(30, 30).rotateX(-Math.PI / 2),
  new THREE.MeshStandardMaterial({ color: '#5a636a', roughness: 0.7 }),
);
fl.receiveShadow = true;
sc.add(fl);
if (close) {
  cam.position.set(0, 1.66, 5.2);
  cam.lookAt(0, 1.62, 0);
  cam.fov = close === '2' ? 10 : 20;
  cam.updateProjectionMatrix();
} else {
  cam.position.set(0, 1.5, 9.2);
  cam.lookAt(0, 0.92, 0);
}
let t = 0;
for (let k = 0; k < 60; k++) for (const c of C) c.update(0.05, (t += 0.05));
r.render(sc, cam);
(window as any).info = () => r.info.render.triangles;
