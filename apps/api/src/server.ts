import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { setSocketServer } from "./common/realtime/socket";
import { registerRoutes } from "./modules/routes";

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(morgan("tiny"));

registerRoutes(app);

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*" },
});

io.on("connection", (socket) => {
  socket.emit("system:ready", { status: "ok", timestamp: new Date().toISOString() });
});
setSocketServer(io);

const port = Number(process.env.PORT ?? 4000);
httpServer.listen(port, () => {
  // Keep startup output short and grep-friendly for ops dashboards.
  console.log(`SHMMF API running on :${port}`);
});
