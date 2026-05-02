import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import { logger } from "./lib/logger";

type Client = {
  ws: WebSocket;
  nodeId: string | null;
};

const clients = new Map<WebSocket, Client>();

function broadcast(senderWs: WebSocket, data: string) {
  for (const [ws, client] of clients) {
    if (ws !== senderWs && ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  }
}

export function setupMeshWebSocket(server: Server) {
  const wss = new WebSocketServer({ server, path: "/api/ws/mesh" });

  wss.on("connection", (ws: WebSocket) => {
    const client: Client = { ws, nodeId: null };
    clients.set(ws, client);
    logger.info({ total: clients.size }, "Mesh peer connected");

    ws.on("message", (data: Buffer) => {
      const raw = data.toString();
      try {
        const msg = JSON.parse(raw);
        if ((msg.type === "ANNOUNCE" || msg.type === "HEARTBEAT") && msg.node?.id) {
          client.nodeId = msg.node.id;
        }
        broadcast(ws, raw);
      } catch {
        logger.warn("Invalid mesh message received");
      }
    });

    ws.on("close", () => {
      const id = client.nodeId;
      clients.delete(ws);
      logger.info({ nodeId: id, total: clients.size }, "Mesh peer disconnected");
      if (id) {
        broadcast(ws, JSON.stringify({ type: "GOODBYE", id }));
      }
    });

    ws.on("error", (err) => {
      logger.error({ err }, "Mesh WebSocket error");
      clients.delete(ws);
    });
  });

  logger.info("Mesh WebSocket relay active at /api/ws/mesh");
  return wss;
}
