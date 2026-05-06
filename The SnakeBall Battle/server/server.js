import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIR = path.resolve(__dirname, "..");
const PORT = Number.parseInt(process.env.PORT || "3000", 10);
const ROOM_SIZE = 11;
const QUICK_ROOM_PREFIX = "Q";

const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".ico", "image/x-icon"],
]);

const botNames = [
  "Nova",
  "Pulse",
  "Orbit",
  "Vector",
  "Blaze",
  "Prism",
  "Comet",
  "Echo",
  "Flux",
  "Quanta",
  "Spark",
];

const rooms = new Map();
const clients = new Map();

function normalizeName(value) {
  return String(value || "Guest")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 16) || "Guest";
}

function normalizeSkinIndex(value) {
  return Number.isInteger(value) ? Math.max(0, Math.min(7, value)) : 0;
}

function safeJson(value) {
  return JSON.stringify(value);
}

function send(client, type, payload = {}) {
  if (client.readyState !== client.OPEN) return;
  client.send(safeJson({ type, ...payload }));
}

function broadcast(room, type, payload = {}) {
  for (const player of room.players.values()) {
    send(player.socket, type, payload);
  }
}

function makeClientId() {
  return `p_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

function makeRoomCode(prefix = "") {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (let attempt = 0; attempt < 24; attempt += 1) {
    let code = prefix;
    while (code.length < 4) {
      code += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    if (!rooms.has(code)) return code;
  }
  throw new Error("Unable to allocate room code");
}

function createRoom({ quick = false } = {}) {
  const code = makeRoomCode(quick ? QUICK_ROOM_PREFIX : "");
  const room = {
    code,
    quick,
    size: ROOM_SIZE,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    players: new Map(),
    bots: [],
  };
  rooms.set(code, room);
  ensureBots(room);
  return room;
}

function ensureBots(room) {
  const needed = Math.max(0, room.size - room.players.size);
  while (room.bots.length < needed) {
    const index = room.bots.length;
    room.bots.push({
      id: `bot_${room.code}_${index}`,
      name: botNames[index % botNames.length],
      skinIndex: (index + 2) % 8,
    });
  }
  while (room.bots.length > needed) {
    room.bots.pop();
  }
  room.updatedAt = Date.now();
}

function publicRoom(room) {
  return {
    code: room.code,
    size: room.size,
    playerCount: room.players.size,
    botCount: room.bots.length,
    quick: room.quick,
    players: [...room.players.values()].map((player) => ({
      id: player.id,
      name: player.name,
      skinIndex: player.skinIndex,
    })),
    bots: room.bots,
  };
}

function findQuickRoom() {
  for (const room of rooms.values()) {
    if (room.quick && room.players.size < room.size) return room;
  }
  return createRoom({ quick: true });
}

function leaveRoom(client) {
  const session = clients.get(client);
  if (!session?.roomCode) return;

  const room = rooms.get(session.roomCode);
  if (room) {
    room.players.delete(session.id);
    ensureBots(room);
    broadcast(room, "room_state", { room: publicRoom(room) });

    if (room.players.size === 0 && Date.now() - room.createdAt > 1000) {
      rooms.delete(room.code);
    }
  }

  session.roomCode = null;
}

function enterRoom(client, room, profile) {
  const session = clients.get(client);
  leaveRoom(client);

  session.name = normalizeName(profile?.name);
  session.skinIndex = normalizeSkinIndex(profile?.skinIndex);
  session.roomCode = room.code;
  room.players.set(session.id, {
    id: session.id,
    socket: client,
    name: session.name,
    skinIndex: session.skinIndex,
    lastInput: {},
  });
  ensureBots(room);

  send(client, "joined_room", { selfId: session.id, room: publicRoom(room) });
  broadcast(room, "room_state", { room: publicRoom(room) });
}

function handleMessage(client, data) {
  let message;
  try {
    message = JSON.parse(String(data));
  } catch {
    send(client, "error_message", { message: "Bad JSON" });
    return;
  }

  if (message.type === "hello") {
    const session = clients.get(client);
    session.name = normalizeName(message.name);
    session.skinIndex = normalizeSkinIndex(message.skinIndex);
    send(client, "hello", {
      selfId: session.id,
      roomSize: ROOM_SIZE,
      serverTime: Date.now(),
    });
    return;
  }

  if (message.type === "create_room") {
    const room = createRoom();
    enterRoom(client, room, message.profile);
    return;
  }

  if (message.type === "join_room") {
    const code = String(message.code || "").trim().toUpperCase();
    const room = rooms.get(code);
    if (!room) {
      send(client, "error_message", { message: "房间不存在" });
      return;
    }
    if (room.players.size >= room.size) {
      send(client, "error_message", { message: "房间真人已满" });
      return;
    }
    enterRoom(client, room, message.profile);
    return;
  }

  if (message.type === "quick_match") {
    enterRoom(client, findQuickRoom(), message.profile);
    return;
  }

  if (message.type === "leave_room") {
    leaveRoom(client);
    send(client, "left_room");
    return;
  }

  if (message.type === "input") {
    const session = clients.get(client);
    const room = rooms.get(session?.roomCode);
    const player = room?.players.get(session?.id);
    if (!player) return;
    player.lastInput = {
      at: Date.now(),
      keys: message.keys || {},
      pointer: message.pointer || null,
    };
    return;
  }

  if (message.type === "ping") {
    send(client, "pong", { serverTime: Date.now() });
  }
}

async function serveStatic(req, res) {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/health") {
    res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    res.end(safeJson({ ok: true, rooms: rooms.size, clients: clients.size }));
    return;
  }
  if (pathname === "/") pathname = "/index.html";
  if (pathname.startsWith("/server/")) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  const filePath = path.resolve(CLIENT_DIR, `.${pathname}`);
  if (!filePath.startsWith(CLIENT_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const body = await readFile(filePath);
    res.writeHead(200, {
      "content-type": contentTypes.get(path.extname(filePath)) || "application/octet-stream",
      "cache-control": pathname === "/index.html" ? "no-cache" : "public, max-age=60",
    });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}

const server = createServer((req, res) => {
  serveStatic(req, res).catch((error) => {
    console.error(error);
    res.writeHead(500);
    res.end("Server error");
  });
});

const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (client) => {
  const id = makeClientId();
  clients.set(client, {
    id,
    name: "Guest",
    skinIndex: 0,
    roomCode: null,
  });
  send(client, "hello", { selfId: id, roomSize: ROOM_SIZE, serverTime: Date.now() });

  client.on("message", (data) => handleMessage(client, data));
  client.on("close", () => {
    leaveRoom(client);
    clients.delete(client);
  });
});

setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (room.players.size === 0 && now - room.updatedAt > 10 * 60 * 1000) {
      rooms.delete(code);
    }
  }
}, 60 * 1000).unref();

server.listen(PORT, () => {
  console.log(`SnakeBall server listening on http://localhost:${PORT}`);
});
