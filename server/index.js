import cors from 'cors';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { Server } from 'socket.io';

const SOCKET_EVENTS = {
  HOST_JOIN: 'host:join',
  ROOM_CREATE: 'room:create',
  ROOM_JOIN: 'room:join',
  ROOM_STATE_UPDATED: 'room:stateUpdated',
  ROOM_PLAYERS_UPDATED: 'room:playersUpdated',
  ROOM_PLAYERS: 'room:players',
  PLAYER_JOIN: 'player:join',
  PLAYER_JOINED: 'player:joined',
  PLAYER_ROLE_ASSIGNED: 'player:roleAssigned',
  GAME_START: 'game:start',
  GAME_STATE: 'game:state',
  ERROR: 'error',
};

const PORT = process.env.PORT || 3001;
const ALLOWED_ORIGINS = [
  process.env.CLIENT_ORIGIN,
  'https://mafia-f2r5.onrender.com',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
].filter(Boolean);

const app = express();
app.use(cors({ origin: ALLOWED_ORIGINS, credentials: true }));
app.use(express.json());

const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ['GET', 'POST'],
    credentials: true,
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
  const state = {
    roomCode: room.roomCode,
    config: room.config,
    phase: room.phase,
    players: getPublicPlayers(room),
  };

  io.to(room.roomCode).emit(SOCKET_EVENTS.ROOM_STATE_UPDATED, state);
  io.to(room.roomCode).emit(SOCKET_EVENTS.GAME_STATE, state);
}

function emitPlayersUpdated(room) {
  const payload = {
    roomCode: room.roomCode,
    players: getPublicPlayers(room),
  };

  io.to(room.roomCode).emit(SOCKET_EVENTS.ROOM_PLAYERS_UPDATED, payload);
  io.to(room.roomCode).emit(SOCKET_EVENTS.ROOM_PLAYERS, payload);
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

app.get('/', (req, res) => {
  res.status(200).send('Mafia Socket Server Running');
});

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'mafia-server',
  });
});

io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);

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

  const handlePlayerJoin = ({ roomCode, name }, callback) => {
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
  };

  socket.on(SOCKET_EVENTS.PLAYER_JOIN, handlePlayerJoin);
  socket.on(SOCKET_EVENTS.ROOM_JOIN, handlePlayerJoin);

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
    console.log('Player disconnected:', socket.id);

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

server.listen(PORT, () => {
  console.log(`Mafia server running on port ${PORT}`);
});
