# Game design

Status marks: **built** is in this version. **next** is in the roadmap.

## One paragraph

You manage an esports club from a rented flat to a campus. Pick one game or several; each has its own squad, training week, tactics, practice room and league pyramid. You never touch the controls in a match. You choose the people, the preparation, the building and the calls from the bench.

"Fantasy-like" means fantasy-sport, in the line of Football Manager (confirmed). The disciplines keep their real titles.

## The loop (built)

1. **Day.** Three training blocks. Players walk to the room where the block happens, talk, argue, eat, wash or do not. A block can be stopped by an incident.
2. **Week.** Monday pays wages, rent, upkeep, sponsors and shirts. Offers and bids arrive.
3. **Match day.** League rounds are weekly per game: Overwatch Thursday, Valorant Friday, CS2 Saturday, Dota 2 Sunday.
4. **Season.** 13 weeks: one of preparation, nine rounds, semi-final, final, World Masters. Four seasons make a year.
5. **Career.** Promotion, relegation, ageing, contracts, trophies, moving house, or bankruptcy after four weeks overdrawn.

## Disciplines (built)

| | CS2 class | Valorant class | Dota 2 class | Overwatch class |
|---|---|---|---|---|
| Format | First to 13, overtime | First to 13, overtime | Destroy the core | Control best of 3, or escort |
| Roles | IGL, entry, AWPer, lurker, support | Duelist, initiator, controller, sentinel, flex | Carry, mid, offlane, two supports | Tank, hitscan, flex DPS, two supports |
| Cast | Guns, grenades, bomb | 12 agents with kits and ultimates | 20 heroes, items as gold power, river boss | 12 heroes with ultimates |
| Maps | Kasbah, Foundry, Quarry | Halcyon, Terrace, Arcade | The Old Vale, Ashmere | Solstice, Meridian Line |
| Length at 1x | about 18 min | about 19 min | about 16 min | about 7 min |
| Bench calls | Round strategy, setup, buy, 3 timeouts | Same | Push, farm, hunt, defend, boss, 1 pause | Group, engage, back off, ultimates, 2 pauses |

All run at 1x, 2x, 4x or 8x, or skip to the end. Every match can be delegated to the coach.

## Players (built)

- Twelve attributes in four groups: hands, head, team, nerve. Each role weighs them differently.
- Energy, stress, morale, form, injuries. All of them change match performance.
- Ceiling, age curve, twelve traits, fame, contract, career record.
- You see ranges until scouts narrow them.
- Negotiation: hidden ask, three tries, then they walk for two weeks. Buyouts for contracted players. AI clubs bid for yours.

## Preparation (built)

- Weekly grid, 7 days by 3 blocks: scrim, aim lab, tactics, VOD, physical, mind, team time, stream, rest. Three intensities.
- Tactics: tempo, structure, risk, focus. Changing them costs familiarity. Familiarity and synergy feed the simulation.
- Hero and agent picks per role.

## The club (built)

- **HQ.** Four sites, each with land to buy around it. A house editor in the manner of The Sims: see below.
- **Staff.** Head coach per squad, analyst, psychologist, physiotherapist, performance trainer, chef, IT technician, scout, content lead, partnerships lead, housekeeper. Each needs its room to work fully.
- **Equipment.** Six slots per station: PC or console, monitor, mouse, keyboard, headset, chair. Five models each, wear, service, trade-in.
- **Money.** Four sponsor slots with targets, prize money, shirts, streams, loans.
- **Brand.** Crest editor, shirt designer on a 3D mannequin, colours, motto, away shirt.
- **People.** Twelve kinds of event with choices: arguments, burnout, viral clips, match-fixing approaches, flu, landlords.

## The house (built)

A headquarters is land, floor, walls and furniture on a one-metre grid. Nothing is a prefabricated block: a room is any space with walls all round and a way in from the street, and its purpose is whatever you say it is.

| Part | How it works |
|---|---|
| Land | Buy or give back strips on any of the four sides, up to what the site allows: 24 × 18 for the flat, 60 × 44 for the campus. Extra land costs once and every week |
| Rooms | Drag a rectangle, or stamp one of 39 ready-made rooms. Stretch any side, move a room with everything in it, split it with a wall, tear it down |
| Walls | Single walls, fences, doors, windows, ten paints. A painted wall can be brick or timber |
| Floors | Fourteen, by the area or by the whole room |
| Furniture | 92 pieces in twelve groups. They turn, copy, move and sell. Wall pieces find their wall, rugs lie under things, garden pieces stand outside |
| Purpose | Thirteen, the bathroom being the latest. Each asks for a minimum size and certain pieces (a practice room: 28 tiles and five stations) |
| Level | One when the needs are met. Two and three from points: what stands in it, space, a better floor, paint. The fourth copy of anything counts a quarter |
| Money | The plan costs nothing until you press Build. Furniture sells for 60%, walls 40%, floors 30%. A test tries to earn money by building and undoing, and cannot |

| Desks | In Seating, or on a selected desk in the editor, choose who sits where. People mostly talk to whoever is an elbow away, so seating makes friends and enemies |

Build is on the home screen, on the B key, and on every room you click.

## Life in the house (built)

Everybody who lives or works here has needs, a temper, two or three quirks and an opinion of everybody else. All of it is in the same deterministic state as the money, so it replays and verifies like the rest.

| Part | How it works |
|---|---|
| Needs | Food, washing, fun, company, and anger. They fall with time and work, and rise with what people do about them |
| Feelings | Calm, happy, buzzing, tired, hungry, low, on edge, disgusted, angry, furious. Shown on faces, over heads, on portraits. Sessions are better or worse for it, and so are matches |
| Quirks | Twenty: soap is optional, tidy to the bone, no indoor voice, short fuse, prankster, peacemaker, never wrong, homesick and more. They collide |
| Talk | People who share a room, or a desk edge, talk: tactics, football, home, money. They make each other laugh, teach tricks, gossip, comfort, snap, fight. Relations run from enemies to inseparable |
| Dirt | Kitchens, floors and bathrooms get dirty. Tidy people clean and resent it. A housekeeper, a rota and enough bins help. Pests come to those who wait |
| Anger | Builds from lost games, hunger, noise, dirt and each other. It comes out as a broken keyboard, a walk-out for the evening, a locked door on match morning, and in the end a transfer request |
| Rules | Who cooks (three ways), cleaning rota, showers before practice, quiet hours, lights out. Each helps somebody and annoys somebody else |
| You | Once a day per person: listen, order food, send to the shower, take out for the night, have a word, or sit two people down together |

## Incidents (built)

Twenty-one things that happen to houses. Most stop the clock with a picture of what is going on and two to four answers, some of which need the right staff, furniture or money. Roughly one or two a week; dirt brings more.

- **In training:** the power goes, the internet goes, the air conditioning gives up, a hot microphone on stream.
- **On match morning:** no connection, a blown fuse, an attack on the line, an update nobody asked for, somebody who will not play.
- **In the house:** water, burning food, cockroaches, a party next door, a burglary, a birthday, a dog, fans at the door, a mistake in the bill, a pink laundry.

What you own changes the answers: a generator, battery backup, a spare line, a technician, an extinguisher, a psychologist.

## Bodies (built)

Everybody is solid. In matches players have a radius and cannot enter walls, crates, barrels, pillars, trees, towers or each other; dashes and knock-backs stop at the first thing they hit; bullets and projectiles stop at walls; spells need a line of sight where they should. At the headquarters people walk through doors, around furniture and around each other, and take a seat from the free side of it.

## Balance targets and where they stand

| Target | Measured |
|---|---|
| Equal squads win about half | 0.33 to 0.63 over 24 to 40 matches per map |
| Six rating points better wins 65 to 80% (shooters) | 0.67 to 0.92 tactical, 0.60 to 0.63 hero shooter, about 0.60 MOBA |
| Attackers win 45 to 60% of rounds | 0.54 to 0.67, slightly high |
| No hero above 70% or below 36% | Worst case 0.70 and 0.36 over 200 games before the last pass |
| No plan setting dominates | Shooters: every setting 0.38 to 0.58 against an equal squad. MOBA: 0.31 to 0.69 over only 16 games each, too few to say |
| A passive flat start neither dies nor thrives | Four seasons without promotion, cash positive |

The hero pass and attack-side bias are the first balance jobs in the roadmap.
