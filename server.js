// server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

// allow CORS from frontend (dev)
const io = new Server(server, { cors: { origin: "*" } });

const users = []; // list of socket ids who joined

io.on("connection", (socket) => {
  console.log("connected:", socket.id);

  // when a client is ready (clicked Start Camera) it emits 'join'
  socket.on("join", () => {
    users.push(socket.id);
    // send the list of existing users (except self) so the new client can create offers
    const others = users.filter((id) => id !== socket.id);
    socket.emit("users", others);
  });

  // routing signaling messages to specific target
  socket.on("offer", ({ to, sdp }) => {
    io.to(to).emit("offer", { from: socket.id, sdp });
  });

  socket.on("answer", ({ to, sdp }) => {
    io.to(to).emit("answer", { from: socket.id, sdp });
  });

  socket.on("candidate", ({ to, candidate }) => {
    io.to(to).emit("candidate", { from: socket.id, candidate });
  });

  socket.on("disconnect", () => {
    console.log("disconnected:", socket.id);
    const idx = users.indexOf(socket.id);
    if (idx !== -1) users.splice(idx, 1);
    // notify others so they can cleanup
    socket.broadcast.emit("user-disconnected", socket.id);
  });
});

const PORT = 5000;
server.listen(PORT, () => console.log(`Signaling server running on :${PORT}`));
