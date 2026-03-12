import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server } from 'socket.io';

@WebSocketGateway({
  cors: { origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map(s => s.trim()) : true },
  namespace: '/ws',
})
export class WsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(WsGateway.name);

  handleConnection(client: { id: string }) {
    this.logger.log(`Client connected: ${client.id}`);
    // Optionally verify JWT from handshake auth: client.handshake.auth?.token
  }

  handleDisconnect(client: { id: string }) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  emit(event: string, data: unknown): void {
    this.server?.emit(event, data);
  }
}
