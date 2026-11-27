# Technical architecture

## Shape

```
 UI (Preact)  ──dispatch──►  Career (vault)  ──reduce──►  Game state (plain JSON)
     ▲                           │                              │
     │                           ▼                              ▼
 HQ view / Match view      IndexedDB: sealed boxes      sim: three pure simulations
 (Three.js)                + signed header              runSim(cfg, orders) -> result
                                 │
                                 ▼
                        Replay worker (audit, peer checks, match checks)
```

## The one decision everything depends on: determinism

A career is `genesis(seed, choices)` followed by a list of actions. `reduce(state, action)` is the only way state changes. Running the same list gives the same state, byte for byte, on any machine. Saves, audits, peer verification, lockstep matches, replays and private leagues are all consequences.

How it is kept:

- Random numbers come from a seeded generator stored in the state. `Math.random` is only used for visuals.
- `Math.sin`, `exp`, `pow` and friends are not used in game or simulation code. `core/dmath.ts` builds them from + - * / and square root, which are exact everywhere.
- Keyed tables are re-sorted before every action, so a reloaded state iterates in the same order as one that has been live for hours. A test reloads at random points to prove it; without the sort that test fails.
- No sort uses a random comparator. No locale formatting in state.
- `tests/engines.mjs` runs the same code in V8 and QuickJS and compares hashes.

**If you change anything in `src/game`, `src/sim` or `src/data` that affects results, raise `RULES` in `src/game/types.ts`.** Freeze the old engine first (`src/legacy`), write a migration, and teach `src/save/replay.ts` about both. A career is then replayed under the rules each part was played with: the move from one to the next is a `#upgrade` record that carries no state, only a deterministic function of what came before. Version 0.1.0 had an "epoch" record that carried a whole state; that was a way to forge one and is gone.

## Match simulations

Ten ticks per second, no DOM. Each exposes `step`, `order`, `actors`, `ev`, `result`.

| | Model | Cost of a whole match |
|---|---|---|
| `tac.ts` | Grid navigation, line of sight, sound, smoke and wall occlusion, flashes, fire, economy, per-round strategy, executes, rotations, retakes, tilt | 0.13 to 0.23 s |
| `moba.ts` | Lanes, waves, towers, camps, boss, levels, gold as power, 20 kits, team director plus individual fight or flight | about 1 s |
| `arena.ts` | Roles, barriers, healing, ultimates, projectiles, control and escort | 0.15 to 0.22 s |

AI-only fixtures use a rating model with the same win curve, so a whole league round is instant.

## Solid bodies

`sim/grid.ts` holds walls as cells and round obstacles (barrels, pillars, towers, the payload) as circles. `push` moves a body out of both, obstacles first and walls last, so walls always win. `charge` sweeps a dash to its first contact. `ray` stops projectiles. `sim/bodies.ts` keeps bodies apart. `tests/collide.ts` measures independently, from the map, after every tick.

## The house

`game/build.ts` is pure and deterministic; the editor, the career, the audit and other managers' machines all run it.

- A plan is `{w, h, floor, wv, wh, pv, ph, items, zones}`: strings of one character per tile or wall edge, items on a half-metre grid, and zones that give a space its purpose.
- Rooms are not stored. They are found by flood fill over open edges; a second fill from the street finds what can be reached on foot; then `status` counts needs and points.
- The career takes one action, `remodel`, with a whole plan. `validate` checks every character of it, `diffCost` prices the difference to what stands, and pieces that claim to have been there already must really have been.
- `gfx/house.ts` draws a plan: one canvas for floors, one mesh for walls, one for furniture. Walls are rebuilt when the camera enters another quarter so that those in the way are low.
- `gfx/hqnav.ts` walks it: a quarter-metre lattice with the distance to the nearest solid, A* that prefers the middle of the way, straightened only where the straight line keeps its distance, and movement that is checked against the real rectangles at every step.

## Life

`game/life.ts` runs after every training block and every night, inside the same reducer and from the same random stream as everything else. `advance {step: 1}` stops after each block so the interface can show it; without `step` a day is one action; both give the same state (tested). An incident sets `life.inc` and stops `advance` until an `incident` action names one of the answers that `choices()` lists at that moment, so a replay cannot choose what was not offered. `gfx/hqlife.ts` only shows it: bubbles, walks to one another, gestures, faces, clutter, steam, smoke, water, the dark.

Who sits where is `seats` on a squad, by person and desk; `game/seats.ts` fills the rest in order.

## People

`tools/assets` turns MakeHuman data into `humans.bin`: one body per sex and outfits, hair, eyes, brows, lashes and beards, with age, weight, muscle, three groups of features, 22 face sliders and seven expressions as sparse quantised shapes, three levels of detail (meshoptimizer), and our own 16-bone weights. 3.3 MB, deflated. `gfx/human.ts` decodes it, blends the shapes once per person into a single mesh, and draws it with one shader for skin, hair, cloth, eyes and shirt. Fighters in the matches are the same people in armour built by `gfx/hero.ts`. `gfx/studio.ts` takes portraits with the game's renderer and keeps them in the cache; they are only pictures.

## Rendering

- One `WebGLRenderer`, views swapped in: HQ, match, and the creator's stage.
- **Animation** is procedural: gait driven by distance travelled, two-bone IK for legs and arms, hands locked to weapons, spring capes.
- **Props and buildings** are rounded, lathed and swept pieces merged into single draw calls. A vertex carries a material number (wood, cloth, metal, leather, ceramic, glass, leaf and more) and one shader turns it into roughness, grain and colour.
- **Effects**: GPU particles, instanced tracers, fresnel domes, point-sprite smoke and fire, pooled lights.
- **Slow machines**: in Low, the headquarters is photographed. `gfx/bake.ts` renders the still building in tiles at full quality, with shadows, ambient occlusion, bloom and film response, and moving people are drawn over it with the depth it left behind. Match maps get the same from above (`topbake.ts`), and the creator refines its picture when nothing moves (`cast.ts`).
- **Quality**: Low (the above; for software or very weak GPUs), Medium (shadow maps, bloom), High (ambient occlusion, SMAA, larger shadows), Ultra. Auto picks and adapts.

## Size

3.3 MB of JavaScript (1.2 MB gzipped, a good part of it the frozen rules 1 and 2 and the audit worker), 3.3 MB of people and 1.9 MB of their textures, 87 KB of styles, the fonts. The single-file build is 11 MB. Nothing is loaded from anywhere else.

On a four-core machine without a graphics card (everything drawn by the processor, 1280 by 717) the headquarters runs at 15 to 19 pictures a second and matches at 8 to 9. These are counted pictures, not the smoothed figure in Settings.

## Browser needs

WebGL 2, IndexedDB, WebCrypto, Web Workers, Web Locks, CompressionStream. Current Chrome, Edge, Firefox and Safari have them. Tested here in Chromium only.
