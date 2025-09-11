// server.js
import express from "express";
import http from "http";
import { Server } from "socket.io";

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "https://multicam-frontend.vercel.app", // your frontend domain
    methods: ["GET", "POST"],
  },
});

// Root endpoint
app.get("/", (req, res) => {
  res.send("✅ Multicam signaling server is running.");
});

io.on("connection", (socket) => {
  console.log("New connection:", socket.id);
  let currentRoom = null;

  socket.on("join-room", (roomId) => {
    currentRoom = roomId;
    socket.join(roomId);
    console.log(`${socket.id} joined room ${roomId}`);

    // Other users in the room
    const room = io.sockets.adapter.rooms.get(roomId);
    const otherUsers = room ? [...room].filter((id) => id !== socket.id) : [];

    // Send existing users to the joining user
    socket.emit("users", otherUsers);

    // Notify others
    socket.to(roomId).emit("user-joined", socket.id);
  });

  socket.on("offer", ({ to, sdp }) => io.to(to).emit("offer", { from: socket.id, sdp }));
  socket.on("answer", ({ to, sdp }) => io.to(to).emit("answer", { from: socket.id, sdp }));
  socket.on("candidate", ({ to, candidate }) => io.to(to).emit("candidate", { from: socket.id, candidate }));

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
server.listen(PORT, () => console.log(`🚀 Signaling server running on port ${PORT}`));
