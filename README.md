# SURI Online 2v2

## Run
1. Install Node.js 18+.
2. Open terminal in this folder.
3. Run `npm install`
4. Run `npm start`
5. Open `http://localhost:3000`
6. One player creates a room, the other 3 join using the room code.

## Implemented rules
- 52-card deck
- 4 players, 13 cards each
- Teams: seats 1+3 vs 2+4
- Bids: 8–13
- Trump suit selection
- Follow-suit rule
- Trump wins when played
- Automatic trick counting
- Starting score: 0
- Successful bid B: score changes by -B
- Failed bid B: score changes by +2B
- Example: bid 8, make 7 => +16
- Team reaching 53+ loses

## Important
The exact Suri rules can vary by local version. This project uses the scoring and trick rules described in the request. The UI/server are structured so additional local rules can be added easily.
