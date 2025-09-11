// server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
app.get("/", (req, res) => res.send("Signaling server running 🚀"));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

io.on("connection", (socket) => {
  console.log("connected:", socket.id);

  // join a specific room
  socket.on("join-room", ({ room }) => {
    if (!room) return;
    socket.join(room);
    socket.room = room; // store room on socket for convenience

    // give the new client the list of other sockets in the same room
    const clients = Array.from(io.sockets.adapter.rooms.get(room) || []);
    const others = clients.filter((id) => id !== socket.id);
    socket.emit("users", others);

    console.log(`${socket.id} joined room ${room}. Others:`, others);
  });

  // leave a room explicitly
  socket.on("leave-room", () => {
    const room = socket.room;
    if (room) {
      socket.leave(room);
      socket.to(room).emit("user-disconnected", socket.id);
      delete socket.room;
      console.log(`${socket.id} left room ${room}`);
    }
  });

  // signalling - only forward to the target if it exists and is in the same room
  socket.on("offer", ({ to, sdp }) => {
    const target = io.sockets.sockets.get(to);
    if (target && socket.room && target.rooms.has(socket.room)) {
      io.to(to).emit("offer", { from: socket.id, sdp });
    } else {
      console.warn("Offer ignored (target not in same room) ->", to);
    }
  });

  socket.on("answer", ({ to, sdp }) => {
    const target = io.sockets.sockets.get(to);
    if (target && socket.room && target.rooms.has(socket.room)) {
      io.to(to).emit("answer", { from: socket.id, sdp });
    } else {
      console.warn("Answer ignored (target not in same room) ->", to);
    }
  });

  socket.on("candidate", ({ to, candidate }) => {
    const target = io.sockets.sockets.get(to);
    if (target && socket.room && target.rooms.has(socket.room)) {
      io.to(to).emit("candidate", { from: socket.id, candidate });
    } else {
      console.warn("Candidate ignored (target not in same room) ->", to);
    }
  });

  socket.on("disconnect", () => {
    const room = socket.room;
    if (room) {
      socket.to(room).emit("user-disconnected", socket.id);
    }
    console.log("disconnected:", socket.id);
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Signaling server running on :${PORT}`));
