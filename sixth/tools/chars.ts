import * as THREE from 'three';
import { Engine } from '../src/gfx/engine.ts';
import { Character, heroCharacter, civPalette, civHead } from '../src/gfx/character.ts';
import { MOBA, OW, AGENTS } from '../src/data/heroes.ts';
import { loadHumans } from '../src/gfx/human.ts';
await loadHumans();
const q = new URLSearchParams(location.search);
const cv = document.getElementById('c') as HTMLCanvasElement;
const en = new Engine(cv, (q.get('q') as any) ?? 'medium');
en.resize(innerWidth, innerHeight);
const sc = new THREE.Scene();
sc.background = new THREE.Color('#5b6f78');
const cam = new THREE.PerspectiveCamera(32, 1, 0.1, 200);
const n = +(q.get('n') ?? 0);
const L: Character[] = [];
const low = en.q === 'low';
const sun = new THREE.DirectionalLight('#fff2dd', 3);
sun.position.set(6, 12, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
const c = sun.shadow.camera;
c.left = -16;
c.right = 16;
c.top = 16;
c.bottom = -16;
sc.add(sun, new THREE.HemisphereLight('#cfe3ff', '#6a5a4a', 1.1));
const fl = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), en.mat({ color: '#8a949a' }));
fl.rotation.x = -Math.PI / 2;
fl.receiveShadow = true;
sc.add(fl);
const set = q.get('set') ?? 'moba';
const acts = (q.get('acts') ?? 'idle,move,attack,cast,shoot,dead,ult,stun').split(',');
const hs: any[] = set === 'moba' ? MOBA : set === 'ow' ? OW : set === 'val' ? AGENTS : [];
const add = (ch: Character, i: number, act: string) => {
  const col = i % 8,
    row = Math.floor(i / 8);
  ch.root.position.set((col - 3.5) * 1.7, 0, row * 2.2 - 2);
  ch.rig.act = act as any;
  ch.rig.speed = act === 'move' ? 4.6 : 0;
  (ch as any).a = act;
  ch.root.rotation.y = 0.3;
  sc.add(ch.root);
  L.push(ch);
};
if (hs.length) hs.forEach((h, i) => add(heroCharacter(low, h.look, '#2b6cb0'), i, acts[i % acts.length]));
else {
  const A = [
    'idle',
    'move',
    'type',
    'sit',
    'lift',
    'cook',
    'talk',
    'cheer',
    'yoga',
    'bench',
    'pingpong',
    'slump',
    'aim',
    'shoot',
    'plant',
    'throw',
    'dead',
    'blind',
  ];
  A.forEach((a, i) => {
    const lk: any = { skin: i % 7, hair: i % 12, hairC: i % 10, face: i, nose: i, fem: i % 3 === 2 };
    const mil = i > 11;
    const ch = new Character(
      low,
      {
        outfit: mil ? 'soldier' : i % 4 === 1 ? 'hoodie' : i === 5 ? 'chef' : i % 5 === 4 ? 'coat' : 'civil',
        head: mil ? 'helm' : civHead(lk),
        cape: false,
        headset: a === 'type',
      },
      civPalette(lk, '#1f6f8b', '#f2b441', '#ff5a4a'),
      { hold: mil ? 'rifle' : 'none' },
    );
    if (mil) ch.setWeapon(i % 2 ? 'rifle' : 'awp', '#556', '#987', '#6cf');
    add(ch, i, a);
  });
}
const z = +(q.get('z') ?? 13);
cam.position.set(0, z * 0.62, z);
cam.lookAt(0, 0.8, 0.5);
en.setView({
  scene: sc,
  camera: cam,
  exposure: 1,
  update(dt, t) {
    for (const ch of L) {
      const a = (ch as any).a;
      if ((a === 'attack' || a === 'throw') && ch.rig.actT > 1.1) {
        ch.rig.actT = 0;
      }
      ch.update(dt, t);
    }
  },
});
(window as any).ready = 1;
(window as any).fps = () => en.fps;
