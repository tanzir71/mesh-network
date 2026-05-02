import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";

const NATO = [
  "Alpha","Bravo","Charlie","Delta","Echo","Foxtrot","Golf","Hotel",
  "India","Juliet","Kilo","Lima","Mike","November","Oscar","Papa",
  "Quebec","Romeo","Sierra","Tango","Uniform","Victor","Whiskey",
  "Xray","Yankee","Zulu",
];

function randomId(len = 8) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  return Array.from({ length: len }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join("");
}

function randomName() {
  return "Node-" + NATO[Math.floor(Math.random() * NATO.length)];
}

export type NodeInfo = {
  id: string;
  name: string;
  location: string;
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

type MeshMessage =
  | { type: "ANNOUNCE" | "HEARTBEAT"; node: NodeInfo }
  | { type: "GOODBYE"; id: string }
  | { type: "CHAT"; msg: ChatMessage }
  | { type: "SOS"; alert: SosAlert }
  | { type: "SOS_ACK"; alertId: string; from: string };

type MeshContextType = {
  myNode: NodeInfo;
  peers: NodeInfo[];
  messages: ChatMessage[];
  sosAlerts: SosAlert[];
  connected: boolean;
  sendMessage: (text: string) => void;
  sendSOS: (message?: string) => void;
  ackSOS: (alertId: string) => void;
};

const MeshContext = createContext<MeshContextType | null>(null);

const PEER_TIMEOUT = 10000;
const HEARTBEAT_MS = 3000;
const WS_URL = `wss://${process.env.EXPO_PUBLIC_DOMAIN}/api/ws/mesh`;

export function MeshProvider({ children }: { children: React.ReactNode }) {
  const [myNode, setMyNode] = useState<NodeInfo>({
    id: "",
    name: "",
    location: "Unavailable",
  });
  const [peers, setPeers] = useState<Map<string, NodeInfo & { lastSeen: number }>>(new Map());
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sosAlerts, setSosAlerts] = useState<SosAlert[]>([]);
  const [connected, setConnected] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const myNodeRef = useRef<NodeInfo>(myNode);
  myNodeRef.current = myNode;
  const reconnectTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const peerCleanupInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const initialized = useRef(false);

  useEffect(() => {
    async function initNode() {
      let id = await AsyncStorage.getItem("mesh_node_id");
      let name = await AsyncStorage.getItem("mesh_node_name");
      if (!id) {
        id = randomId();
        await AsyncStorage.setItem("mesh_node_id", id);
      }
      if (!name) {
        name = randomName();
        await AsyncStorage.setItem("mesh_node_name", name);
      }
      setMyNode((prev) => ({ ...prev, id, name: name! }));
    }
    initNode();
  }, []);

  useEffect(() => {
    if (!myNode.id) return;
    if (initialized.current) return;
    initialized.current = true;
    getLocation();
    connect();
    return () => cleanup();
  }, [myNode.id]);

  function getLocation() {
    if (Platform.OS !== "web") {
      import("expo-location").then((Location) => {
        Location.requestForegroundPermissionsAsync().then(({ status }) => {
          if (status === "granted") {
            Location.getCurrentPositionAsync({}).then((pos) => {
              const loc = `${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`;
              setMyNode((prev) => ({ ...prev, location: loc }));
            }).catch(() => {});
          }
        });
      }).catch(() => {});
    } else {
      navigator.geolocation?.getCurrentPosition(
        (pos) => {
          const loc = `${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`;
          setMyNode((prev) => ({ ...prev, location: loc }));
        },
        () => {}
      );
    }
  }

  function send(msg: MeshMessage) {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }

  function connect() {
    if (!myNodeRef.current.id) return;
    try {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        send({ type: "ANNOUNCE", node: myNodeRef.current });
        heartbeatInterval.current = setInterval(() => {
          send({ type: "HEARTBEAT", node: myNodeRef.current });
        }, HEARTBEAT_MS);
        peerCleanupInterval.current = setInterval(() => {
          const now = Date.now();
          setPeers((prev) => {
            const next = new Map(prev);
            for (const [id, p] of next) {
              if (now - p.lastSeen > PEER_TIMEOUT) next.delete(id);
            }
            return next;
          });
        }, 5000);
      };

      ws.onmessage = (e) => {
        try {
          const data: MeshMessage = JSON.parse(e.data);
          handleMessage(data);
        } catch {}
      };

      ws.onclose = () => {
        setConnected(false);
        clearInterval(heartbeatInterval.current!);
        clearInterval(peerCleanupInterval.current!);
        wsRef.current = null;
        reconnectTimeout.current = setTimeout(connect, 3000);
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch {}
  }

  function handleMessage(data: MeshMessage) {
    if (data.type === "ANNOUNCE" || data.type === "HEARTBEAT") {
      if (data.node.id === myNodeRef.current.id) return;
      setPeers((prev) =>
        new Map(prev).set(data.node.id, { ...data.node, lastSeen: Date.now() })
      );
      if (data.type === "ANNOUNCE") {
        send({ type: "HEARTBEAT", node: myNodeRef.current });
      }
    } else if (data.type === "GOODBYE") {
      setPeers((prev) => {
        const m = new Map(prev);
        m.delete(data.id);
        return m;
      });
    } else if (data.type === "CHAT") {
      if (data.msg.fromId === myNodeRef.current.id) return;
      setMessages((prev) => [data.msg, ...prev]);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } else if (data.type === "SOS") {
      if (data.alert.fromId === myNodeRef.current.id) return;
      setSosAlerts((prev) => {
        if (prev.find((a) => a.id === data.alert.id)) return prev;
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        return [data.alert, ...prev];
      });
    } else if (data.type === "SOS_ACK") {
      setSosAlerts((prev) =>
        prev.map((a) => (a.id === data.alertId ? { ...a, acked: true } : a))
      );
    }
  }

  function cleanup() {
    clearInterval(heartbeatInterval.current!);
    clearInterval(peerCleanupInterval.current!);
    clearTimeout(reconnectTimeout.current!);
    if (wsRef.current) {
      send({ type: "GOODBYE", id: myNodeRef.current.id });
      wsRef.current.close();
    }
  }

  const sendMessage = useCallback((text: string) => {
    const msg: ChatMessage = {
      id: Date.now().toString() + Math.random().toString(36).substring(2, 7),
      from: myNodeRef.current.name,
      fromId: myNodeRef.current.id,
      text,
      timestamp: Date.now(),
    };
    setMessages((prev) => [msg, ...prev]);
    send({ type: "CHAT", msg });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const sendSOS = useCallback((message = "EMERGENCY - Immediate assistance required") => {
    const alert: SosAlert = {
      id: Date.now().toString() + Math.random().toString(36).substring(2, 7),
      from: myNodeRef.current.name,
      fromId: myNodeRef.current.id,
      message,
      timestamp: Date.now(),
      acked: false,
    };
    setSosAlerts((prev) => [alert, ...prev]);
    send({ type: "SOS", alert });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  }, []);

  const ackSOS = useCallback((alertId: string) => {
    setSosAlerts((prev) =>
      prev.map((a) => (a.id === alertId ? { ...a, acked: true } : a))
    );
    send({ type: "SOS_ACK", alertId, from: myNodeRef.current.name });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, []);

  const peerList = Array.from(peers.values());

  return (
    <MeshContext.Provider
      value={{ myNode, peers: peerList, messages, sosAlerts, connected, sendMessage, sendSOS, ackSOS }}
    >
      {children}
    </MeshContext.Provider>
  );
}

export function useMesh() {
  const ctx = useContext(MeshContext);
  if (!ctx) throw new Error("useMesh must be used within MeshProvider");
  return ctx;
}
