const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: process.env.ALLOWED_ORIGIN || '*' }
});

const PORT = Number(process.env.PORT) || 3000;
const rooms = new Map();

app.disable('x-powered-by');
app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

function normalizeRoomId(value) {
  if (typeof value !== 'string') return null;
  const roomId = value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  return /^[A-Z0-9]{4,10}$/.test(roomId) ? roomId : null;
}

function getRoom(roomId) {
  if (!rooms.has(roomId)) rooms.set(roomId, { broadcasterId: null, viewers: new Set() });
  return rooms.get(roomId);
}

function cleanupRoom(roomId) {
  const room = rooms.get(roomId);
  if (room && !room.broadcasterId && room.viewers.size === 0) rooms.delete(roomId);
}

function leaveCurrentRoom(socket, { notify = true } = {}) {
  const roomId = socket.data.roomId;
  const role = socket.data.role;
  if (!roomId || !role) return;

  const room = rooms.get(roomId);
  if (room) {
    if (role === 'broadcaster' && room.broadcasterId === socket.id) {
      room.broadcasterId = null;
      if (notify) io.to(roomId).emit('broadcast-stopped');
    } else if (role === 'viewer') {
      room.viewers.delete(socket.id);
      if (notify && room.broadcasterId) {
        io.to(room.broadcasterId).emit('viewer-left', { viewerId: socket.id });
      }
    }
  }

  socket.leave(roomId);
  socket.data.roomId = null;
  socket.data.role = null;
  cleanupRoom(roomId);
}

io.on('connection', (socket) => {
  socket.data.roomId = null;
  socket.data.role = null;

  socket.on('join-room', (data = {}) => {
    const roomId = normalizeRoomId(data.roomId);
    const role = data.role;

    if (!roomId || !['broadcaster', 'viewer'].includes(role)) {
      socket.emit('room-error', { message: 'Código de sala inválido.' });
      return;
    }

    leaveCurrentRoom(socket);
    const room = getRoom(roomId);

    if (role === 'broadcaster' && room.broadcasterId && room.broadcasterId !== socket.id) {
      socket.emit('room-error', { message: 'Esta sala já tem alguém transmitindo. Crie uma nova sala.' });
      cleanupRoom(roomId);
      return;
    }

    socket.data.roomId = roomId;
    socket.data.role = role;
    socket.join(roomId);

    if (role === 'broadcaster') {
      room.broadcasterId = socket.id;
      socket.emit('room-joined', { roomId, role, viewerCount: room.viewers.size });
      for (const viewerId of room.viewers) {
        io.to(viewerId).emit('broadcaster-available', { broadcasterId: socket.id });
        socket.emit('viewer-joined', { viewerId });
      }
    } else {
      room.viewers.add(socket.id);
      socket.emit('room-joined', { roomId, role, isLive: Boolean(room.broadcasterId) });
      if (room.broadcasterId) {
        socket.emit('broadcaster-available', { broadcasterId: room.broadcasterId });
        io.to(room.broadcasterId).emit('viewer-joined', { viewerId: socket.id });
      }
    }
  });

  socket.on('signal', (data = {}) => {
    const roomId = socket.data.roomId;
    if (!roomId || data.roomId !== roomId || typeof data.target !== 'string' || !data.payload) return;
    const room = rooms.get(roomId);
    if (!room) return;
    const isPeerInRoom = data.target === room.broadcasterId || room.viewers.has(data.target);
    if (!isPeerInRoom) return;
    io.to(data.target).emit('signal', { from: socket.id, payload: data.payload });
  });

  socket.on('stop-broadcast', () => {
    if (socket.data.role === 'broadcaster') leaveCurrentRoom(socket);
  });

  socket.on('leave-room', () => leaveCurrentRoom(socket));

  socket.on('disconnect', () => leaveCurrentRoom(socket));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`TelaLink disponível em http://localhost:${PORT}`);
});
