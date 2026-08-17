import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@callyou/shared';
export type CallYouSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
export function connectSocket(): CallYouSocket {
  return io({
    path: '/socket.io',
    withCredentials: true,
    autoConnect: false,
    reconnection: true,
    reconnectionDelay: 500,
    reconnectionDelayMax: 5000,
  });
}
