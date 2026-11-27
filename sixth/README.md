# SIXTH: Esports Manager

Five play. You are the sixth.

A browser-only esports management game. You run the club: squads, training, staff, equipment, transfers, sponsors and tactics. You build the house it all happens in, and you live with the people in it. Matches are simulated and shown live in 3D on a tabletop arena. Careers are encrypted on your device and any change made to them from outside is detected. Online play is peer to peer, with no game server.

Free software under the AGPL (see the end). Version 0.3.0, rules version 3. Careers from 0.1.0 and 0.2.0 open and continue.

## Run it

| What | How |
|---|---|
| Play now, nothing to install | Open `dist-single/index.html` in Chrome or Edge (only Chromium has been tested) |
| Play from a local server | `npx vite preview` then open http://localhost:4173 |
| Develop | `npm install` then `npm run dev` (port 5173) |
| Build | `npm run build` (dist/), `npm run build:single` (one HTML file) |
| Host it | Upload `dist/` to any static host that serves HTTPS |

Each address (file, localhost, your domain) is its own browser profile: saves and identity do not travel between them. Use Settings, Download backup.

## Tests

| Command | What it proves |
|---|---|
| `npm test` | Hashing, map navigation, a full career replays bit for bit, reloading never changes the future, four economies over four seasons, the house editor's rules, careers crossing rule versions, people walking a kilometre or two in ten buildings without touching a wall, and life in the house: three months block by block equal three months in one go, every incident met with every answer, desks, rules, care. Takes about five minutes |
| `npm run test:collide` | Whole matches on all ten maps: nobody enters or crosses anything solid |
| `npm run test:drawn` | The same for what is drawn on screen, frame by frame (needs `npm run dev`) |
| `npm run test:editor` | The house editor with a real mouse in a real browser (needs `npm run dev`) |
| `node tests/engines.mjs` | Matches and a career give identical hashes in V8 and QuickJS, two different JavaScript engines. Add `full` for complete matches |
| `npm run bench` | Win rates, durations and timings of the three match simulations |
| `npm run test:tamper` | 26 attacks and innocent cases against the save vault and backups, in a real browser (needs `npm run dev`) |
| `python3 tests/upgrade.py <dist of 0.1.0 or 0.2.0> dist` | A save written by an older version opens in this one, encrypted, ranked and with a passing audit |
| `npm run test:p2p` | Two browsers: discovery, verified match in lockstep, signed ladder record, private league (needs `npm run dev` and `npm run relay`) |
| `python3 tests/p2p.py direct` / `room cheat` | Same over pasted codes; and an opponent with doctored ratings being refused |

## Where things are

| Folder | Contents |
|---|---|
| `src/core` | Seeded random, deterministic maths, SHA-256, canonical JSON |
| `src/data` | Games, roles, heroes, rooms, staff, gear, sponsors, names, generated icons |
| `src/game` | The career as a pure reducer: genesis, actions, days, leagues, events, match set-up. `build.ts` is the house editor's model, `life.ts` the people, `incidents.ts` what goes wrong, `seats.ts` the desks |
| `src/legacy` | The rules of 0.1.0 and 0.2.0, frozen, so that old careers can still be verified. Never edit |
| `src/sim` | The three match simulations and the ten maps. No rendering, no DOM |
| `src/gfx` | Three.js: engine, characters, animation, HQ, furniture, maps, arena, effects, match director. `human.ts` is people, `studio.ts` their portraits, `cast.ts` the creator's stage, `bake.ts` the slow-machine renderer, `hqnav.ts` walking and `hqlife.ts` living at the headquarters |
| `src/assets` | Bodies, clothes, hair and skin built from MakeHuman by `tools/assets` |
| `src/audio` | Synthesised effects and music |
| `src/save` | IndexedDB, crypto, the vault, the replay worker |
| `src/p2p` | Transport, session, ladder, private leagues, verification jobs |
| `src/ui` | Preact screens and styles |
| `docs` | Design, architecture, anti-cheat, P2P, roadmap, brand book, screenshots |

## Documents

1. [Game design](docs/01-game-design.md)
2. [Screens and interface](docs/02-screens-and-interface.md)
3. [Technical architecture](docs/03-technical-architecture.md)
4. [Anti-cheat](docs/04-anti-cheat.md)
5. [P2P and leagues](docs/05-p2p-and-leagues.md)
6. [Roadmap](docs/06-roadmap.md)
7. [Brand book](docs/brand/index.html)

## Building the people again

The files in `src/assets` are generated. To rebuild them: `npm pack makehuman-data`, unpack it to `/tmp/mh`, then `python3 tools/assets/humans.py /tmp/hraw`, `node tools/assets/pack.mjs /tmp/hraw src/assets/humans.bin` and `python3 tools/assets/tex.py src/assets/tex`. Needs Python with numpy, scipy and Pillow. `tools/assets/parts.json` says which clothes and hair are taken.

## Licence

GNU Affero General Public License, version 3 or any later version: see [LICENSE](LICENSE). The MakeHuman data the people are made from is under the same licence, which settles the choice; it also fits a game with online play, because whoever runs a changed copy for others has to offer them the changed source. If you host it, put a link to your source where players can find it. [CREDITS.md](CREDITS.md) lists the parts used and carries the note on game titles.
