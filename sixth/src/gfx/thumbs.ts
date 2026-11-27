/** Small pictures for the build catalogue, rendered once and kept. */
import * as THREE from 'three';
import { Kit } from './kit.ts';
import { furniture } from './furniture3d.ts';
import { floorCanvas, geoOf, Heights, stuff, walls, type Club } from './house.ts';
import { Draft, template } from '../game/build.ts';
import { FURN } from '../data/furniture.ts';
import type { RoomType } from '../data/club.ts';
const urls = new Map<string, string>();
let r: THREE.WebGLRenderer | null = null;
let sc: THREE.Scene, cam: THREE.OrthographicCamera;
let mats: { vc: THREE.Material; glow: THREE.Material } | null = null;
let idle: any = 0;
function setup(w: number, h: number) {
  if (!r) {
    r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    r.outputColorSpace = THREE.ColorManagement.enabled ? THREE.SRGBColorSpace : THREE.LinearSRGBColorSpace;
    sc = new THREE.Scene();
    cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    const k = new THREE.DirectionalLight('#fff6e8', THREE.ColorManagement.enabled ? 2.4 : 1.5);
    k.position.set(3, 6, 4);
    sc.add(k, new THREE.HemisphereLight('#eaf2f8', '#7c7468', THREE.ColorManagement.enabled ? 1.5 : 1.7));
    mats = { vc: new THREE.MeshLambertMaterial({ vertexColors: true }), glow: new THREE.MeshBasicMaterial({ vertexColors: true }) };
  }
  r.setPixelRatio(1);
  r.setSize(w, h, false);
  clearTimeout(idle);
  idle = setTimeout(() => {
    r?.dispose();
    r?.forceContextLoss();
    mats?.vc.dispose();
    mats?.glow.dispose();
    r = null;
  }, 15000);
}
function shoot(o: THREE.Object3D, w: number, h: number, yaw: number, pitch: number): string {
  sc.add(o);
  const b = new THREE.Box3().setFromObject(o);
  const c = b.getCenter(new THREE.Vector3());
  const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
  cam.position.copy(c).addScaledVector(dir, 40);
  cam.lookAt(c);
  cam.updateMatrixWorld();
  // fit the eight corners
  let mx = 0.2,
    my = 0.2;
  const v = new THREE.Vector3();
  for (let i = 0; i < 8; i++) {
    v.set(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z).applyMatrix4(cam.matrixWorldInverse);
    mx = Math.max(mx, Math.abs(v.x));
    my = Math.max(my, Math.abs(v.y));
  }
  const k = Math.max(mx / w, my / h) * 1.08;
  cam.left = -k * w;
  cam.right = k * w;
  cam.top = k * h;
  cam.bottom = -k * h;
  cam.updateProjectionMatrix();
  r!.render(sc, cam);
  const u = r!.domElement.toDataURL('image/png');
  sc.remove(o);
  o.traverse(q => (q as THREE.Mesh).geometry?.dispose());
  return u;
}
const tag = (k: Club) => [k.c1, k.c2, k.c3, THREE.ColorManagement.enabled].join();
export function itemThumb(id: string, k: Club): string {
  const key = id + tag(k);
  const u = urls.get(key);
  if (u) return u;
  setup(132, 104);
  const b = furniture(id, { ...k, wall: 2.5 });
  const g = new THREE.Group();
  const geo = geoOf([...b.p], [...b.n], [...b.c]);
  if (geo) g.add(new THREE.Mesh(geo, mats!.vc));
  const gl = geoOf([...b.gp], null, [...b.gc]);
  if (gl) g.add(new THREE.Mesh(gl, mats!.glow));
  for (const s of b.scr) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(s.w, s.h), new THREE.MeshBasicMaterial({ color: '#3f7f92' }));
    m.position.set(s.x, s.y, s.z);
    m.rotation.set(s.rx ?? 0, s.ry, 0, 'YXZ');
    g.add(m);
  }
  // things that face their seat are shown from the seat's side
  const out = shoot(g, 132, 104, FURN[id].wall ? 0.35 : 0.62, 0.5);
  urls.set(key, out);
  return out;
}
export function roomThumb(type: RoomType, lvl: number, k: Club): string {
  const key = type + lvl + tag(k);
  const u = urls.get(key);
  if (u) return u;
  setup(168, 118);
  const t = template(type, lvl);
  const d = Draft.empty(t.w + 2, t.h + 2);
  d.preset(type, lvl, 1, 1, type === 'practice' ? 'cs2' : undefined);
  const H = new Heights(d, true, true, 'cut', false);
  const g = new THREE.Group();
  const kit = new Kit();
  walls(kit, d, H, k, 1, true);
  g.add(new THREE.Mesh(kit.geo(), mats!.vc));
  const s = stuff(d, H, k, new Map(), true, null);
  if (s.geo) g.add(new THREE.Mesh(s.geo, mats!.vc));
  if (s.glow) g.add(new THREE.Mesh(s.glow, mats!.glow));
  for (const q of s.scr) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(q.w, q.h), new THREE.MeshBasicMaterial({ color: '#3f7f92' }));
    m.position.set(q.wx, q.y, q.wz);
    m.rotation.set(q.rx ?? 0, q.wry, 0, 'YXZ');
    g.add(m);
  }
  const cv = document.createElement('canvas');
  floorCanvas(d, cv, 14, k, 1);
  const tx = new THREE.CanvasTexture(cv);
  tx.colorSpace = THREE.ColorManagement.enabled ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tx.repeat.set(t.w / (t.w + 2), t.h / (t.h + 2));
  tx.offset.set(1 / (t.w + 2), 1 / (t.h + 2));
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(t.w, t.h).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: tx }));
  fl.position.set(1 + t.w / 2, 0.005, 1 + t.h / 2);
  g.add(fl);
  const out = shoot(g, 168, 118, 0.62, 0.72);
  tx.dispose();
  urls.set(key, out);
  return out;
}
