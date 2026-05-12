import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import { logger } from "./lib/logger";

type Client = {
  ws: WebSocket;
  nodeId: string | null;
  room: string | null;
};

const clients = new Map<WebSocket, Client>();

function broadcast(senderWs: WebSocket, data: string) {
  const sender = clients.get(senderWs);
  const room = sender?.room ?? null;
  for (const [ws, client] of clients) {
    if (ws !== senderWs && ws.readyState === WebSocket.OPEN) {
      if (room && client.room !== room) continue;
      ws.send(data);
    }
  }
}

function sendToNodeInRoom(nodeId: string, room: string | null, data: string): number {
  let sent = 0;
  for (const [ws, client] of clients) {
    if (client.nodeId !== nodeId) continue;
    if (room && client.room !== room) continue;
    if (ws.readyState !== WebSocket.OPEN) continue;
    ws.send(data);
    sent++;
  }
  return sent;
}

export function setupMeshWebSocket(server: Server) {
  const wss = new WebSocketServer({ server, path: "/api/ws/mesh" });

  wss.on("connection", (ws: WebSocket) => {
    const client: Client = { ws, nodeId: null, room: null };
    clients.set(ws, client);
    logger.info({ total: clients.size }, "Mesh peer connected");

    ws.on("message", (data: Buffer) => {
      const raw = data.toString();
      try {
        const msg: unknown = JSON.parse(raw);
        if (
          typeof msg === "object" &&
          msg !== null &&
          "type" in msg &&
          (msg as { type?: unknown }).type === "SIGNAL"
        ) {
          const m = msg as {
            type: "SIGNAL";
            to?: unknown;
            from?: unknown;
            room?: unknown;
            data?: unknown;
          };
          if (typeof m.to !== "string" || typeof m.from !== "string") {
            return;
          }
          if (typeof m.room === "string" && !client.room) {
            client.room = m.room;
          }
          const forwarded = sendToNodeInRoom(m.to, client.room, raw);
          if (forwarded === 0) {
            logger.info(
              { to: m.to, from: m.from, room: client.room },
              "Signal message dropped (target not connected)",
            );
          }
          return;
        }

        const m = msg as {
          type?: unknown;
          node?: { id?: unknown };
          room?: unknown;
        };
        if (
          (m.type === "ANNOUNCE" || m.type === "HEARTBEAT") &&
          typeof m.node?.id === "string"
        ) {
          client.nodeId = m.node.id;
          if (typeof m.room === "string") {
            client.room = m.room;
          }
        }
        broadcast(ws, raw);
      } catch {
        logger.warn("Invalid mesh message received");
      }
    });

    ws.on("close", () => {
      const id = client.nodeId;
      clients.delete(ws);
      logger.info(
        { nodeId: id, room: client.room, total: clients.size },
        "Mesh peer disconnected",
      );
      if (id) {
        broadcast(ws, JSON.stringify({ type: "GOODBYE", id, room: client.room ?? "public" }));
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
