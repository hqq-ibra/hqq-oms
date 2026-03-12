'use client';

import { useEffect } from 'react';
import { useSocket } from '@/providers/socket-provider';
import type { Socket } from 'socket.io-client';

export function useSocketEvent<T>(
  event: string,
  callback: (data: T) => void,
  deps: unknown[] = []
) {
  const { socket } = useSocket();

  useEffect(() => {
    if (!socket) return;
    socket.on(event, callback as (data: unknown) => void);
    return () => {
      socket.off(event);
    };
  }, [socket, event, ...deps]);
}

export { useSocket };
export type { Socket };
