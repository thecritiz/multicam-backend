// server.js
import "dotenv/config";
import express from "express";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";
import { authRouter, socketAuth, usingDevJwtSecret } from "./lib/auth.js";

const app = express();
const server = http.createServer(app);

const ALLOWED_ORIGINS = (
  process.env.ALLOWED_ORIGINS || "https://multicam-frontend.vercel.app,http://localhost:3000"
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ["GET", "POST"],
  },
});

app.use(cors({ origin: ALLOWED_ORIGINS }));
app.use(express.json());
app.use("/auth", authRouter);

// Root endpoint
app.get("/", (req, res) => {
  res.send("✅ Multicam signaling server is running.");
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", uptimeSeconds: Math.round(process.uptime()) });
});

// Every socket must present a valid JWT in the handshake (auth: { token }) —
// unauthenticated clients can no longer join rooms or relay signaling.
io.use(socketAuth);

const usernameOf = (socketId) => io.sockets.sockets.get(socketId)?.data?.user?.username || null;

io.on("connection", (socket) => {
  console.log("New connection:", socket.id, `(user: ${socket.data.user.username})`);
  let currentRoom = null;

  socket.on("join-room", (roomId) => {
    currentRoom = roomId;
    socket.join(roomId);
    console.log(`${socket.id} (${socket.data.user.username}) joined room ${roomId}`);

    // Other users in the room, with display names now that sockets are authed.
    // Payload shape changed from [id] to [{ id, username }] — frontend updated in lockstep.
    const room = io.sockets.adapter.rooms.get(roomId);
    const otherUsers = room
      ? [...room].filter((id) => id !== socket.id).map((id) => ({ id, username: usernameOf(id) }))
      : [];

    // Send existing users to the joining user
    socket.emit("users", otherUsers);

    // Notify others (shape changed from bare id to { id, username })
    socket.to(roomId).emit("user-joined", { id: socket.id, username: socket.data.user.username });
  });

  socket.on("offer", ({ to, sdp }) => io.to(to).emit("offer", { from: socket.id, sdp }));
  socket.on("answer", ({ to, sdp }) => io.to(to).emit("answer", { from: socket.id, sdp }));
  socket.on("candidate", ({ to, candidate }) => io.to(to).emit("candidate", { from: socket.id, candidate }));

  // Presenting state: when a member starts/stops screen sharing, the room is
  // told so every client can promote the presenter to their spotlight
  // (FaceTime-style "the share takes the stage"). Relay-only; the sharer
  // re-emits on user-joined so late joiners catch up.
  socket.on("presenting", (presenting) => {
    if (!currentRoom) return;
    socket.to(currentRoom).emit("presenting", { from: socket.id, presenting: Boolean(presenting) });
  });

  // Room chat. Sender identity comes from the authed socket, never the client
  // payload. io.to(room) includes the sender, so everyone (sender included)
  // renders the message via the same event — no local echo path to drift.
  socket.on("chat", (text) => {
    if (!currentRoom || typeof text !== "string") return;
    const trimmed = text.trim().slice(0, 500);
    if (!trimmed) return;
    io.to(currentRoom).emit("chat", {
      from: socket.id,
      username: socket.data.user.username,
      text: trimmed,
      ts: Date.now(),
    });
  });

  socket.on("leave-room", () => {
    if (!currentRoom) return;
    socket.leave(currentRoom);
    socket.to(currentRoom).emit("user-disconnected", socket.id);
    currentRoom = null;
  });

  socket.on("disconnect", () => {
    console.log(`${socket.id} disconnected`);
    if (currentRoom) socket.to(currentRoom).emit("user-disconnected", socket.id);
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Signaling server running on port ${PORT}`);
  if (usingDevJwtSecret) {
    console.warn("⚠️  JWT_SECRET is not set — using an insecure dev fallback. Set it in production.");
  }
});
