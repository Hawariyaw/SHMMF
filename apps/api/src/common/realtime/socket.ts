import type { Server } from "socket.io";

let ioRef: Server | null = null;

export function setSocketServer(io: Server): void {
  ioRef = io;
}

export function emitDashboardRefresh(reason: string): void {
  ioRef?.emit("dashboard:refresh", { reason, timestamp: new Date().toISOString() });
}
