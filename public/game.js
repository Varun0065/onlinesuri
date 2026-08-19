const socket = io();

let state = null;
let mine = [];
let legal = [];

const $ = id => document.getElementById(id);

function esc(x) {
  return String(x).replace(/[&<>"']/g, m => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[m]));
}

function suitClass(s) {
  return (s === "♥" || s === "♦") ? "red" : "";
}

/* =========================
   CREATE ROOM
========================= */

/* =========================
   CREATE ROOM
========================= */

$("create").onclick = () => {

  socket.emit("createRoom", {

    name: $("name").value || "Player",

    game: $("gameSelect").value || "suri"

  });

};

/* =========================
   JOIN ROOM
========================= */

$("join").onclick = () => {
  socket.emit("joinRoom", {
    roomId: $("room").value.trim(),
    name: $("name").value || "Player"
  });
};

/* =========================
   START GAME
========================= */

$("start").onclick = () => {
  socket.emit("startGame");
};

/* =========================
   ROOM CREATED
========================= */

socket.on("roomCreated", id => {
  $("room").value = id;
  $("err").textContent = "Room created: " + id;
});

/* =========================
   ERROR
========================= */

socket.on("errorMsg", message => {
  $("err").textContent = message;
  $("err").className = "warn";
});

/* =========================
   GAME STATE
========================= */

socket.on("state", s => {

  state = s;
  const game = s.game || "suri";

console.log("SELECTED GAME:", game);

  $("lobby").classList.toggle(
    "hidden",
    s.phase !== "lobby"
  );

  $("game").classList.toggle(
    "hidden",
    s.phase === "lobby"
  );

  $("roomCode").textContent = s.id;

  $("s0").textContent = s.scores[0];
  $("s1").textContent = s.scores[1];

  $("start").classList.toggle(
    "hidden",
    !(
      s.phase === "lobby" &&
      s.players.length === 4 &&
      s.players[0].id === socket.id
    )
  );

  $("roomInfo").innerHTML =
    `<b>Room ${s.id}</b><br>` +
    s.players.map((p, i) =>
      `${i + 1}. ${esc(p.name)} — Team ${p.team + 1} ${p.connected ? "🟢" : "🔴"}`
    ).join("<br>");

  s.players.forEach((p, i) => {

  const box = $("p" + i);

  if (!box) return;

  let bidInfo = "";

  if (
    s.bid !== null &&
    s.bidder === i
  ) {
    bidInfo = `
      <div class="playerBidInfo">
        <b>Rang: ${esc(s.trump || "-")}</b>
        <br>
        <b>Sar: ${s.bid}</b>
      </div>
    `;
  }

  box.innerHTML = `
    <div class="playerName">
      ${esc(p.name)} · Team ${p.team + 1}
    </div>

    <small>${p.cardCount} cards</small>

    ${bidInfo}
  `;

  box.classList.toggle(
    "active",
    s.current === i
  );
});

  render();
  if (micOn) {
    startVoiceConnections();
  }
});



/* =========================
   PRIVATE HAND
========================= */

socket.on("private", data => {
  console.log("PRIVATE HAND =", data.hand.map(c => c.id));
  console.log("PRIVATE LEGAL =", data.legal);

  mine = Array.isArray(data.hand)
    ? data.hand
    : [];

  legal = Array.isArray(data.legal)
    ? data.legal
    : [];

  renderHand();
});

/* =========================
   CARD HTML
========================= */

function cardHTML(card) {
  return `
    <button 
      type="button"
      class="card ${suitClass(card.s)} playable"
      onclick='playCard(${JSON.stringify(card.id)})'
    >
      ${esc(card.r)}<br>${esc(card.s)}
    </button>
  `;
}

// ==PLAY CARD= //
function playCard(cardId) {

  if (!state) return;

  if (state.phase !== "play") {
    return;
  }

  const current =
    state.players[state.current];

  if (!current) return;

  if (current.id !== socket.id) {

    $("status").textContent =
      `⏳ Waiting for ${current.name}...`;

    return;
  }

  if (!legal.includes(cardId)) {

    $("err").textContent =
      "You must follow the lead suit.";

    return;
  }

  console.log(
    "Playing card:",
    cardId
  );

  socket.emit(
    "playCard",
    {
      cardId: cardId
    }
  );
}

/* =========================
   SHOW HAND
========================= */

function renderHand() {

  const handBox = $("hand");

  if (!handBox) return;

  handBox.innerHTML = mine
    .map(card => cardHTML(card))
    .join("");
}

/* =========================
   PLAY CARD
========================= */

// function playCard(cardId) {

//   if (!state) return;

//   if (state.phase !== "play") return;

//   const current =
//     state.players[state.current];

//   if (!current) return;

//   if (current.id !== socket.id) {
//     return;
//   }

//   if (!legal.includes(cardId)) {
//     return;
//   }

//   console.log("Playing card:", cardId);

//   socket.emit("playCard", {
//     cardId: cardId
//   });
// }
// function playCard(cardId) {
//   console.log("Playing card:", cardId);

//   socket.emit("playCard", {
//     cardId: cardId
//   });
// }

/* =========================
   MAIN RENDER
========================= */

function render() {

  if (!state) return;

  

  /* RANG + SAR */

$("trumpInfo").innerHTML =
  state.bid !== null
    ? `<b>Rang: ${esc(state.trump || "-")} | Sar: ${state.bid}</b>`
    : "";
  /* TRICK */

  $("trick").innerHTML =
    state.trick.map((item, i) => `
      <div class="played t${i} ${suitClass(item.card.s)}">
        ${item.card.r}<br>
        ${item.card.s}
      </div>
    `).join("");

  

  /* CURRENT PLAYER */

const current =
  state.players[state.current];

let message = "";

if (state.phase === "lobby") {

  if (state.players.length < 4) {
    message =
      `Waiting for players... (${state.players.length}/4)`;
  } else {
    message =
      "All 4 players joined!";
  }

} else if (state.phase === "bid") {

  const bidder =
    state.players[state.bidTurn];

  if (bidder?.id === socket.id) {

    message =
      `🎯 ${bidder.name}'s Turn — Choose Sar + Rang`;

  } else {

    message =
      `⏳ Waiting for ${bidder?.name || "Player"} to choose Sar + Rang`;

  }

} else if (state.phase === "play") {

  if (current?.id === socket.id) {

    message =
      "🎯 Your Turn — Play Card";

  } else {

    message =
      `⏳ Waiting for ${current?.name || "Player"} to play`;

  }

} else if (state.phase === "finished") {

  message =
    `🏆 Team ${state.winner + 1} Wins!`;

}

$("status").textContent = message;

  /* HISTORY */

  $("hist").innerHTML =
    state.history.map(x =>
      `<div class="histline">${esc(x)}</div>`
    ).join("");

  renderHand();
  renderControls();
}

/* =========================
   BID CONTROLS
========================= */

let chosenSuit = null;
let chosenBid = null;

function renderControls() {
  const controls = $("controls");

  if (!controls) return;

  controls.innerHTML = "";

  console.log(
    "BID DEBUG:",
    state.phase,
    state.bidTurn,
    socket.id,
    state.players[state.bidTurn]?.id
  );

  if (
    state.phase === "bid" &&
    state.players[state.bidTurn]?.id === socket.id
  ) {

    controls.innerHTML = `
      <div class="bidTitle">
        🎯 Choose Rang + Sir
      </div>

      <div class="bidTitle">
        Rang:
      </div>

      <div class="bidControls">
        ${["♠", "♥", "♦", "♣"].map(s => `
          <button
            type="button"
            onclick="chooseSuit('${s}')">
            ${s}
          </button>
        `).join("")}
      </div>

      <div class="bidTitle">
        Sir:
      </div>

      <div class="bidControls">
        ${[8, 9, 10, 11, 12, 13].map(n => `
          <button
            type="button"
            onclick="chooseBid(${n})">
            ${n}
          </button>
        `).join("")}
      </div>

      <div id="chosen">
        Rang: - | Sir: -
      </div>

      <button
        type="button"
        id="confirmBid"
        onclick="confirmBid()"
        disabled>
        ✅ Confirm
      </button>
    `;
  }

  /* =========================
     NEXT ROUND
  ========================= */

  if (
    state.phase === "finished" &&
    state.players[0]?.id === socket.id
  ) {

    controls.innerHTML = `
      <div class="bidControls">
        <button
          type="button"
          onclick="restartGame()">
          Next Round
        </button>
      </div>
    `;
  }
}

/* =========================
   BID
========================= */
function chooseBid(value) {
  chosenBid = value;
  updateBidDisplay();
}

function chooseSuit(suit) {
  chosenSuit = suit;
  updateBidDisplay();
}

function updateBidDisplay() {
  const chosen = $("chosen");
  const confirm = $("confirmBid");

  if (chosen) {
    chosen.textContent =
      `Rang: ${chosenSuit || "-"} | Sir: ${chosenBid || "-"}`;
  }

  if (confirm) {
    confirm.disabled =
      !(chosenSuit && chosenBid);
  }
}

function confirmBid() {

  if (!chosenSuit || !chosenBid) {
    $("err").textContent =
      "Pehle Rang aur Sir dono select karo.";
    return;
  }

  socket.emit("bid", {
    value: chosenBid,
    trump: chosenSuit
  });
}


/* =========================
   RESTART
========================= */

function restartGame() {

  socket.emit("restartRound");
}

/* =========================
   CHAT
========================= */

const chatInput = $("chatInput");
const chatSend = $("chatSend");
const chatMessages = $("chatMessages");

function sendChat() {
  if (!chatInput) return;

  const message = chatInput.value.trim();

  if (!message) return;

  socket.emit("chatMessage", {
    message: message
  });

  chatInput.value = "";
}

if (chatSend) {
  chatSend.onclick = sendChat;
}

if (chatInput) {
  chatInput.addEventListener("keydown", e => {
    if (e.key === "Enter") {
      sendChat();
    }
  });
}

socket.on("chatMessage", data => {

  if (!chatMessages) return;

  const div = document.createElement("div");

  div.innerHTML =
    `<b>${esc(data.name)}:</b> ${esc(data.message)}`;

  chatMessages.appendChild(div);

  chatMessages.scrollTop =
    chatMessages.scrollHeight;
});


/* =========================
   MICROPHONE
========================= */
/* =========================
   VOICE CHAT - WEBRTC
========================= */

let localStream = null;
let micOn = false;

const peers = {};
const micBtn = $("micBtn");
const voiceStatus = $("voiceStatus");

const rtcConfig = {
  iceServers: [
    {
      urls: "stun:stun.l.google.com:19302"
    }
  ]
};


/* =========================
   START MICROPHONE
========================= */
async function startMicrophone() {
 

  try {

    localStream =
      await navigator.mediaDevices.getUserMedia({
        audio: true
      });

    micOn = true;

    if (micBtn) {
      micBtn.textContent = "🔴 Mic On";
    }

    if (voiceStatus) {
      voiceStatus.textContent =
        "Microphone is ON";
    }

    startVoiceConnections();

  } catch (err) {

    console.error("MIC ERROR:", err);

    if (voiceStatus) {
      voiceStatus.textContent =
        "Microphone permission denied";
    }
  }
}


/* =========================
   STOP MICROPHONE
========================= */

function stopMicrophone() {

  if (localStream) {

    localStream
      .getTracks()
      .forEach(track => track.stop());

    localStream = null;
  }

  micOn = false;

  if (micBtn) {
    micBtn.textContent = "🎤 Mic Off";
  }

  if (voiceStatus) {
    voiceStatus.textContent =
      "Microphone is OFF";
  }
}


/* =========================
   CREATE PEER
========================= */

function createPeer(playerId, initiator) {

  if (peers[playerId]) {
    return peers[playerId];
  }

  const pc =
    new RTCPeerConnection(rtcConfig);

  peers[playerId] = pc;


  /* MIC TRACK */

  if (localStream) {

    localStream
      .getTracks()
      .forEach(track => {

        pc.addTrack(
          track,
          localStream
        );

      });

  }


  /* REMOTE AUDIO */

  pc.ontrack = event => {

    let audio =
      document.getElementById(
        "audio-" + playerId
      );

    if (!audio) {

      audio =
        document.createElement("audio");

      audio.id =
        "audio-" + playerId;

      audio.autoplay = true;

      audio.playsInline = true;

      document.body.appendChild(audio);
    }

    audio.srcObject =
      event.streams[0];

  };


  /* ICE */

  pc.onicecandidate = event => {

    if (event.candidate) {

      socket.emit(
        "voice-ice-candidate",
        {
          to: playerId,
          candidate:
            event.candidate
        }
      );

    }

  };


  /* OFFER */

  if (initiator) {

    pc.createOffer()
      .then(offer => {

        return pc.setLocalDescription(
          offer
        );

      })
      .then(() => {

        socket.emit(
          "voice-offer",
          {
            to: playerId,
            offer:
              pc.localDescription
          }
        );

      })
      .catch(err => {

        console.error(
          "OFFER ERROR:",
          err
        );

      });

  }


  return pc;
}


/* =========================
   START CONNECTIONS
========================= */

function startVoiceConnections() {

  if (!state || !state.players) {
    return;
  }

  state.players.forEach(player => {

    if (
      player.id !== socket.id &&
      player.connected
    ) {

      /*
       * Lower seat creates connection.
       * This prevents duplicate connections.
       */

      const mySeat =
        state.players.findIndex(
          p => p.id === socket.id
        );

      const otherSeat =
        state.players.findIndex(
          p => p.id === player.id
        );

      createPeer(
        player.id,
        mySeat < otherSeat
      );

    }

  });

}


/* =========================
   RECEIVE OFFER
========================= */

socket.on(
  "voice-offer",
  async data => {

    try {

      const pc =
        createPeer(
          data.from,
          false
        );

      await pc.setRemoteDescription(
        new RTCSessionDescription(
          data.offer
        )
      );

      const answer =
        await pc.createAnswer();

      await pc.setLocalDescription(
        answer
      );

      socket.emit(
        "voice-answer",
        {
          to: data.from,
          answer:
            pc.localDescription
        }
      );

    } catch (err) {

      console.error(
        "VOICE OFFER ERROR:",
        err
      );

    }

  }
);


/* =========================
   RECEIVE ANSWER
========================= */

socket.on(
  "voice-answer",
  async data => {

    try {

      const pc =
        peers[data.from];

      if (!pc) {
        return;
      }

      await pc.setRemoteDescription(
        new RTCSessionDescription(
          data.answer
        )
      );

    } catch (err) {

      console.error(
        "VOICE ANSWER ERROR:",
        err
      );

    }

  }
);


/* =========================
   RECEIVE ICE
========================= */

socket.on(
  "voice-ice-candidate",
  async data => {

    try {

      const pc =
        peers[data.from];

      if (!pc) {
        return;
      }

      await pc.addIceCandidate(
        new RTCIceCandidate(
          data.candidate
        )
      );

    } catch (err) {

      console.error(
        "ICE ERROR:",
        err
      );

    }

  }
);


/* =========================
   MIC BUTTON
========================= */

if (micBtn) {

  micBtn.onclick = async () => {

    if (!micOn) {

      await startMicrophone();

    } else {

      stopMicrophone();

    }

  };

}

