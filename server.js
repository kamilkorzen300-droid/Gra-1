const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const DB = path.join(__dirname, "users.json");

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

let users = {};

try {
  users = JSON.parse(fs.readFileSync(DB, "utf8"));
} catch {}

const sessions = new Map();
const players = new Map();

function saveUsers() {
  fs.writeFileSync(DB, JSON.stringify(users, null, 2));
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  return {
    salt,
    hash: crypto.scryptSync(password, salt, 64).toString("hex")
  };
}

function checkPassword(password, saved) {
  const hash = crypto.scryptSync(password, saved.salt, 64);
  const original = Buffer.from(saved.hash, "hex");

  return original.length === hash.length &&
    crypto.timingSafeEqual(original, hash);
}

app.post("/api/register", (req, res) => {
  const nick = String(req.body.nick || "").trim();
  const password = String(req.body.password || "");

  if (!/^[A-Za-z0-9_]{3,16}$/.test(nick))
    return res.status(400).json({
      error: "Nick musi mieć 3–16 znaków."
    });

  if (password.length < 6)
    return res.status(400).json({
      error: "Hasło musi mieć minimum 6 znaków."
    });

  const key = nick.toLowerCase();

  if (users[key])
    return res.status(409).json({
      error: "Ten nick jest zajęty."
    });

  users[key] = {
    nick,
    ...hashPassword(password),
    coins: 0
  };

  saveUsers();

  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, key);

  res.json({
    token,
    nick,
    coins: 0
  });
});

app.post("/api/login", (req, res) => {
  const nick = String(req.body.nick || "").trim();
  const password = String(req.body.password || "");
  const key = nick.toLowerCase();

  if (!users[key] || !checkPassword(password, users[key]))
    return res.status(401).json({
      error: "Nieprawidłowy nick lub hasło."
    });

  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, key);

  res.json({
    token,
    nick: users[key].nick,
    coins: users[key].coins
  });
});

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  const key = sessions.get(token);

  if (!key || !users[key])
    return next(new Error("Zaloguj się ponownie."));

  socket.userKey = key;
  next();
});

io.on("connection", socket => {
  const user = users[socket.userKey];

  const player = {
    id: socket.id,
    nick: user.nick,
    x: 0,
    z: 0,
    rot: 0,
    moving: false
  };

  players.set(socket.id, player);

  socket.emit("world:players", [...players.values()]);
  socket.broadcast.emit("player:join", player);

  socket.on("player:move", data => {
    const p = players.get(socket.id);
    if (!p || !data) return;

    p.x = Math.max(-45, Math.min(45, Number(data.x) || 0));
    p.z = Math.max(-45, Math.min(45, Number(data.z) || 0));
    p.rot = Number(data.rot) || 0;
    p.moving = !!data.moving;

    socket.broadcast.emit("player:update", p);
  });

  socket.on("player:shoot", () => {
    socket.broadcast.emit("player:shoot", {
      id: socket.id
    });
  });

  socket.on("disconnect", () => {
    players.delete(socket.id);
    io.emit("player:leave", socket.id);
  });
});

server.listen(PORT, () => {
  console.log("Gra działa na http://localhost:" + PORT);
});
