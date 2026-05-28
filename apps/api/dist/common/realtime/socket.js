let ioRef = null;
export function setSocketServer(io) {
    ioRef = io;
}
export function emitDashboardRefresh(reason) {
    ioRef?.emit("dashboard:refresh", { reason, timestamp: new Date().toISOString() });
}
