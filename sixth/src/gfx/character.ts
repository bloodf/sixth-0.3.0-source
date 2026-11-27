import * as THREE from 'three';
import { lowLit } from './engine.ts';
import { bodyGeo, charMaterial, palArr, type BodyDef, type Palette } from './body.ts';
import { Rig, type Hold } from './rig.ts';
import { holdOf, prop } from './props.ts';
import type { Look as HeroLook } from '../data/heroes.ts';
import type { Look } from '../game/types.ts';
import { heroGeo } from './hero.ts';
import { humanGeo, humanMaterial, LIB, type Spec } from './human.ts';
export const SKINS = ['#f2cfb3', '#e8b994', '#d8a176', '#bd8257', '#96613e', '#6d4530', '#4f3122'];
export const HAIRS = [
  '#15110f',
  '#241a15',
  '#3a2719',
  '#5b3a22',
  '#7d5430',
  '#a9793f',
  '#c9a25e',
  '#8d3a1e',
  '#d9d3c7',
  '#3c6fd1',
  '#c43f7a',
  '#3fae7a',
];
/** what a manager's clothes are cut from */
export const CLOTH = ['#2a2e35', '#1d2740', '#5a6068', '#8a7355', '#15171a', '#ddd8cc', '#4f1f28', '#26443a', '#7f9bb5', '#a7483a'];
let propMat: Record<string, THREE.Material> = {};
export const resetCharMaterials = () => {
  propMat = {};
};
const pm = (low: boolean, glow: boolean) =>
  (propMat[`${low}${glow}`] ??= glow
    ? new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new THREE.Color(2, 2, 2) })
    : low
      ? lowLit(new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }))
      : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.25 }));
export class Character {
  root = new THREE.Group();
  rig = new Rig();
  mesh: THREE.SkinnedMesh;
  mat: THREE.Material & { uniformsX: any };
  weapon: THREE.Group | null = null;
  weapon2: THREE.Group | null = null;
  flash = 0;
  scale: number;
  blob: THREE.Mesh | null = null;
  weaponKind = '';
  spec: Spec | null = null;
  hero: HeroLook | null = null;
  constructor(
    public low: boolean,
    def: BodyDef,
    public pal: Palette,
    o: {
      scale?: number;
      hold?: Hold;
      shadow?: boolean;
      cell?: number;
      human?: Spec;
      hero?: HeroLook;
      lod?: 0 | 1 | 2;
      keep?: boolean;
    } = {},
  ) {
    if (o.human && LIB) {
      this.spec = o.human;
      this.lod = o.lod ?? 1;
      this.mat = humanMaterial(low, palArr(pal), o.human);
      this.hero = o.hero ?? null;
      this.mesh = new THREE.SkinnedMesh(
        o.hero ? heroGeo(o.hero, o.human, (o.lod ?? 1) as 1 | 2) : humanGeo(o.human, o.lod ?? 1, o.keep ?? true),
        this.mat,
      );
    } else {
      this.mat = charMaterial(low, palArr(pal));
      this.mesh = new THREE.SkinnedMesh(bodyGeo(def, o.cell ?? (low ? 0.05 : 0.032)), this.mat);
    }
    this.rig.attach(this.mesh);
    if (this.mat.uniformsX.uBones) this.mat.uniformsX.uBones.value = this.mesh.skeleton.boneMatrices;
    this.mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.95, 0), 1.25);
    this.mesh.computeBoundingSphere = () => {};
    this.mesh.castShadow = o.shadow ?? !low;
    this.mesh.receiveShadow = false;
    this.root.add(this.mesh);
    this.scale = o.scale ?? 1;
    this.root.scale.setScalar(this.scale);
    this.rig.hold = o.hold ?? 'none';
  }
  setWeapon(kind: string, c1: string, c2: string, glow: string) {
    if (this.weaponKind === kind) return;
    this.weaponKind = kind;
    for (const w of [this.weapon, this.weapon2]) if (w) this.root.remove(w);
    this.weapon = this.weapon2 = null;
    if (kind === 'none') return;
    const mk = () => {
      const p = prop(kind, c1, c2, glow);
      const g = new THREE.Group();
      if (!p) return g;
      const m = new THREE.Mesh(p.g, pm(this.low, false));
      m.castShadow = !this.low;
      g.add(m);
      if (p.glow) g.add(new THREE.Mesh(p.glow, pm(this.low, true)));
      g.matrixAutoUpdate = false;
      return g;
    };
    this.weapon = mk();
    this.root.add(this.weapon);
    if (kind === 'daggers' || kind === 'pistols') {
      this.weapon2 = mk();
      this.root.add(this.weapon2);
    }
  }
  private lod: 0 | 1 | 2 = 1;
  /** fewer triangles from far away */
  setLod(l: 0 | 1 | 2) {
    if (!this.spec || this.hero || l === this.lod) return;
    this.lod = l;
    this.mesh.geometry = humanGeo(this.spec, l);
  }
  update(dt: number, t: number) {
    this.rig.update(dt, t);
    if (this.weapon) {
      this.weapon.matrix.copy(this.rig.weapon);
      this.weapon.matrixWorldNeedsUpdate = true;
    }
    if (this.weapon2) {
      this.weapon2.matrix.copy(this.rig.weaponL);
      this.weapon2.matrixWorldNeedsUpdate = true;
    }
    this.flash *= Math.exp(-dt * 9);
    this.mat.uniformsX.uFlash.value = this.flash;
  }
  dispose() {
    this.mat.dispose();
    this.rig.skeleton.dispose();
  }
}
/** the human inside a fighter */
function heroSpec(l: HeroLook, id: string): Spec {
  const fem = /priest|archer|light|mage/.test(l.body) && id.length % 2 === 0;
  let h = 7;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 9973;
  const rnd = (k: number) => (((h * (k + 3) * 7919) % 1000) / 500 - 1) * 0.7;
  const race = h % 5 === 0 ? [1, 0, 0] : h % 5 === 1 ? [0, 1, 0] : [0, 0, 1];
  const mil = l.body === 'soldier' || l.body === 'operator';
  return {
    g: fem ? 'female' : 'male',
    race: race as [number, number, number],
    old: l.body === 'robe' || (l.body === 'mage' && l.head === 'hat') ? 0.7 : 0.1,
    heavy: l.body === 'brute' ? 0.55 : 0,
    thin: l.body === 'rogue' || l.body === 'archer' ? 0.4 : 0,
    muscle: /brute|knight|beast|mech|soldier/.test(l.body) ? 1 : 0.35,
    face: Array.from({ length: 22 }, (_, i) => rnd(i)),
    ex: l.body === 'brute' || l.body === 'beast' ? { angry: 0.9 } : { angry: 0.3 },
    skin: l.body === 'beast' ? l.c2 : SKINS[h % 6],
    hair:
      l.head === 'bare' || l.head === 'crown' || l.head === 'horns' || l.head === 'antlers'
        ? fem
          ? ['h_long', 'h_pony', 'h_braid', 'h_bob2'][h % 4]
          : ['h_short1', 'h_short2', 'h_short4', 'h_hawk'][h % 4]
        : '',
    hairC: '#2a1d14',
    beard: !fem && (l.body === 'brute' || l.body === 'robe' || (l.body === 'knight' && h % 2 === 0)) ? 'beard' : '',
    stubble: 0.3,
    brow: h % 4,
    eye: h % 8,
    glasses: false,
    outfit: fem ? 'tee_f' : mil ? 'jacket_m' : l.body === 'brute' || l.body === 'beast' ? 'tee_m' : 'long_m',
    shoes: 'smart',
  };
}
export function heroCharacter(
  low: boolean,
  l: HeroLook,
  team: string,
  opts: { scale?: number; id?: string; pal?: Partial<Palette>; lod?: 1 | 2 } = {},
): Character {
  const mix = (a: string, b: string, t: number) => '#' + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString();
  const pal: Palette = {
    skin: l.body === 'mech' ? l.c2 : l.body === 'beast' ? l.c2 : '#d8a176',
    hair: mix(l.c2, '#1a1410', 0.7),
    main: l.c1,
    second: l.c2,
    pants: mix(l.c1, '#15171a', 0.55),
    shoes: '#4a3526',
    glove: mix(l.c2, '#2a2320', 0.6),
    metal: mix('#c3cad2', l.c2, 0.25),
    dark: '#2b3036',
    glow: l.glow,
    accent: team,
    light: '#efe7d6',
    ...opts.pal,
  };
  const human = LIB ? heroSpec(l, opts.id ?? l.c1 + l.c2 + l.head) : undefined;
  const c = new Character(low, { outfit: l.body, head: l.head, cape: !!l.cape }, pal, {
    scale: (l.s ?? 1) * (opts.scale ?? 1),
    hold: holdOf(l.prop),
    human,
    hero: l,
    lod: opts.lod,
  });
  c.setWeapon(l.prop, l.c1, l.c2, l.glow);
  return c;
}
export function civPalette(k: Look, main: string, second: string, accent: string): Palette {
  return {
    skin: SKINS[k.skin] ?? SKINS[2],
    hair: HAIRS[k.hairC] ?? HAIRS[0],
    main,
    second,
    pants: ['#2a3140', '#23262b', '#3a3f4a', '#4a4238'][k.face % 4],
    shoes: ['#e8e6e1', '#26282c', '#b8433a'][k.nose % 3],
    glove: '#333',
    metal: '#9aa3ad',
    dark: '#23272c',
    glow: accent,
    accent,
    light: '#f0efe9',
  };
}
export const civHead = (k: Look): BodyDef['head'] =>
  k.fem
    ? (['hair2', 'hair3', 'hair2', 'hair4', 'hair1', 'hair3'] as const)[k.hair % 6]
    : (['hair0', 'hair1', 'hair5', 'hair4', 'hair0', 'hair1', 'hair5', 'bald', 'hair0', 'hair1'] as const)[k.hair % 10];
