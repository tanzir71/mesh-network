import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const NATO = [
  "Alpha","Bravo","Charlie","Delta","Echo","Foxtrot","Golf","Hotel",
  "India","Juliet","Kilo","Lima","Mike","November","Oscar","Papa",
  "Quebec","Romeo","Sierra","Tango","Uniform","Victor","Whiskey",
  "Xray","Yankee","Zulu",
];

function randomId(len = 8) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  return Array.from({ length: len }, () =>
    chars[Math.floor(Math.random() * chars.length)],
  ).join("");
}

function randomName() {
  return `Node-${NATO[Math.floor(Math.random() * NATO.length)]}`;
}

export type Peer = {
  id: string;
  name: string;
  location: string;
  lastSeen: number;
};

export type ChatMessage = {
  id: string;
  from: string;
  fromId: string;
  text: string;
  timestamp: number;
};

export type SosAlert = {
  id: string;
  from: string;
  fromId: string;
  message: string;
  timestamp: number;
  acked: boolean;
};

type MeshPayload =
  | { type: "CHAT"; msg: ChatMessage }
  | { type: "SOS"; alert: SosAlert }
  | { type: "SOS_ACK"; alertId: string; from: string };

type MeshEnvelope = {
  type: "MESH";
  id: string;
  originId: string;
  fromId: string;
  ttl: number;
  payload: MeshPayload;
};

type WsMessage =
  | { type: "ANNOUNCE"; node: Peer; room: string }
  | { type: "HEARTBEAT"; node: Peer; room: string }
  | { type: "GOODBYE"; id: string; room: string }
  | {
      type: "SIGNAL";
      to: string;
      from: string;
      room: string;
      data: { sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit };
    };

const PEER_TIMEOUT_MS = 10_000;
const HEARTBEAT_MS = 3_000;
const DEFAULT_TTL = 6;
const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: ["stun:stun.l.google.com:19302"] },
];
const MAX_SEEN_IDS = 5000;

const myId = randomId();
const myName = randomName();

function pickWsUrl(): string {
  const u = new URL(window.location.href);
  const override = u.searchParams.get("ws");
  if (override) return override;
  const wsProto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${wsProto}//${window.location.host}/api/ws/mesh`;
}

function pickRoom(): string {
  const u = new URL(window.location.href);
  const room = u.searchParams.get("room");
  if (room && room.trim()) return room.trim();
  return "public";
}

function pickMaxConnections(): number {
  const u = new URL(window.location.href);
  const raw = u.searchParams.get("k");
  const n = raw ? Number(raw) : 6;
  if (!Number.isFinite(n)) return 6;
  return Math.max(1, Math.min(16, Math.floor(n)));
}

function wsToHttpIceUrl(wsUrl: string): string | null {
  try {
    const u = new URL(wsUrl);
    const proto = u.protocol === "wss:" ? "https:" : "http:";
    return `${proto}//${u.host}/api/mesh/ice`;
  } catch {
    return null;
  }
}

async function fetchIceServers(iceUrl: string): Promise<RTCIceServer[] | null> {
  try {
    const res = await fetch(iceUrl, { method: "GET" });
    if (!res.ok) return null;
    const data: unknown = await res.json();
    const servers = (data as { iceServers?: unknown })?.iceServers;
    if (!Array.isArray(servers)) return null;
    const parsed: RTCIceServer[] = [];
    for (const s of servers) {
      if (!s || typeof s !== "object") continue;
      const urls = (s as { urls?: unknown }).urls;
      if (typeof urls !== "string" && !Array.isArray(urls)) continue;
      const username =
        typeof (s as { username?: unknown }).username === "string"
          ? ((s as { username?: string }).username as string)
          : undefined;
      const credential =
        typeof (s as { credential?: unknown }).credential === "string"
          ? ((s as { credential?: string }).credential as string)
          : undefined;
      parsed.push({ urls: urls as string | string[], username, credential });
    }
    return parsed.length ? parsed : null;
  } catch {
    return null;
  }
}

function toWireCandidate(c: RTCIceCandidate): RTCIceCandidateInit {
  const anyCand = c as unknown as { toJSON?: () => RTCIceCandidateInit };
  if (typeof anyCand.toJSON === "function") return anyCand.toJSON();
  return {
    candidate: c.candidate,
    sdpMid: c.sdpMid,
    sdpMLineIndex: c.sdpMLineIndex,
    usernameFragment: c.usernameFragment ?? undefined,
  };
}

export function useMesh() {
  const [myNode, setMyNode] = useState<Peer>({
    id: myId,
    name: myName,
    location: "Unavailable",
    lastSeen: Date.now(),
  });
  const [peers, setPeers] = useState<Map<string, Peer>>(new Map());
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sosAlerts, setSosAlerts] = useState<SosAlert[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const peerConnsRef = useRef(new Map<string, RTCPeerConnection>());
  const dataChRef = useRef(new Map<string, RTCDataChannel>());
  const seenRef = useRef(new Set<string>());
  const seenQueueRef = useRef<string[]>([]);
  const myNodeRef = useRef(myNode);
  myNodeRef.current = myNode;
  const iceServersRef = useRef<RTCIceServer[]>(DEFAULT_ICE_SERVERS);
  const iceReadyRef = useRef(false);
  const pendingConnectRef = useRef(new Set<string>());

  const wsUrl = useMemo(() => pickWsUrl(), []);
  const room = useMemo(() => pickRoom(), []);
  const maxConnections = useMemo(() => pickMaxConnections(), []);

  const sendSignal = useCallback(
    (to: string, data: { sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit }) => {
      if (wsRef.current?.readyState !== WebSocket.OPEN) return;
      const msg: WsMessage = { type: "SIGNAL", to, from: myId, room, data };
      wsRef.current.send(JSON.stringify(msg));
    },
    [room],
  );

  const rememberSeen = useCallback((id: string) => {
    if (seenRef.current.has(id)) return;
    seenRef.current.add(id);
    seenQueueRef.current.push(id);
    if (seenQueueRef.current.length > MAX_SEEN_IDS) {
      const victim = seenQueueRef.current.shift();
      if (victim) seenRef.current.delete(victim);
    }
  }, []);

  const ensureDataChannel = useCallback(
    (peerId: string, ch: RTCDataChannel) => {
      dataChRef.current.set(peerId, ch);

      ch.onmessage = (e) => {
        try {
          const env: MeshEnvelope = JSON.parse(String(e.data));
          if (env?.type !== "MESH") return;
          if (typeof env.id !== "string" || typeof env.originId !== "string") return;
          if (seenRef.current.has(env.id)) return;
          rememberSeen(env.id);

          const payload = env.payload;
          if (payload.type === "CHAT") {
            setMessages((prev) => [...prev, payload.msg]);
          } else if (payload.type === "SOS") {
            setSosAlerts((prev) => {
              if (prev.some((a) => a.id === payload.alert.id)) return prev;
              return [...prev, payload.alert];
            });
          } else if (payload.type === "SOS_ACK") {
            setSosAlerts((prev) =>
              prev.map((a) => (a.id === payload.alertId ? { ...a, acked: true } : a)),
            );
          }

          if (env.ttl <= 0) return;
          const forwarded: MeshEnvelope = {
            ...env,
            fromId: myId,
            ttl: env.ttl - 1,
          };
          const raw = JSON.stringify(forwarded);
          for (const [otherId, otherCh] of dataChRef.current) {
            if (otherId === peerId) continue;
            if (otherCh.readyState === "open") otherCh.send(raw);
          }
        } catch {}
      };

      ch.onclose = () => {
        if (dataChRef.current.get(peerId) === ch) {
          dataChRef.current.delete(peerId);
        }
      };
    },
    [],
  );

  const getOrCreatePeerConn = useCallback(
    (peerId: string) => {
      const existing = peerConnsRef.current.get(peerId);
      if (existing) return existing;

      const pc = new RTCPeerConnection({ iceServers: iceServersRef.current });

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          sendSignal(peerId, { candidate: toWireCandidate(e.candidate) });
        }
      };

      pc.ondatachannel = (e) => {
        ensureDataChannel(peerId, e.channel);
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed" || pc.connectionState === "closed") {
          peerConnsRef.current.delete(peerId);
          dataChRef.current.delete(peerId);
        }
      };

      peerConnsRef.current.set(peerId, pc);
      return pc;
    },
    [ensureDataChannel, sendSignal],
  );

  const connectToPeer = useCallback(
    async (peerId: string) => {
      if (peerId === myId) return;
      if (dataChRef.current.has(peerId)) return;
      if (!iceReadyRef.current) {
        pendingConnectRef.current.add(peerId);
        return;
      }

      const isOfferer = myId.localeCompare(peerId) < 0;
      const pc = getOrCreatePeerConn(peerId);

      if (isOfferer) {
        const ch = pc.createDataChannel("mesh");
        ensureDataChannel(peerId, ch);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        if (pc.localDescription) {
          sendSignal(peerId, { sdp: pc.localDescription });
        }
      }
    },
    [ensureDataChannel, getOrCreatePeerConn, sendSignal],
  );

  const closePeer = useCallback((peerId: string) => {
    const pc = peerConnsRef.current.get(peerId);
    if (pc) pc.close();
    peerConnsRef.current.delete(peerId);
    dataChRef.current.delete(peerId);
  }, []);

  const handleWs = useCallback(
    async (raw: string) => {
      let msg: WsMessage;
      try {
        msg = JSON.parse(raw);
      } catch {
        return;
      }

      if (msg.type === "ANNOUNCE" || msg.type === "HEARTBEAT") {
        if (msg.room !== room) return;
        const node = msg.node;
        if (!node?.id || node.id === myId) return;
        setPeers((prev) => new Map(prev).set(node.id, { ...node, lastSeen: Date.now() }));
        return;
      }

      if (msg.type === "GOODBYE") {
        if (msg.room !== room) return;
        setPeers((prev) => {
          const next = new Map(prev);
          next.delete(msg.id);
          return next;
        });
        closePeer(msg.id);
        return;
      }

      if (msg.type === "SIGNAL") {
        if (msg.room !== room) return;
        if (msg.to !== myId) return;
        const peerId = msg.from;
        const pc = getOrCreatePeerConn(peerId);
        const data = msg.data || {};

        if (data.sdp) {
          const desc = new RTCSessionDescription(data.sdp);
          const isOffer = desc.type === "offer";
          await pc.setRemoteDescription(desc);
          if (isOffer) {
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            if (pc.localDescription) {
              sendSignal(peerId, { sdp: pc.localDescription });
            }
          }
        }

        if (data.candidate) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
          } catch {}
        }
      }
    },
    [closePeer, getOrCreatePeerConn, room, sendSignal],
  );

  const broadcast = useCallback(
    (payload: MeshPayload) => {
      const env: MeshEnvelope = {
        type: "MESH",
        id: randomId(14),
        originId: myId,
        fromId: myId,
        ttl: DEFAULT_TTL,
        payload,
      };
      rememberSeen(env.id);
      const raw = JSON.stringify(env);
      for (const ch of dataChRef.current.values()) {
        if (ch.readyState === "open") ch.send(raw);
      }
    },
    [rememberSeen],
  );

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = `${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`;
        setMyNode((n) => ({ ...n, location: loc }));
      },
      () => {},
    );
  }, []);

  useEffect(() => {
    const u = new URL(window.location.href);
    const override = u.searchParams.get("ice");
    const derived = wsToHttpIceUrl(wsUrl);
    const iceUrl = override || derived;
    if (!iceUrl) {
      iceReadyRef.current = true;
      return;
    }
    fetchIceServers(iceUrl).then((servers) => {
      if (servers) iceServersRef.current = servers;
      iceReadyRef.current = true;
      for (const id of pendingConnectRef.current) {
        void connectToPeer(id);
      }
      pendingConnectRef.current.clear();
    });
  }, [connectToPeer, wsUrl]);

  const desiredConnections = useMemo(() => {
    const ids = Array.from(peers.keys()).filter((id) => id !== myId).sort();
    if (ids.length <= maxConnections) return new Set(ids);
    const all = [...ids, myId].sort();
    const myIdx = all.indexOf(myId);
    const pick = new Set<string>();
    const half = Math.floor(maxConnections / 2);
    for (let i = 1; i <= half; i++) {
      const left = all[(myIdx - i + all.length) % all.length];
      if (left !== myId) pick.add(left);
      const right = all[(myIdx + i) % all.length];
      if (right !== myId) pick.add(right);
      if (pick.size >= maxConnections) break;
    }
    for (const id of all) {
      if (id === myId) continue;
      if (pick.size >= maxConnections) break;
      pick.add(id);
    }
    return pick;
  }, [maxConnections, peers]);

  useEffect(() => {
    for (const peerId of desiredConnections) {
      void connectToPeer(peerId);
    }
    for (const connectedId of peerConnsRef.current.keys()) {
      if (!desiredConnections.has(connectedId)) {
        closePeer(connectedId);
      }
    }
  }, [closePeer, connectToPeer, desiredConnections]);

  useEffect(() => {
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    let heartbeat: ReturnType<typeof setInterval> | null = null;
    let peerCleanup: ReturnType<typeof setInterval> | null = null;

    ws.onopen = () => {
      ws.send(
        JSON.stringify({ type: "ANNOUNCE", node: myNodeRef.current, room } satisfies WsMessage),
      );

      heartbeat = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify(
              { type: "HEARTBEAT", node: myNodeRef.current, room } satisfies WsMessage,
            ),
          );
        }
      }, HEARTBEAT_MS);

      peerCleanup = setInterval(() => {
        const now = Date.now();
        setPeers((prev) => {
          const next = new Map(prev);
          for (const [id, p] of next) {
            if (now - p.lastSeen > PEER_TIMEOUT_MS) {
              next.delete(id);
              const pc = peerConnsRef.current.get(id);
              if (pc) pc.close();
              peerConnsRef.current.delete(id);
              dataChRef.current.delete(id);
            }
          }
          return next;
        });
      }, 2_000);
    };

    ws.onmessage = (e) => {
      void handleWs(String(e.data));
    };

    ws.onclose = () => {
      if (heartbeat) clearInterval(heartbeat);
      if (peerCleanup) clearInterval(peerCleanup);
      wsRef.current = null;
    };

    ws.onerror = () => {
      ws.close();
    };

    const handleUnload = () => {
      try {
        ws.send(JSON.stringify({ type: "GOODBYE", id: myId, room } satisfies WsMessage));
      } catch {}
    };
    window.addEventListener("beforeunload", handleUnload);

    return () => {
      window.removeEventListener("beforeunload", handleUnload);
      if (heartbeat) clearInterval(heartbeat);
      if (peerCleanup) clearInterval(peerCleanup);
      try {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "GOODBYE", id: myId, room } satisfies WsMessage));
        }
      } catch {}
      ws.close();
      for (const pc of peerConnsRef.current.values()) pc.close();
      peerConnsRef.current.clear();
      dataChRef.current.clear();
    };
  }, [handleWs, room, wsUrl]);

  useEffect(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({ type: "HEARTBEAT", node: myNode, room } satisfies WsMessage),
      );
    }
  }, [myNode.location, room]);

  const sendMessage = useCallback(
    (text: string) => {
      const msg: ChatMessage = {
        id: randomId(12),
        from: myName,
        fromId: myId,
        text,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, msg]);
      broadcast({ type: "CHAT", msg });
    },
    [broadcast],
  );

  const sendSOS = useCallback(
    (message = "EMERGENCY - Immediate assistance required") => {
      const alert: SosAlert = {
        id: randomId(12),
        from: myName,
        fromId: myId,
        message,
        timestamp: Date.now(),
        acked: false,
      };
      setSosAlerts((prev) => [...prev, alert]);
      broadcast({ type: "SOS", alert });
    },
    [broadcast],
  );

  const ackSOS = useCallback(
    (alertId: string) => {
      setSosAlerts((prev) =>
        prev.map((a) => (a.id === alertId ? { ...a, acked: true } : a)),
      );
      broadcast({ type: "SOS_ACK", alertId, from: myName });
    },
    [broadcast],
  );

  const peerList = useMemo(() => Array.from(peers.values()), [peers]);
  return { myNode, peers: peerList, messages, sosAlerts, sendMessage, sendSOS, ackSOS };
}
