// public/main.js

const statusEl = document.getElementById("status");
const joinBtn = document.getElementById("joinBtn");
const replayBtn = document.getElementById("replayBtn");
const liveBtn = document.getElementById("liveBtn");
const modeLabel = document.getElementById("modeLabel");

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const timeline = document.getElementById("timeline");
const timelineLabel = document.getElementById("timelineLabel");
const logEl = document.getElementById("log");

const players = new Map(); // playerId -> {x,y,color}
const allEvents = []; // ordered Kafka events for slider/log

const mySessionId = Math.random().toString(36).slice(2);
let myId = null;
let myColor = null;
let mode = "live"; // "live" or "replay"
let initialSnapshotLoaded = false;

function setMode(newMode) {
  mode = newMode;
  if (mode === "live") {
    modeLabel.textContent = "Mode: LIVE (following stream)";
    liveBtn.disabled = true;
    replayBtn.disabled = !initialSnapshotLoaded;
  } else {
    modeLabel.textContent = "Mode: REPLAY (slider controls Kafka time)";
    replayBtn.disabled = true;
    liveBtn.disabled = false;
  }
}
setMode("live");

// ---------- WebSocket to backend ----------
const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
const wsUrl = protocol + "//" + window.location.host + "/ws";
const ws = new WebSocket(wsUrl);

ws.onopen = () => {
  statusEl.textContent =
    "Connected to WebSocket (live Kafka stream running)";
  startReplay(); // build initial snapshot for THIS client
};

ws.onclose = () => {
  statusEl.textContent =
    "Disconnected from WebSocket (refresh to reconnect)";
};

ws.onerror = (err) => {
  console.error("WebSocket error", err);
  statusEl.textContent = "WebSocket error (see console)";
};

ws.onmessage = (msg) => {
  let data;
  try {
    data = JSON.parse(msg.data);
  } catch {
    return;
  }

  if (data.control === "REPLAY_START" || data.control === "REPLAY_END") {
    if (data.sessionId !== mySessionId) return;
    if (data.control === "REPLAY_END") {
      initialSnapshotLoaded = true;
      replayBtn.disabled = false;
    }
    return;
  }

  const stream = data.stream || "live"; // "live" or "replay"
  const ev = data.value || {};

  if (stream === "replay" && data.sessionId !== mySessionId) return;

  if (ev.type) {
    allEvents.push({ ev, timestamp: data.timestamp, stream });
    updateTimelineMeta();
    renderLog();
  }

  if (stream === "live" && mode === "live") {
    applyGameEvent(ev);
    draw();
  }

  if (stream === "replay" && !initialSnapshotLoaded) {
    applyGameEvent(ev);
    draw();
  }
};

// ---------- Rendering ----------
function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = "#1f2937";
  ctx.lineWidth = 3;
  ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);

  for (const [id, p] of players.entries()) {
    const isMe = id === myId;
    const size = isMe ? 18 : 14;

    ctx.fillStyle = p.color || "#38bdf8";
    ctx.beginPath();
    ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
    ctx.fill();

    if (isMe) {
      ctx.strokeStyle = "#facc15";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    ctx.fillStyle = "#e5e7eb";
    ctx.font = "11px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(id.slice(0, 4), p.x, p.y - size - 4);
  }
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function applyGameEvent(ev) {
  if (!ev.type) return;

  if (ev.type === "PLAYER_JOINED") {
    players.set(ev.playerId, {
      x: ev.x,
      y: ev.y,
      color: ev.color || "#38bdf8",
    });
  } else if (ev.type === "PLAYER_MOVED") {
    const existing = players.get(ev.playerId) || {
      x: ev.x,
      y: ev.y,
      color: ev.color || "#38bdf8",
    };
    existing.x = ev.x;
    existing.y = ev.y;
    if (ev.color) existing.color = ev.color;
    players.set(ev.playerId, existing);
  }
}

async function sendKafkaEvent(ev) {
  try {
    await fetch("/produce", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ev),
    });
  } catch (e) {
    console.error("Error calling /produce", e);
  }
}

// ---------- Handlers used by controls ----------
async function handleJoin() {
  if (myId) return;

  myId = Math.random().toString(36).slice(2, 8);
  myColor =
    "#" +
    Math.floor(Math.random() * 0xffffff)
      .toString(16)
      .padStart(6, "0");

  const x = 40 + Math.random() * (canvas.width - 80);
  const y = 40 + Math.random() * (canvas.height - 80);

  await sendKafkaEvent({
    type: "PLAYER_JOINED",
    playerId: myId,
    x,
    y,
    color: myColor,
  });

  joinBtn.disabled = true;
  statusEl.textContent = "Joined as " + myId + ". Move with arrows / D-pad.";
}

function handleReplayClick() {
  if (!initialSnapshotLoaded) return;
  setMode("replay");
  timeline.value = String(allEvents.length);
  renderAtIndex(allEvents.length);
}

function handleLiveClick() {
  setMode("live");
  renderAtIndex(allEvents.length);
  statusEl.textContent = "Back to LIVE stream.";
}

function handleMove(dx, dy) {
  if (!myId || mode !== "live") return;
  const SPEED = 10;

  const current = players.get(myId) || {
    x: canvas.width / 2,
    y: canvas.height / 2,
    color: myColor,
  };

  const newX = clamp(current.x + dx * SPEED, 30, canvas.width - 30);
  const newY = clamp(current.y + dy * SPEED, 30, canvas.height - 30);

  sendKafkaEvent({
    type: "PLAYER_MOVED",
    playerId: myId,
    x: newX,
    y: newY,
    color: myColor,
  });
}

// init all buttons + mobile arrows (from controls.js)
if (window.initControls) {
  window.initControls({
    onJoin: handleJoin,
    onReplay: handleReplayClick,
    onLive: handleLiveClick,
    onMove: handleMove,
  });
}

// ---------- Timeline + log ----------
function updateTimelineMeta() {
  timeline.max = String(allEvents.length);
  if (mode === "live") {
    timeline.value = String(allEvents.length);
  }
  timelineLabel.textContent = `${timeline.value} / ${timeline.max}`;
}

function renderAtIndex(idx) {
  players.clear();
  const limit = Math.min(idx, allEvents.length);
  for (let i = 0; i < limit; i++) {
    applyGameEvent(allEvents[i].ev);
  }
  draw();
  timelineLabel.textContent = `${idx} / ${allEvents.length}`;
}

timeline.addEventListener("input", (e) => {
  const idx = Number(e.target.value);
  setMode("replay");
  renderAtIndex(idx);
});

function renderLog() {
  logEl.innerHTML = "";
  const latest = [...allEvents].slice(-100).reverse(); // latest first
  for (const item of latest) {
    const div = document.createElement("div");
    div.className = "log-entry";

    const meta = document.createElement("div");
    meta.className = "log-meta";
    meta.textContent =
      (item.stream === "live" ? "LIVE" : "REPLAY") +
      " • " +
      (item.ev.type || "UNKNOWN");

    const body = document.createElement("div");
    body.className = "log-body";
    body.textContent = JSON.stringify(item.ev);

    div.appendChild(meta);
    div.appendChild(body);
    logEl.appendChild(div);
  }
}

async function startReplay() {
  try {
    await fetch("/replay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: mySessionId }),
    });
  } catch (e) {
    console.error("Error starting replay", e);
  }
}

// initial blank render
draw();
