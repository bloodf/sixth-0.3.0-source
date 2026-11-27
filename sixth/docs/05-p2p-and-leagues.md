# P2P and leagues

## Finding each other

| Way | Infrastructure | Use |
|---|---|---|
| Room | Public Nostr relays, used only to swap connection details (Trystero). Replaceable in Settings | Lobby, leagues |
| Direct code | None but a public STUN lookup. Two codes pasted through any chat | Friends, strict networks |

Game data then flows directly over encrypted WebRTC. Some networks (symmetric NAT, many offices) block direct links; adding a TURN server in `localStorage["sixth.net"].turn` solves it. `npm run relay` starts a tiny local relay for LAN play and tests.

## Three kinds of competition

**Career leagues (built).** Three regional divisions and a World Masters per game, against AI clubs. Fully offline.

**World ladder (built).** Open to everyone. A grow-only set of doubly signed match records, exchanged whenever two managers meet. Everyone folds the same records into the same Elo table, per game, per calendar month. Open and level boards. The ladder is as complete as the records you have met: there is no central copy, by design.

**Private leagues (built).** Created with a code, 2 to 10 clubs, single round robin. A league is a set of signed entries that merge when any two members meet, so nobody has to stay online. Each round:

1. Everyone locks in: a hash of (squad, secret).
2. When all are in, clients reveal automatically.
3. The round seed is the hash of all secrets. Every member computes the same results and can watch them in 3D.

The creator can close a round; absent clubs play with their last squad, or forfeit.

## Live match protocol

```
challenge ─► accept
squad + commit(secret) ◄──► squad + commit(secret)
career proof ◄──► career proof      (open mode: replay, compare)
reveal ◄──► reveal                   seed = H(id, secretA, secretB)
turn n: orders for turn n+2          one turn = 10 ticks, hash every 10 turns
result signature ◄──► result signature
record gossip
```

A player who disconnects mid-match leaves an unsigned, uncounted match.

## Not built yet

Team chat and spectating, double round robins and cups, reconnecting into a running duel, a retention strategy beyond the newest 1,200 ladder records, sharded lobbies for more than about 30 people in one room.
