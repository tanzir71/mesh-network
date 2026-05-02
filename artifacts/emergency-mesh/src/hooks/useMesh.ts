import { useState, useEffect, useRef, useCallback } from "react";

const NATO = [
  "Alpha","Bravo","Charlie","Delta","Echo","Foxtrot","Golf","Hotel",
  "India","Juliet","Kilo","Lima","Mike","November","Oscar","Papa",
  "Quebec","Romeo","Sierra","Tango","Uniform","Victor","Whiskey",
  "Xray","Yankee","Zulu"
];

function randomId(len = 8) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

function randomName() {
  return "Node-" + NATO[Math.floor(Math.random() * NATO.length)];
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

type MeshMessage =
  | { type: "ANNOUNCE"; node: Peer }
  | { type: "HEARTBEAT"; node: Peer }
  | { type: "GOODBYE"; id: string }
  | { type: "CHAT"; msg: ChatMessage }
  | { type: "SOS"; alert: SosAlert }
  | { type: "SOS_ACK"; alertId: string; from: string }
  | { type: "PEER_REQUEST"; fromId: string };

const PEER_TIMEOUT = 8000;
const HEARTBEAT_INTERVAL = 3000;
const CHANNEL_NAME = "emergency-mesh-v1";

const myId = randomId();
const myName = randomName();

export function useMesh() {
  const [myNode, setMyNode] = useState<Peer>({ id: myId, name: myName, location: "Unavailable", lastSeen: Date.now() });
  const [peers, setPeers] = useState<Map<string, Peer>>(new Map());
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sosAlerts, setSosAlerts] = useState<SosAlert[]>([]);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const myNodeRef = useRef(myNode);
  myNodeRef.current = myNode;

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const loc = `${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`;
          setMyNode(n => ({ ...n, location: loc }));
        },
        () => {}
      );
    }
  }, []);

  useEffect(() => {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channelRef.current = channel;

    channel.onmessage = (e: MessageEvent<MeshMessage>) => {
      const data = e.data;
      if (data.type === "ANNOUNCE" || data.type === "HEARTBEAT") {
        if (data.node.id === myId) return;
        setPeers(prev => new Map(prev).set(data.node.id, { ...data.node, lastSeen: Date.now() }));
        if (data.type === "ANNOUNCE") {
          channel.postMessage({ type: "HEARTBEAT", node: myNodeRef.current } satisfies MeshMessage);
        }
      } else if (data.type === "GOODBYE") {
        setPeers(prev => { const m = new Map(prev); m.delete(data.id); return m; });
      } else if (data.type === "CHAT") {
        if (data.msg.fromId === myId) return;
        setMessages(prev => [...prev, data.msg]);
      } else if (data.type === "SOS") {
        if (data.alert.fromId === myId) return;
        setSosAlerts(prev => {
          if (prev.find(a => a.id === data.alert.id)) return prev;
          return [...prev, data.alert];
        });
      } else if (data.type === "SOS_ACK") {
        setSosAlerts(prev => prev.map(a => a.id === data.alertId ? { ...a, acked: true } : a));
      } else if (data.type === "PEER_REQUEST") {
        if (data.fromId !== myId) {
          channel.postMessage({ type: "HEARTBEAT", node: myNodeRef.current } satisfies MeshMessage);
        }
      }
    };

    channel.postMessage({ type: "ANNOUNCE", node: myNodeRef.current } satisfies MeshMessage);
    channel.postMessage({ type: "PEER_REQUEST", fromId: myId } satisfies MeshMessage);

    const heartbeat = setInterval(() => {
      channel.postMessage({ type: "HEARTBEAT", node: myNodeRef.current } satisfies MeshMessage);
      setPeers(prev => {
        const now = Date.now();
        const next = new Map(prev);
        for (const [id, peer] of next) {
          if (now - peer.lastSeen > PEER_TIMEOUT) next.delete(id);
        }
        return next;
      });
    }, HEARTBEAT_INTERVAL);

    const handleUnload = () => {
      channel.postMessage({ type: "GOODBYE", id: myId } satisfies MeshMessage);
    };
    window.addEventListener("beforeunload", handleUnload);

    return () => {
      clearInterval(heartbeat);
      channel.postMessage({ type: "GOODBYE", id: myId } satisfies MeshMessage);
      channel.close();
      window.removeEventListener("beforeunload", handleUnload);
    };
  }, []);

  useEffect(() => {
    if (channelRef.current) {
      channelRef.current.postMessage({ type: "HEARTBEAT", node: myNode } satisfies MeshMessage);
    }
  }, [myNode.location]);

  const sendMessage = useCallback((text: string) => {
    const msg: ChatMessage = { id: randomId(12), from: myName, fromId: myId, text, timestamp: Date.now() };
    setMessages(prev => [...prev, msg]);
    channelRef.current?.postMessage({ type: "CHAT", msg } satisfies MeshMessage);
  }, []);

  const sendSOS = useCallback((message = "EMERGENCY - Immediate assistance required") => {
    const alert: SosAlert = { id: randomId(12), from: myName, fromId: myId, message, timestamp: Date.now(), acked: false };
    setSosAlerts(prev => [...prev, alert]);
    channelRef.current?.postMessage({ type: "SOS", alert } satisfies MeshMessage);
  }, []);

  const ackSOS = useCallback((alertId: string) => {
    setSosAlerts(prev => prev.map(a => a.id === alertId ? { ...a, acked: true } : a));
    channelRef.current?.postMessage({ type: "SOS_ACK", alertId, from: myName } satisfies MeshMessage);
  }, []);

  const peerList = Array.from(peers.values());

  return { myNode, peers: peerList, messages, sosAlerts, sendMessage, sendSOS, ackSOS };
}
