const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));

const rooms = new Map();

const SUITS = ["♠", "♥", "♦", "♣"];
const RANKS = [
  "2", "3", "4", "5", "6", "7",
  "8", "9", "10", "J", "Q", "K", "A"
];

const VALUES = Object.fromEntries(
  RANKS.map((r, i) => [r, i + 2])
);


/* =========================
   DECK
========================= */

function createDeck() {
  const cards = [];

  for (const suit of SUITS) {
    for (const rank of RANKS) {
      cards.push({
        s: suit,
        r: rank,
        id: rank + suit
      });
    }
  }

  return cards.sort(() => Math.random() - 0.5);
}


/* =========================
   TEAMS
========================= */

function teamOf(seat) {
  return seat % 2 === 0 ? 0 : 1;
}


/* =========================
   NEXT PLAYER
========================= */

function nextSeat(room, seat) {

  if (!room || !room.players.length) {
    return 0;
  }

  return (seat + 1) % room.players.length;
}


/* =========================
   PUBLIC STATE
========================= */

function publicState(room) {

  return {
    id: room.id,

    phase: room.phase,

    trump: room.trump,

    leader: room.leader,

    current: room.current,

    bidTurn: room.bidTurn,

    bider: room.bider,

    players: room.players.map((p, i) => ({
      id: p.id,
      name: p.name,
      seat: i,
      team: teamOf(i),
      connected: p.connected,
      cardCount: p.hand.length
    })),

    scores: room.scores,

    tricks: room.tricks,

    trick: room.trick.map(x => ({
      seat: x.seat,
      card: x.card
    })),

    history: room.history.slice(-12),

    winner: room.winner
  };
}


/* =========================
   EMIT ROOM
========================= */

function emitRoom(room) {
  io.to(room.id).emit(
    "state",
    publicState(room)
  );
}


/* =========================
   DEAL CARDS
========================= */

function dealCards(room) {

  const cards = createDeck();

  room.players.forEach((player, i) => {

    player.hand = cards.slice(
      i * 13,
      (i + 1) * 13
    );

    player.hand.sort((a, b) => {

      const suitA = SUITS.indexOf(a.s);
      const suitB = SUITS.indexOf(b.s);

      if (suitA !== suitB) {
        return suitA - suitB;
      }

      return VALUES[a.r] - VALUES[b.r];
    });

  });
}


/* =========================
   RESET ROUND
========================= */
function resetRound(room) {
  dealCards(room);

  room.phase = "bid";
  room.trump = null;
  room.bid = null;
  room.bidder = null;

  room.trick = [];
  room.tricks = [0, 0];
  room.winner = null;

  // Jis player ki upar chal hai,
  // uske just next player ko bid/rang choose karna hai.
  room.bidTurn = nextSeat(room, room.leader);

  room.current = room.leader;
}



/* =========================
   LEGAL CARDS
========================= */

function legalCards(room, seat) {

  if (!room.players[seat]) {
    return [];
  }

  const hand = room.players[seat].hand;

  if (room.trick.length === 0) {
    return hand;
  }

  const leadSuit =
    room.trick[0].card.s;

  const sameSuit = hand.filter(
    card => card.s === leadSuit
  );

  return sameSuit.length > 0
    ? sameSuit
    : hand;
}


/* =========================
   TRICK WINNER
========================= */

function winnerOfTrick(room) {

  const leadSuit =
    room.trick[0].card.s;

  let best = room.trick[0];

  for (const played of room.trick.slice(1)) {

    const a = played.card;
    const b = best.card;

    const aTrump =
      a.s === room.trump;

    const bTrump =
      b.s === room.trump;

    if (aTrump && !bTrump) {

      best = played;

      continue;
    }

    if (aTrump === bTrump) {

      const aLead =
        a.s === leadSuit;

      const bLead =
        b.s === leadSuit;

      if (aLead && !bLead) {

        best = played;

      } else if (
        aLead === bLead &&
        VALUES[a.r] > VALUES[b.r]
      ) {

        best = played;
      }
    }
  }

  return best.seat;
}


/* =========================
   PRIVATE HANDS
========================= */

function sendPrivateHands(room) {

  room.players.forEach((player, seat) => {

    let legal = [];

    if (
      room.phase === "play" &&
      room.current === seat
    ) {

      legal = legalCards(
        room,
        seat
      ).map(card => card.id);
    }

    io.to(player.id).emit(
      "private",
      {
        hand: player.hand,
        legal: legal
      }
    );

  });
}


/* =========================
   FINISH ROUND
========================= */

function finishRound(room) {

  const bidderTeam =
    teamOf(room.bidder);

  const bid = room.bid;

  const made =
    room.tricks[bidderTeam];

  if (made >= bid) {

    room.scores[bidderTeam] -= bid;

    room.history.push(
      `Team ${bidderTeam + 1}: bid ${bid}, made ${made} → -${bid}`
    );

  } else {

    room.scores[bidderTeam] += bid * 2;

    room.history.push(
      `Team ${bidderTeam + 1}: bid ${bid}, made ${made} → +${bid * 2}`
    );
  }

  room.history.push(
    `Tricks: Team 1 = ${room.tricks[0]}, Team 2 = ${room.tricks[1]}`
  );


  const loser =
    room.scores.findIndex(
      score => score >= 53
    );

  if (loser !== -1) {

    room.winner =
      loser === 0 ? 1 : 0;

    room.phase = "finished";

    emitRoom(room);

    sendPrivateHands(room);

    return;
  }


  room.leader =
    nextSeat(room, room.leader);

  resetRound(room);

  emitRoom(room);

  sendPrivateHands(room);
}


/* =========================
   SOCKET CONNECTION
========================= */

io.on("connection", socket => {

  console.log(
    "CONNECTED:",
    socket.id
  );


  /* =========================
     CREATE ROOM
  ========================= */

  socket.on(
    "createRoom",
    ({ name }) => {

      const id =
        Math.random()
          .toString(36)
          .slice(2, 7)
          .toUpperCase();


      const room = {

        id,

        phase: "lobby",

        players: [],

        scores: [0, 0],

        tricks: [0, 0],

        leader: 0,
       current: 0,
       bidTurn: 1,

       bidder: null,
       bid: null,
       trump: null,

        

        trick: [],

        history: [],

        winner: null
      };


      room.players.push({

        id: socket.id,

        name:
          (name || "Player 1")
            .slice(0, 18),

        hand: [],

        connected: true
      });


      rooms.set(id, room);

      socket.join(id);

      socket.roomId = id;

      console.log(
        "ROOM CREATED:",
        id,
        "BY:",
        socket.id
      );


      emitRoom(room);

      socket.emit(
        "roomCreated",
        id
      );
    }
  );


  /* =========================
     JOIN ROOM
  ========================= */

  socket.on(
    "joinRoom",
    ({ roomId, name }) => {

      const cleanRoomId =
        (roomId || "")
          .trim()
          .toUpperCase();


      console.log(
        "JOIN REQUEST:",
        cleanRoomId,
        "FROM:",
        socket.id
      );

      console.log(
        "AVAILABLE ROOMS:",
        [...rooms.keys()]
      );


      const room =
        rooms.get(cleanRoomId);


      if (!room) {

        socket.emit(
          "errorMsg",
          "Room not found."
        );

        return;
      }


      if (room.players.length >= 4) {

        socket.emit(
          "errorMsg",
          "Room is full."
        );

        return;
      }


      if (room.phase !== "lobby") {

        socket.emit(
          "errorMsg",
          "Game already started."
        );

        return;
      }


      room.players.push({

        id: socket.id,

        name:
          (
            name ||
            `Player ${room.players.length + 1}`
          ).slice(0, 18),

        hand: [],

        connected: true
      });


      socket.join(room.id);

      socket.roomId = room.id;


      console.log(
        "PLAYER JOINED:",
        socket.id,
        "SEAT:",
        room.players.length - 1
      );


      emitRoom(room);
    }
  );


  /* =========================
     START GAME
  ========================= */

  socket.on(
    "startGame",
    () => {

      const room =
        rooms.get(socket.roomId);

      if (!room) return;


      if (
        room.players[0].id !==
        socket.id
      ) {

        return;
      }


      if (room.players.length !== 4) {

        socket.emit(
          "errorMsg",
          "Need exactly 4 players."
        );

        return;
      }


      room.leader = 0;

      room.current = 0;


      resetRound(room);


      emitRoom(room);

      sendPrivateHands(room);
    }
  );


  

  /* =========================
   BID
========================= */
socket.on("bid", ({ value, trump }) => {
  const room = rooms.get(socket.roomId);
  if (!room) return;

  if (room.phase !== "bid") {
    return;
  }

  const seat = room.players.findIndex(p => p.id === socket.id);
  if (seat === -1 || seat !== room.bidTurn) {
    socket.emit("errorMsg", "Not your turn to bid.");
    return;
  }

  // Save bid details
  room.bid = value;
  room.bidder = seat;
  room.trump = trump;

  // Move to play phase
  room.phase = "play";
  room.current = room.leader;

  // Broadcast updated state
  emitRoom(room);
  sendPrivateHands(room);
});

  /* =========================
     CHAT
  ========================= */

  socket.on(
    "chatMessage",
    ({ message }) => {

      const room =
        rooms.get(socket.roomId);

      if (!room) return;


      if (
        typeof message !==
        "string"
      ) {

        return;
      }


      message =
        message.trim();


      if (!message) {
        return;
      }


      if (message.length > 200) {

        message =
          message.slice(0, 200);
      }


      const player =
        room.players.find(
          p => p.id === socket.id
        );


      if (!player) return;


      io.to(room.id).emit(
        "chatMessage",
        {
          name: player.name,
          message: message
        }
      );
    }
  );


  /* =========================
     PLAY CARD
  ========================= */

  socket.on(
    "playCard",
    ({ cardId }) => {

      console.log(
        "PLAY EVENT RECEIVED:",
        cardId
      );


      const room =
        rooms.get(socket.roomId);


      if (!room) {

        console.log(
          "ROOM NOT FOUND"
        );

        return;
      }


      if (room.phase !== "play") {

        console.log(
          "NOT PLAY PHASE"
        );

        return;
      }


      const seat =
        room.players.findIndex(
          p => p.id === socket.id
        );


      console.log(
        "SEAT =",
        seat
      );

      console.log(
        "CURRENT =",
        room.current
      );


      if (seat === -1) {

        console.log(
          "PLAYER NOT FOUND"
        );

        return;
      }


      if (seat !== room.current) {

        console.log(
          "NOT MY TURN"
        );

        return;
      }


      const hand =
        room.players[seat].hand;


      const card =
        hand.find(
          c => c.id === cardId
        );


      console.log(
        "HAND =",
        hand.map(c => c.id)
      );


      console.log(
        "CARD FOUND =",
        card
          ? card.id
          : "NO"
      );


      if (!card) {

        console.log(
          "CARD NOT FOUND IN HAND"
        );

        return;
      }


      /* LEGAL CARD */

      const legal =
        legalCards(
          room,
          seat
        );


      console.log(
        "LEGAL CARDS =",
        legal.map(c => c.id)
      );


      if (
        !legal.some(
          c => c.id === card.id
        )
      ) {

        socket.emit(
          "errorMsg",
          "You must follow the lead suit."
        );

        return;
      }


      /* REMOVE CARD */

      room.players[seat].hand =
        hand.filter(
          c => c.id !== card.id
        );


      /* PUT CARD ON TABLE */

      room.trick.push({

        seat: seat,

        card: card
      });


      console.log(
        "CARD PLAYED BY SEAT =",
        seat
      );

      console.log(
        "TRICK LENGTH =",
        room.trick.length
      );


      /* =========================
         4 CARDS PLAYED
      ========================= */

      if (
        room.trick.length === 4
      ) {

        const winner =
          winnerOfTrick(room);


        console.log(
          "TRICK WINNER =",
          winner
        );


        room.tricks[
          teamOf(winner)
        ]++;


        room.current =
          winner;


        emitRoom(room);

        sendPrivateHands(room);


        setTimeout(() => {

          if (
            room.trick.length !== 4
          ) {

            return;
          }


          room.trick = [];


          if (
            room.players[0]
              .hand.length === 0
          ) {

            finishRound(room);

            return;
          }


          emitRoom(room);

          sendPrivateHands(room);

        }, 1000);


        return;
      }


      /* =========================
         NEXT PLAYER
      ========================= */

      room.current =
        nextSeat(
          room,
          seat
        );


      console.log(
        "CARD PLAYED BY SEAT =",
        seat
      );

      console.log(
        "NEXT TURN =",
        room.current
      );


      emitRoom(room);

      sendPrivateHands(room);
    }
  );


  /* =========================
     NEXT ROUND
  ========================= */

  socket.on(
    "restartRound",
    () => {

      const room =
        rooms.get(socket.roomId);

      if (!room) return;


      if (
        room.phase !==
        "finished"
      ) {

        return;
      }


      if (
        room.players[0].id !==
        socket.id
      ) {

        return;
      }


      resetRound(room);


      emitRoom(room);

      sendPrivateHands(room);
    }
  );


  /* =========================
     DISCONNECT
  ========================= */

  socket.on(
    "disconnect",
    () => {

      console.log(
        "DISCONNECTED:",
        socket.id
      );


      const room =
        rooms.get(socket.roomId);


      if (!room) return;


      const player =
        room.players.find(
          p => p.id === socket.id
        );


      if (player) {

        player.connected =
          false;
      }


      emitRoom(room);
    }
  );

});


/* =========================
   SERVER
========================= */

const PORT =
  process.env.PORT || 3000;

server.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      `Suri server running on port ${PORT}`
    );
  }
);