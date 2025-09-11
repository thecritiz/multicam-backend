import express from "express";
import http from "http";
import { Server } from "socket.io";

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "https://multicam-frontend.vercel.app", // ⚠️ Replace with your frontend domain in production (e.g., "https://multicam-frontend.vercel.app")
    methods: ["GET", "POST"],
  },
});

// Optional: a simple root endpoint (so visiting backend URL doesn't show "Cannot GET /")
app.get("/", (req, res) => {
  res.send("✅ Multicam signaling server is running.");
});

io.on("connection", (socket) => {
  console.log("New connection:", socket.id);

  // Store the room ID this socket joined
  let currentRoom = null;

  socket.on("join-room", (roomId) => {
    currentRoom = roomId;
    socket.join(roomId);
    console.log(`${socket.id} joined room ${roomId}`);

    // Get other users in this room
    const room = io.sockets.adapter.rooms.get(roomId);
    const otherUsers = room ? [...room].filter((id) => id !== socket.id) : [];

    // Send the list of existing users to the new user
    socket.emit("users", otherUsers);

    // Notify other users in the room
    socket.to(roomId).emit("user-joined", socket.id);
  });

  // Handle WebRTC signaling events
  socket.on("offer", ({ to, sdp }) => {
    io.to(to).emit("offer", { from: socket.id, sdp });
  });

  socket.on("answer", ({ to, sdp }) => {
    io.to(to).emit("answer", { from: socket.id, sdp });
  });

  socket.on("candidate", ({ to, candidate }) => {
    io.to(to).emit("candidate", { from: socket.id, candidate });
  });

  // Handle disconnect
  socket.on("disconnect", () => {
    console.log(`${socket.id} disconnected`);

    if (currentRoom) {
      // Notify only users in the same room
      socket.to(currentRoom).emit("user-disconnected", socket.id);
    }
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`🚀 Signaling server running on port ${PORT}`));
