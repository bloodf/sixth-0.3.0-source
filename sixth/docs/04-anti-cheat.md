# Encryption and anti-cheat

There is no server, so nobody can stop a person from running a modified copy on their own machine. What the design does is keep everything **unreadable at rest**, make changes **detected at home**, and make cheating **useless online**.

## What is encrypted

| Data | How |
|---|---|
| Every action of a career | AES-256-GCM, one box per action, bound to the hash of the one before |
| The state | AES-256-GCM, rewritten with every action |
| The header: club name, day, money, ranked or not | AES-256-GCM, signed with ECDSA P-256 |
| Opponents met, world ladder, private leagues, a match in progress | AES-256-GCM, each bound to its place |
| Backup files | AES-256-GCM under a password (PBKDF2-SHA-256, 400,000 rounds), signed over the encrypted bytes |
| Left readable | The names of the boxes (a random career id, a league code, an opponent's public key). On purpose: sound, graphics and relay settings; the anchors (a counter and a keyed MAC); the flag, which others must be able to read |

Keys are non-extractable WebCrypto keys. The page can use them; neither it nor anyone reading the database can read them out. A test dumps every store as raw bytes and looks for the club, the manager, every player and the words of the save format.

## What happens at home

| Attack | What happens |
|---|---|
| Edit the saved state | Authentication fails. Sealed, flagged |
| Edit the header or its signature, or put an old readable one in its place | Found on the title screen, before anyone clicks. Sealed, flagged |
| Remove, reorder or swap actions | Hash chain breaks. Sealed, flagged |
| Restore an older database | Three anchors (database, local storage, cache) disagree. Sealed, flagged |
| Change an anchor | Its keyed MAC fails. Sealed, flagged |
| Delete anchors | Playable, but the career becomes unranked |
| Change values or the house in memory while playing | A fingerprint is checked before every action. Sealed, flagged |
| Re-sign a doctored history with the real keys | The replay worker rebuilds the career from its seed and the result differs. Sealed, flagged |
| Add a record that swaps the state (`#epoch`, `#upgrade` with a state, a second beginning) | Refused by the replay, at home and at every opponent |
| Send a house plan with free furniture, land or rooms | Refused like any impossible move; the replay refuses it too |
| Restore an edited backup of your own | Signature or replay fails. Sealed, flagged |
| Restore an old, honest backup | Accepted as a separate, unranked career |
| Quit during a losing match | The match is already in the history and resumes with the orders given |

These are not punished: a wrong backup password; a damaged file from somebody else, even one that claims to be yours; opening the save in two tabs; a career from an older version.

All rows except the mid-match one are covered by `tests/tamper.py` (26 cases in a real browser) and `tests/save.test.ts`; resuming a match was checked by hand-driven browser runs.

**Sealed** means the career can no longer be opened. **Flagged** means a signed record bound to the manager's identity, copied to three stores and restored if one is wiped. Other managers see it and open matches are refused.

## What 0.1.0 got wrong

The first version was described as encrypted. The actions and the state were; the header (name, day, money), the backup files, the ladder and the leagues were signed but readable. A later rules update could have flagged innocent players, and the record that carried a career over such an update could have been used to forge one. All of that is fixed here. Saves of 0.1.0 are verified under the old rules, re-encrypted, and stay ranked.

## Online

1. **Identity.** Each peer proves it holds its key by signing a fresh challenge.
2. **Career proof.** For open matches each side sends its whole history. The other replays it in a worker and computes the squad itself. A squad that differs is refused, and that manager is banned on your device.
3. **Fork check.** You remember the last history you saw from each career. A later one that does not contain it is a rollback.
4. **Dice.** Commit, then reveal. The seed is both secrets hashed.
5. **Play.** Lockstep, with state hashes exchanged every ten seconds of game time.
6. **Result.** Counts only with both signatures, and every client re-simulates it before adding it to its ladder.

Traffic between managers is encrypted by WebRTC (DTLS). A career proof is readable by the opponent it is sent to; that is its purpose.

## Honest limits

- **Your own machine is yours.** Somebody who rewrites the program can make it use the keys for them. What they cannot make is a history that replays to a better squad.
- **Seed hunting.** Someone can create careers until they like one. It is legal play, only tedious.
- **Whole-profile copies.** Copying an entire browser profile and restoring it is invisible locally. The fork check catches it the first time they meet someone they have met before.
- **A rebuilt client** can ignore its own flag. Verified matches stay fair; in "level" matches squads are scaled but not proven, so treat them as friendlies.
- **Two colluding managers** can trade wins. At most three results per pair per day count.
- **Clearing all site data** makes a new identity with no careers and no record.
- **A lost backup password** cannot be recovered. Real disk corruption looks the same as tampering. Keep backups.
