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

$("create").onclick = () => {
  socket.emit("createRoom", {
    name: $("name").value || "Player"
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

    box.innerHTML =
      `${esc(p.name)} · Team ${p.team + 1}<br>
       <small>${p.cardCount} cards</small>`;

    box.classList.toggle(
      "active",
      s.current === i
    );
  });

  render();
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

// ==PLAY CARD==
function playCard(cardId) {
  console.log("Playing card:", cardId);

  socket.emit("playCard", {
    cardId: cardId
  });
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

  /* BID */

  $("bidBox").innerHTML = `
  <div class="scoreInfo">

    <div class="teamScore">
      <b>TEAM 1</b>
      <div>Bid: ${state.bid || "-"}</div>
      <div>Sar: ${state.tricks[0]}</div>

      ${
        state.bid
          ? state.tricks[0] < state.bid
            ? `<div class="short">
                ${state.bid - state.tricks[0]} Sar Kam
              </div>`
            : `<div class="extra">
                ${state.tricks[0] - state.bid} Sar Extra
              </div>`
          : ""
      }
    </div>

    <div class="teamScore">
      <b>TEAM 2</b>
      <div>Bid: ${
        state.bidder !== null &&
        state.bidder % 2 === 1
          ? state.bid
          : "-"
      }</div>

      <div>Sar: ${state.tricks[1]}</div>

      ${
        state.bid &&
        state.bidder !== null &&
        state.bidder % 2 === 1
          ? state.tricks[1] < state.bid
            ? `<div class="short">
                ${state.bid - state.tricks[1]} Sar Kam
              </div>`
            : `<div class="extra">
                ${state.tricks[1] - state.bid} Sar Extra
              </div>`
          : ""
      }
    </div>

    <div class="trumpInfo">
      Rang: <b>${state.trump || "-"}</b>
    </div>

  </div>
`;

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
    message = "All 4 players joined!";
  }

} else if (state.phase === "bid") {

  if (current?.id === socket.id) {
    message =
      `🎯 ${current.name}'s Turn — Choose Bid`;
  } else {
    message =
      `⏳ Waiting for ${current?.name || "Player"}...`;
  }

} else if (state.phase === "play") {

  if (current?.id === socket.id) {
    message =
      `🎯 ${current.name}'s Turn — Play a Card`;
  } else {
    message =
      `⏳ Waiting for ${current?.name || "Player"}...`;
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

let chosenSuit = "♠";

function renderControls() {

  const controls = $("controls");

  if (!controls) return;

  controls.innerHTML = "";

  /* BID */

  if (
    state.phase === "bid" &&
    state.players[state.current]?.id === socket.id
  ) {

    controls.innerHTML = `
      <div class="bidTitle">
        Choose Bid + Rang
      </div>

      <div class="bidControls">

        ${[8, 9, 10, 11, 12, 13]
          .map(n => `
            <button
              type="button"
              onclick="makeBid(${n})">
              ${n}
            </button>
          `)
          .join("")}

      </div>

      <div class="bidControls">

        ${["♠", "♥", "♦", "♣"]
          .map(s => `
            <button
              type="button"
              onclick="chooseSuit('${s}')">
              ${s}
            </button>
          `)
          .join("")}

      </div>

      <div id="chosen">
        Rang: ${chosenSuit}
      </div>
    `;
  }

  /* NEXT ROUND */

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

function makeBid(value) {

  socket.emit("bid", {
    value: value,
    trump: chosenSuit
  });
}

/* =========================
   CHOOSE TRUMP
========================= */

function chooseSuit(suit) {

  chosenSuit = suit;

  const chosen = $("chosen");

  if (chosen) {

    chosen.textContent =
      `Rang selected: ${suit} · Now choose bid`;
  }
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

let localStream = null;
let micOn = false;

const micBtn = $("micBtn");
const voiceStatus = $("voiceStatus");

if (micBtn) {

  micBtn.onclick = async () => {

    try {

      if (!micOn) {

        localStream =
          await navigator.mediaDevices.getUserMedia({
            audio: true
          });

        micOn = true;

        micBtn.textContent = "🔴 Mic On";

        if (voiceStatus) {
          voiceStatus.textContent =
            "Microphone is ON";
        }

      } else {

        if (localStream) {
          localStream
            .getTracks()
            .forEach(track => track.stop());
        }

        localStream = null;
        micOn = false;

        micBtn.textContent = "🎤 Mic Off";

        if (voiceStatus) {
          voiceStatus.textContent =
            "Microphone is off";
        }
      }

    } catch (err) {

      console.error("MIC ERROR:", err);

      if (voiceStatus) {
        voiceStatus.textContent =
          "Microphone permission denied";
      }

    }

  };

}
