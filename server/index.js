import cors from 'cors';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { SOCKET_EVENTS } from '../src/shared/socketEvents.js';

const PORT = process.env.PORT || 3001;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || '*';

const app = express();
app.use(cors({ origin: CLIENT_ORIGIN }));
app.use(express.json());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: CLIENT_ORIGIN,
    methods: ['GET', 'POST'],
  },
});

const rooms = new Map();

function getPublicPlayers(room) {
  return room.players.map(({ socketId, ...player }) => player);
}

function getOrCreateRoom(roomCode) {
  if (!rooms.has(roomCode)) {
    rooms.set(roomCode, {
      roomCode,
      config: null,
      phase: 'waiting',
      players: [],
      hostSocketId: null,
    });
  }

  return rooms.get(roomCode);
}

function emitRoomState(room) {
  io.to(room.roomCode).emit(SOCKET_EVENTS.ROOM_STATE_UPDATED, {
    roomCode: room.roomCode,
    config: room.config,
    phase: room.phase,
    players: getPublicPlayers(room),
  });
}

function emitPlayersUpdated(room) {
  io.to(room.roomCode).emit(SOCKET_EVENTS.ROOM_PLAYERS_UPDATED, {
    roomCode: room.roomCode,
    players: getPublicPlayers(room),
  });
}

function assignRoles(players, config) {
  const roles = [
    ...Array.from({ length: config.mafia }, () => 'mafia'),
    ...Array.from({ length: config.doctor }, () => 'doctor'),
    ...Array.from({ length: config.detective }, () => 'detective'),
    ...Array.from({ length: config.citizen }, () => 'citizen'),
  ];

  return players.map((player, index) => ({
    ...player,
    role: roles[index] || null,
    alive: true,
  }));
}

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

io.on('connection', (socket) => {
  socket.on(SOCKET_EVENTS.HOST_JOIN, ({ roomCode }) => {
    if (!roomCode) return;
    const room = getOrCreateRoom(roomCode);
    room.hostSocketId = socket.id;
    socket.join(roomCode);
    emitRoomState(room);
  });

  socket.on(SOCKET_EVENTS.ROOM_CREATE, ({ roomCode, config }) => {
    if (!roomCode) return;
    const room = getOrCreateRoom(roomCode);
    room.config = config;
    room.phase = 'waiting';
    room.players = [];
    room.hostSocketId = socket.id;
    socket.join(roomCode);
    emitRoomState(room);
    emitPlayersUpdated(room);
  });

  socket.on(SOCKET_EVENTS.PLAYER_JOIN, ({ roomCode, name }, callback) => {
    const trimmedName = typeof name === 'string' ? name.trim() : '';
    if (!roomCode || !trimmedName) {
      callback?.({ ok: false, message: 'رمز الغرفة واسم اللاعب مطلوبان.' });
      return;
    }

    const room = getOrCreateRoom(roomCode);
    socket.join(roomCode);

    const existing = room.players.find((player) => player.name.trim().toLowerCase() === trimmedName.toLowerCase());
    if (existing) {
      existing.socketId = socket.id;
      socket.data.roomCode = roomCode;
      socket.data.playerId = existing.id;
      callback?.({ ok: true, player: { ...existing, socketId: undefined } });
      if (room.hostSocketId) {
        io.to(room.hostSocketId).emit(SOCKET_EVENTS.PLAYER_JOINED, { roomCode, player: { ...existing, socketId: undefined } });
      }
      emitPlayersUpdated(room);
      return;
    }

    if (room.config && room.players.length >= room.config.players) {
      callback?.({ ok: false, message: 'اكتمل عدد اللاعبين في الغرفة.' });
      return;
    }

    const player = {
      id: randomUUID(),
      name: trimmedName,
      alive: true,
      role: null,
      spectator: false,
      socketId: socket.id,
    };

    room.players.push(player);
    socket.data.roomCode = roomCode;
    socket.data.playerId = player.id;

    callback?.({ ok: true, player: { ...player, socketId: undefined } });
    socket.emit(SOCKET_EVENTS.PLAYER_JOINED, { roomCode, player: { ...player, socketId: undefined } });
    if (room.hostSocketId) {
      io.to(room.hostSocketId).emit(SOCKET_EVENTS.PLAYER_JOINED, { roomCode, player: { ...player, socketId: undefined } });
    }
    emitPlayersUpdated(room);
  });

  socket.on(SOCKET_EVENTS.GAME_START, ({ roomCode, config }) => {
    if (!roomCode) return;
    const room = getOrCreateRoom(roomCode);
    if (socket.id !== room.hostSocketId) return;

    const activeConfig = config || room.config;
    if (!activeConfig || room.players.length !== activeConfig.players) {
      socket.emit(SOCKET_EVENTS.ERROR, { message: 'Player count does not match the room configuration.' });
      return;
    }

    room.config = activeConfig;
    room.phase = 'roleReveal';
    room.players = assignRoles(room.players, activeConfig);

    emitRoomState(room);
    room.players.forEach((player) => {
      io.to(player.socketId).emit(SOCKET_EVENTS.PLAYER_ROLE_ASSIGNED, {
        roomCode,
        player: {
          id: player.id,
          name: player.name,
          alive: player.alive,
          role: player.role,
          spectator: player.spectator,
        },
      });
    });
  });

  socket.on('disconnect', () => {
    const { roomCode, playerId } = socket.data;
    if (!roomCode || !playerId) return;
    const room = rooms.get(roomCode);
    if (!room) return;

    const player = room.players.find((item) => item.id === playerId);
    if (player && player.socketId === socket.id) {
      player.socketId = null;
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`Mafia Socket.IO server listening on port ${PORT}`);
});
