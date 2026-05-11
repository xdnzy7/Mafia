import { io } from 'socket.io-client';

export function createSocket() {
  const url = import.meta.env.VITE_SOCKET_URL;

  if (!url) {
    throw new Error('Missing VITE_SOCKET_URL. Set it to your Render Socket.IO backend URL.');
  }

  return io(url, {
    transports: ['websocket', 'polling'],
  });
}
