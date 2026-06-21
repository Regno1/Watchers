import dotenv from "dotenv";
dotenv.config();

import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import multer from "multer";
import fs from "fs";

const app = express();
const server = createServer(app);
const io = new Server(server);
const rooms = {};

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static("public"));
app.use("/uploads", express.static(join(__dirname, "uploads")));

const uploadsPath = join(__dirname, "uploads");
if (!fs.existsSync(uploadsPath)) fs.mkdirSync(uploadsPath);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads"),
  filename: (req, file, cb) =>
    cb(null, Date.now() + "-" + file.originalname),
});
const upload = multer({ storage });

app.post("/upload", upload.single("video"), (req, res) => {
  if (!req.file) {
    return res
      .status(400)
      .json({ success: false, message: "No file uploaded" });
  }
  const videoPath = `/uploads/${req.file.filename}`;
  res.json({ success: true, path: videoPath });
});

app.get("/watch", (req, res) => {
  res.sendFile(join(__dirname, "app", "vc.html"));
});

// ===== Socket.IO =====

io.on("connection", (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on("join-room", ({ roomId, username }) => {
    socket.join(roomId);
    
    if (!rooms[roomId]) {
      rooms[roomId] = { users: {}, host: socket.id };
    }
    
    rooms[roomId].users[socket.id] = { username, id: socket.id };
    socket.roomId = roomId;
    socket.username = username;

    // Send the user their room info
    socket.emit("room-joined", { 
        roomId, 
        users: rooms[roomId].users, 
        host: rooms[roomId].host,
        me: socket.id
    });

    // Notify others in the room
    socket.to(roomId).emit("user-joined", { 
        username, 
        id: socket.id,
        users: rooms[roomId].users
    });
  });

  // WebRTC signaling for Mesh Network
  socket.on("offer", ({ to, offer }) => {
    io.to(to).emit("offer", { from: socket.id, offer });
  });

  socket.on("answer", ({ to, answer }) => {
    io.to(to).emit("answer", { from: socket.id, answer });
  });

  socket.on("icecandidate", ({ to, candidate }) => {
    io.to(to).emit("icecandidate", { from: socket.id, candidate });
  });

  // Chat
  socket.on("chat-message", (data) => {
    if (socket.roomId) {
       socket.to(socket.roomId).emit("chat-message", data);
    }
  });

  // YouTube sync
  socket.on("sync-youtube-video", ({ videoId, timestamp }) => {
    if (socket.roomId) {
      socket.to(socket.roomId).emit("sync-youtube-video", { videoId, timestamp });
    }
  });

  socket.on("play-video", (timestamp) => {
    if (socket.roomId) {
      socket.to(socket.roomId).emit("play-video", timestamp);
    }
  });

  socket.on("pause-video", (timestamp) => {
    if (socket.roomId) {
      socket.to(socket.roomId).emit("pause-video", timestamp);
    }
  });

  socket.on("media-uploaded", ({ dataUrl, type }) => {
    if (socket.roomId) {
      socket.to(socket.roomId).emit("media-uploaded", { dataUrl, type });
    }
  });

  socket.on("disconnect", () => {
    console.log(`User disconnected: ${socket.id}`);
    const roomId = socket.roomId;
    if (roomId && rooms[roomId]) {
      delete rooms[roomId].users[socket.id];
      
      if (Object.keys(rooms[roomId].users).length === 0) {
        delete rooms[roomId]; // Room empty
      } else {
        // Assign new host if host left
        if (rooms[roomId].host === socket.id) {
          rooms[roomId].host = Object.keys(rooms[roomId].users)[0];
        }
        io.to(roomId).emit("user-disconnected", { 
            id: socket.id, 
            users: rooms[roomId].users,
            host: rooms[roomId].host
        });
      }
    }
  });
});

const PORT = process.env.PORT || 7000;
server.listen(PORT, () => {
  console.log(`Server listening at http://localhost:${PORT}`);
});
