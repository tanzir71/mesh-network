import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { NativeEventEmitter, NativeModules, PermissionsAndroid, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import BleManager, { BleScanMode } from "react-native-ble-manager";
import type { EmitterSubscription } from "react-native";
import {
  PERMISSIONS as BLE_PERMISSIONS,
  PROPERTIES as BLE_PROPERTIES,
  addCharacteristicToService as bleAddCharacteristicToService,
  addService as bleAddService,
  isAdvertising as bleIsAdvertising,
  sendNotificationToDevices as bleSendNotificationToDevices,
  setName as bleSetName,
  start as bleStartAdvertising,
  stop as bleStopAdvertising,
} from "rn-ble-connect";
import type { WifiP2pInfo } from "react-native-wifi-p2p";
import {
  initialize as wifiInitialize,
  startDiscoveringPeers as wifiStartDiscoveringPeers,
  stopDiscoveringPeers as wifiStopDiscoveringPeers,
  subscribeOnPeersUpdates as wifiSubscribeOnPeersUpdates,
  subscribeOnConnectionInfoUpdates as wifiSubscribeOnConnectionInfoUpdates,
  connectWithConfig as wifiConnectWithConfig,
  createGroup as wifiCreateGroup,
  removeGroup as wifiRemoveGroup,
  getConnectionInfo as wifiGetConnectionInfo,
  sendMessage as wifiSendMessage,
  sendMessageTo as wifiSendMessageTo,
  receiveMessage as wifiReceiveMessage,
  stopReceivingMessage as wifiStopReceivingMessage,
} from "react-native-wifi-p2p";
import { onPeerDetected, onSyncComplete } from "@/services/backgroundSync";
import {
  getInternetSyncStatus,
  pullPosts as inetPullPosts,
  pushPosts as inetPushPosts,
} from "@/services/internetSync";
import {
  loadRetentionDays,
  saveRetentionDays,
  retentionCutoff,
  isFreshEnough,
} from "@/services/retentionSettings";

const ADJECTIVES = [
  "swift","brave","silent","iron","sharp","wild","bold","calm","keen",
  "lone","sage","grey","deep","fast","clear","storm","frost","ash",
  "jade","steel","amber","crimson","cobalt","ember","hollow","noble",
  "polar","rogue","shadow","stone","thorn","void","wren","zenith",
];
const ANIMALS = [
  "wolf","hawk","bear","fox","owl","elk","ram","crow","lynx","seal",
  "crane","raven","falcon","cobra","viper","eagle","shark","bison",
  "puma","heron","marten","ibis","condor","osprey","kestrel","dingo",
  "ferret","jackal","mink","otter","stoat","vole","weasel","badger",
];

function randomId(len = 8) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  return Array.from({ length: len }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join("");
}

function randomName() {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
  return `${adj}-${animal}`;
}

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const POSTS_STORAGE_KEY = "mesh_posts_v1";

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

export type Post = {
  id: string;
  authorId: string;
  authorName: string;
  text: string;
  lat: number | null;
  lng: number | null;
  timestamp: number;
  expiresAt: number;
};

type MeshMessage =
  | { type: "ANNOUNCE" | "HEARTBEAT"; node: NodeInfo; room: string }
  | { type: "GOODBYE"; id: string; room: string }
  | { type: "CHAT"; msg: ChatMessage }
  | { type: "SOS"; alert: SosAlert }
  | { type: "SOS_ACK"; alertId: string; from: string }
  | { type: "POST_BROADCAST"; post: Post }
  | { type: "POST_SYNC"; posts: Post[]; fromName: string };

type MeshContextType = {
  myNode: NodeInfo;
  peers: NodeInfo[];
  messages: ChatMessage[];
  sosAlerts: SosAlert[];
  posts: Post[];
  connected: boolean;
  retentionDays: number;
  sendMessage: (text: string) => void;
  sendSOS: (message?: string) => void;
  ackSOS: (alertId: string) => void;
  addPost: (text: string) => Promise<void>;
  renameNode: (name: string) => Promise<void>;
  setRetention: (days: number) => Promise<void>;
};

const MeshContext = createContext<MeshContextType | null>(null);

const PEER_TIMEOUT = 10000;
const HEARTBEAT_MS = 3000;
const WS_URL = `wss://${process.env.EXPO_PUBLIC_DOMAIN}/api/ws/mesh`;
const ROOM = process.env.EXPO_PUBLIC_MESH_ROOM || "public";

const BLE_SERVICE_UUID = "26f08670-ffdf-40eb-9067-78b9ae6e7919";
const BLE_CHAR_UUID = "342730d1-9221-4da0-ab8b-bbd7da07ca62";
const BLE_MAX_PACKET = 20;
const BLE_HEADER_LEN = 7;
const BLE_CHUNK_DATA_MAX = BLE_MAX_PACKET - BLE_HEADER_LEN;
const BLE_DEFAULT_TTL = 4;
const BLE_MAX_SEEN = 5000;
const BLE_PACKETS_PER_SEC = 55;
const BLE_PACKET_BURST = 80;
const BLE_FORWARD_MIN_DELAY_MS = 40;
const BLE_FORWARD_MAX_DELAY_MS = 160;
const BLE_MAX_QUEUE = 350;

const WIFI_DEFAULT_TTL = 6;
const WIFI_MAX_SEEN = 6000;
const WIFI_MSGS_PER_SEC = 30;
const WIFI_MSG_BURST = 45;
const WIFI_MAX_QUEUE = 800;

type BleEnvelope = {
  type: "BLE_MESH";
  id: string;
  originId: string;
  ttl: number;
  payload: MeshMessage;
};

type WifiEnvelope = {
  type: "WIFI_MESH";
  id: string;
  originId: string;
  ttl: number;
  room: string;
  payload: MeshMessage;
};

function utf8ToBytes(text: string): number[] {
  const s = unescape(encodeURIComponent(text));
  const out = new Array<number>(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
}

function bytesToUtf8(bytes: ArrayLike<number>): string {
  let s = "";
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    const slice = Array.prototype.slice.call(bytes, i, i + chunk) as number[];
    s += String.fromCharCode(...slice);
  }
  return decodeURIComponent(escape(s));
}

function u32ToBytes(n: number): [number, number, number, number] {
  const v = n >>> 0;
  return [(v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff];
}

function bytesToU32(b0: number, b1: number, b2: number, b3: number): number {
  return (((b0 & 0xff) << 24) | ((b1 & 0xff) << 16) | ((b2 & 0xff) << 8) | (b3 & 0xff)) >>> 0;
}

function randomU32(): number {
  const a = (Date.now() & 0xffffffff) >>> 0;
  const b = Math.floor(Math.random() * 0xffffffff) >>> 0;
  return (a ^ b) >>> 0;
}

function mergePosts(
  existing: Post[],
  incoming: Post[],
  retDays: number
): { posts: Post[]; added: number } {
  const map = new Map(existing.map((p) => [p.id, p]));
  const now = Date.now();
  let added = 0;
  for (const post of incoming) {
    if (
      !map.has(post.id) &&
      post.expiresAt > now &&
      isFreshEnough(post.timestamp, retDays)
    ) {
      map.set(post.id, post);
      added++;
    }
  }
  const cutoff = retentionCutoff(retDays);
  return {
    posts: Array.from(map.values())
      .filter((p) => p.expiresAt > now && p.timestamp >= cutoff)
      .sort((a, b) => b.timestamp - a.timestamp),
    added,
  };
}

async function getCurrentCoords(): Promise<{ lat: number; lng: number } | null> {
  if (Platform.OS !== "web") {
    try {
      const Location = await import("expo-location");
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status === "granted") {
        const pos = await Location.getCurrentPositionAsync({ accuracy: 4 });
        return { lat: pos.coords.latitude, lng: pos.coords.longitude };
      }
    } catch {}
    return null;
  }
  return new Promise((resolve) => {
    if (!navigator?.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { timeout: 5000 }
    );
  });
}

export function MeshProvider({ children }: { children: React.ReactNode }) {
  const [myNode, setMyNode] = useState<NodeInfo>({ id: "", name: "", location: "Unavailable" });
  const [peers, setPeers] = useState<Map<string, NodeInfo & { lastSeen: number }>>(new Map());
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sosAlerts, setSosAlerts] = useState<SosAlert[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [connected, setConnected] = useState(false);
  const [retentionDays, setRetentionDaysState] = useState(365);

  const wsRef = useRef<WebSocket | null>(null);
  const myNodeRef = useRef<NodeInfo>(myNode);
  myNodeRef.current = myNode;
  const postsRef = useRef<Post[]>(posts);
  postsRef.current = posts;
  const retentionRef = useRef(365);

  const reconnectTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const peerCleanupInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const initialized = useRef(false);
  const postsLoaded = useRef(false);

  const bleInitRef = useRef(false);
  const bleScanInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const bleHeartbeatInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const bleIsScanningRef = useRef(false);
  const bleConnectedRef = useRef(new Set<string>());
  const bleSeenRef = useRef(new Set<string>());
  const bleSeenQueueRef = useRef<string[]>([]);
  const bleCleanupRef = useRef<(() => void) | null>(null);
  const blePacketQueueRef = useRef<number[][]>([]);
  const blePacketPumpRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const blePacketBudgetRef = useRef({ tokens: BLE_PACKET_BURST, lastRefillMs: Date.now() });
  const blePartialRef = useRef(
    new Map<string, { total: number; parts: Array<number[] | null>; t: number }>()
  );

  const wifiInitRef = useRef(false);
  const wifiInfoRef = useRef<WifiP2pInfo | null>(null);
  const wifiDiscoverInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const wifiConnectAttemptRef = useRef(0);
  const wifiSubsRef = useRef<EmitterSubscription[]>([]);
  const wifiStopRef = useRef(false);
  const wifiReceiveLoopRef = useRef<Promise<void> | null>(null);
  const wifiClientAddressesRef = useRef(new Set<string>());
  const wifiSeenRef = useRef(new Set<string>());
  const wifiSeenQueueRef = useRef<string[]>([]);
  const wifiQueueRef = useRef<Array<{ message: string; to?: string }>>([]);
  const wifiPumpRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wifiBudgetRef = useRef({ tokens: WIFI_MSG_BURST, lastRefillMs: Date.now() });

  // Load persisted posts + retention setting together on startup
  useEffect(() => {
    async function loadInitialData() {
      const [raw, retDays] = await Promise.all([
        AsyncStorage.getItem(POSTS_STORAGE_KEY),
        loadRetentionDays(),
      ]);
      retentionRef.current = retDays;
      setRetentionDaysState(retDays);
      if (raw) {
        try {
          const parsed: Post[] = JSON.parse(raw);
          const now = Date.now();
          const cutoff = retentionCutoff(retDays);
          const valid = parsed.filter(
            (p) => p.expiresAt > now && p.timestamp >= cutoff
          );
          setPosts(valid);
        } catch {}
      }
      postsLoaded.current = true;
    }
    loadInitialData();
  }, []);

  // Persist posts whenever they change
  useEffect(() => {
    if (!postsLoaded.current) return;
    AsyncStorage.setItem(POSTS_STORAGE_KEY, JSON.stringify(posts)).catch(() => {});
  }, [posts]);

  useEffect(() => {
    async function initNode() {
      let id = await AsyncStorage.getItem("mesh_node_id");
      let name = await AsyncStorage.getItem("mesh_node_name");
      if (!id) { id = randomId(); await AsyncStorage.setItem("mesh_node_id", id); }
      if (!name) { name = randomName(); await AsyncStorage.setItem("mesh_node_name", name); }
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
    startBleMesh();
    startWifiDirect();
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

  function rememberBleSeen(id: string) {
    if (bleSeenRef.current.has(id)) return;
    bleSeenRef.current.add(id);
    bleSeenQueueRef.current.push(id);
    if (bleSeenQueueRef.current.length > BLE_MAX_SEEN) {
      const victim = bleSeenQueueRef.current.shift();
      if (victim) bleSeenRef.current.delete(victim);
    }
  }

  function bleBroadcastEnvelope(env: BleEnvelope) {
    try {
      if (Platform.OS === "web") return;
      if (!bleIsAdvertising()) return;
      const raw = JSON.stringify(env);
      const bytes = utf8ToBytes(raw);
      const msgId = randomU32();
      const total = Math.max(1, Math.ceil(bytes.length / BLE_CHUNK_DATA_MAX));
      const idBytes = u32ToBytes(msgId);

      if (blePacketQueueRef.current.length > BLE_MAX_QUEUE) return;

      for (let idx = 0; idx < total; idx++) {
        const start = idx * BLE_CHUNK_DATA_MAX;
        const end = Math.min(bytes.length, start + BLE_CHUNK_DATA_MAX);
        const chunk = bytes.slice(start, end);
        const packet: number[] = [1, idBytes[0], idBytes[1], idBytes[2], idBytes[3], total & 0xff, idx & 0xff, ...chunk];
        blePacketQueueRef.current.push(packet);
      }

      if (!blePacketPumpRef.current) {
        blePacketPumpRef.current = setInterval(() => {
          if (Platform.OS === "web") return;
          if (!bleIsAdvertising()) return;
          const now = Date.now();
          const elapsed = now - blePacketBudgetRef.current.lastRefillMs;
          if (elapsed > 0) {
            const add = (elapsed / 1000) * BLE_PACKETS_PER_SEC;
            blePacketBudgetRef.current.tokens = Math.min(
              BLE_PACKET_BURST,
              blePacketBudgetRef.current.tokens + add,
            );
            blePacketBudgetRef.current.lastRefillMs = now;
          }
          while (blePacketBudgetRef.current.tokens >= 1 && blePacketQueueRef.current.length > 0) {
            const pkt = blePacketQueueRef.current.shift();
            if (!pkt) break;
            blePacketBudgetRef.current.tokens -= 1;
            try {
              bleSendNotificationToDevices(BLE_SERVICE_UUID, BLE_CHAR_UUID, pkt);
            } catch {}
          }
          if (blePacketQueueRef.current.length === 0 && blePacketPumpRef.current) {
            clearInterval(blePacketPumpRef.current);
            blePacketPumpRef.current = null;
          }
        }, 50);
      }
    } catch {}
  }

  function bleBroadcastMessage(payload: MeshMessage, ttl = BLE_DEFAULT_TTL) {
    const env: BleEnvelope = {
      type: "BLE_MESH",
      id: randomId(12) + Date.now().toString(36),
      originId: myNodeRef.current.id,
      ttl,
      payload,
    };
    rememberBleSeen(env.id);
    bleBroadcastEnvelope(env);
  }

  function handleBlePacket(deviceId: string, value: unknown) {
    const bytes: number[] | null = Array.isArray(value)
      ? (value as unknown[]).map((n) => (typeof n === "number" ? (n & 0xff) : 0))
      : null;
    if (!bytes || bytes.length < BLE_HEADER_LEN) return;
    if (bytes[0] !== 1) return;
    const msgId = bytesToU32(bytes[1], bytes[2], bytes[3], bytes[4]);
    const total = bytes[5] & 0xff;
    const idx = bytes[6] & 0xff;
    if (total === 0 || idx >= total) return;
    const key = `${deviceId}:${msgId}`;
    const entry = blePartialRef.current.get(key) ?? {
      total,
      parts: new Array<number[] | null>(total).fill(null),
      t: Date.now(),
    };
    if (entry.total !== total) return;
    entry.parts[idx] = bytes.slice(BLE_HEADER_LEN);
    entry.t = Date.now();
    blePartialRef.current.set(key, entry);

    let done = true;
    for (let i = 0; i < entry.total; i++) {
      if (!entry.parts[i]) { done = false; break; }
    }
    if (!done) return;
    blePartialRef.current.delete(key);
    const all: number[] = [];
    for (let i = 0; i < entry.total; i++) {
      const part = entry.parts[i];
      if (part) all.push(...part);
    }
    try {
      const raw = bytesToUtf8(all);
      const env: BleEnvelope = JSON.parse(raw);
      if (!env || env.type !== "BLE_MESH") return;
      if (typeof env.id !== "string" || typeof env.originId !== "string") return;
      if (bleSeenRef.current.has(env.id)) return;
      rememberBleSeen(env.id);
      handleMessage(env.payload);
      if (env.ttl > 0) {
        if (blePacketQueueRef.current.length < BLE_MAX_QUEUE) {
          const delay =
            BLE_FORWARD_MIN_DELAY_MS +
            Math.floor(Math.random() * (BLE_FORWARD_MAX_DELAY_MS - BLE_FORWARD_MIN_DELAY_MS + 1));
          setTimeout(() => {
            if (blePacketQueueRef.current.length >= BLE_MAX_QUEUE) return;
            bleBroadcastEnvelope({ ...env, ttl: env.ttl - 1 });
          }, delay);
        }
      }
    } catch {}
  }

  async function startBleMesh() {
    if (bleInitRef.current) return;
    if (Platform.OS === "web") return;
    bleInitRef.current = true;

    try {
      if (Platform.OS === "android") {
        try {
          await PermissionsAndroid.requestMultiple([
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          ]);
        } catch {}
      }

      try {
        await BleManager.start({ showAlert: false });
      } catch {}

      try {
        bleSetName(`mesh-${ROOM}`.slice(0, 20));
        bleAddService(BLE_SERVICE_UUID, true);
        bleAddCharacteristicToService(
          BLE_SERVICE_UUID,
          BLE_CHAR_UUID,
          BLE_PERMISSIONS.readable,
          BLE_PROPERTIES.supportsNotification,
          "00"
        );
        await bleStartAdvertising();
      } catch {}

      const emitter = new NativeEventEmitter(NativeModules.BleManager);
      const subs = [
        emitter.addListener("BleManagerDiscoverPeripheral", async (p: any) => {
          const id = p?.id;
          if (typeof id !== "string") return;
          if (bleConnectedRef.current.has(id)) return;
          try {
            bleConnectedRef.current.add(id);
            await BleManager.connect(id);
            await BleManager.retrieveServices(id);
            try {
              await BleManager.startNotification(id, BLE_SERVICE_UUID, BLE_CHAR_UUID);
            } catch {}
          } catch {
            bleConnectedRef.current.delete(id);
          }
        }),
        emitter.addListener("BleManagerDidUpdateValueForCharacteristic", (e: any) => {
          const deviceId = e?.peripheral;
          if (typeof deviceId !== "string") return;
          handleBlePacket(deviceId, e?.value);
        }),
        emitter.addListener("BleManagerDisconnectPeripheral", (e: any) => {
          const deviceId = e?.peripheral;
          if (typeof deviceId === "string") {
            bleConnectedRef.current.delete(deviceId);
          }
        }),
        emitter.addListener("BleManagerStopScan", () => {
          bleIsScanningRef.current = false;
        }),
      ];
      bleCleanupRef.current = () => {
        for (const s of subs) s.remove();
      };

      bleScanInterval.current = setInterval(() => {
        if (bleIsScanningRef.current) return;
        bleIsScanningRef.current = true;
        BleManager.scan({ serviceUUIDs: [BLE_SERVICE_UUID], allowDuplicates: true, scanMode: BleScanMode.Balanced }).catch(() => {
          bleIsScanningRef.current = false;
        });
      }, 7000);

      bleHeartbeatInterval.current = setInterval(() => {
        bleBroadcastMessage({ type: "HEARTBEAT", node: myNodeRef.current, room: ROOM });
        const now = Date.now();
        for (const [k, v] of blePartialRef.current) {
          if (now - v.t > 30000) blePartialRef.current.delete(k);
        }
      }, HEARTBEAT_MS);

      bleBroadcastMessage({ type: "ANNOUNCE", node: myNodeRef.current, room: ROOM });

    } catch {}
  }

  function rememberWifiSeen(id: string) {
    if (wifiSeenRef.current.has(id)) return;
    wifiSeenRef.current.add(id);
    wifiSeenQueueRef.current.push(id);
    if (wifiSeenQueueRef.current.length > WIFI_MAX_SEEN) {
      const victim = wifiSeenQueueRef.current.shift();
      if (victim) wifiSeenRef.current.delete(victim);
    }
  }

  function wifiEnqueue(message: string, to?: string) {
    if (Platform.OS !== "android") return;
    if (!wifiInfoRef.current?.groupFormed) return;
    if (wifiQueueRef.current.length >= WIFI_MAX_QUEUE) return;
    wifiQueueRef.current.push({ message, to });
    if (wifiPumpRef.current) return;

    wifiPumpRef.current = setInterval(() => {
      const now = Date.now();
      const elapsed = now - wifiBudgetRef.current.lastRefillMs;
      if (elapsed > 0) {
        const add = (elapsed / 1000) * WIFI_MSGS_PER_SEC;
        wifiBudgetRef.current.tokens = Math.min(WIFI_MSG_BURST, wifiBudgetRef.current.tokens + add);
        wifiBudgetRef.current.lastRefillMs = now;
      }
      while (wifiBudgetRef.current.tokens >= 1 && wifiQueueRef.current.length > 0) {
        const item = wifiQueueRef.current.shift();
        if (!item) break;
        wifiBudgetRef.current.tokens -= 1;
        try {
          if (item.to) {
            void wifiSendMessageTo(item.message, item.to);
          } else {
            void wifiSendMessage(item.message);
          }
        } catch {}
      }
      if (wifiQueueRef.current.length === 0 && wifiPumpRef.current) {
        clearInterval(wifiPumpRef.current);
        wifiPumpRef.current = null;
      }
    }, 50);
  }

  function wifiBroadcastMessage(payload: MeshMessage, ttl = WIFI_DEFAULT_TTL) {
    if (Platform.OS !== "android") return;
    const env: WifiEnvelope = {
      type: "WIFI_MESH",
      id: randomId(14) + Date.now().toString(36),
      originId: myNodeRef.current.id,
      ttl,
      room: ROOM,
      payload,
    };
    rememberWifiSeen(env.id);
    const raw = JSON.stringify(env);
    if (!wifiInfoRef.current?.groupFormed) return;
    if (wifiInfoRef.current.isGroupOwner) {
      for (const addr of wifiClientAddressesRef.current) {
        wifiEnqueue(raw, addr);
      }
    } else {
      wifiEnqueue(raw);
    }
  }

  async function wifiReceiveLoop() {
    if (Platform.OS !== "android") return;
    if (wifiReceiveLoopRef.current) return;
    wifiStopRef.current = false;
    wifiReceiveLoopRef.current = (async () => {
      while (!wifiStopRef.current) {
        try {
          const res: any = await wifiReceiveMessage({ meta: true } as any);
          let raw: string | null = null;
          let fromAddress: string | null = null;
          if (typeof res === "string") {
            raw = res;
          } else if (res && typeof res === "object") {
            raw = typeof res.message === "string" ? res.message : null;
            fromAddress = typeof res.fromAddress === "string" ? res.fromAddress : null;
          }
          if (!raw) continue;
          let env: WifiEnvelope | null = null;
          try {
            env = JSON.parse(raw);
          } catch {
            env = null;
          }
          if (!env || env.type !== "WIFI_MESH") continue;
          if (env.room !== ROOM) continue;
          if (typeof env.id !== "string" || typeof env.originId !== "string") continue;
          if (wifiSeenRef.current.has(env.id)) continue;
          rememberWifiSeen(env.id);
          if (fromAddress && wifiInfoRef.current?.isGroupOwner) {
            wifiClientAddressesRef.current.add(fromAddress);
          }
          handleMessage(env.payload);
          if (env.ttl > 0 && wifiInfoRef.current?.isGroupOwner) {
            const next: WifiEnvelope = { ...env, ttl: env.ttl - 1 };
            const nextRaw = JSON.stringify(next);
            for (const addr of wifiClientAddressesRef.current) {
              if (fromAddress && addr === fromAddress) continue;
              wifiEnqueue(nextRaw, addr);
            }
          }
        } catch {
          await new Promise((r) => setTimeout(r, 120));
        }
      }
    })().finally(() => {
      wifiReceiveLoopRef.current = null;
    });
  }

  async function startWifiDirect() {
    if (wifiInitRef.current) return;
    if (Platform.OS !== "android") return;
    wifiInitRef.current = true;

    try {
      try {
        const perms: string[] = [
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
          "android.permission.ACCESS_WIFI_STATE",
          "android.permission.CHANGE_WIFI_STATE",
        ].filter(Boolean) as unknown as string[];
        const nearby = (PermissionsAndroid.PERMISSIONS as any).NEARBY_WIFI_DEVICES;
        if (nearby) perms.push(nearby);
        await PermissionsAndroid.requestMultiple(perms as any);
      } catch {}

      try {
        await wifiInitialize();
      } catch {}

      wifiSubsRef.current.push(
        wifiSubscribeOnConnectionInfoUpdates(async (info) => {
          wifiInfoRef.current = info;
          if (info.groupFormed) {
            try {
              await wifiGetConnectionInfo();
            } catch {}
            void wifiReceiveLoop();
            wifiBroadcastMessage({ type: "ANNOUNCE", node: myNodeRef.current, room: ROOM }, 1);
          }
        }),
      );

      wifiSubsRef.current.push(
        wifiSubscribeOnPeersUpdates(({ devices }: any) => {
          if (wifiInfoRef.current?.groupFormed) return;
          const now = Date.now();
          if (now - wifiConnectAttemptRef.current < 8000) return;
          const device = Array.isArray(devices) ? devices[0] : null;
          const addr = device?.deviceAddress;
          if (typeof addr !== "string") return;
          wifiConnectAttemptRef.current = now;
          wifiConnectWithConfig({ deviceAddress: addr, groupOwnerIntent: 0 }).catch(() => {});
        }) as any,
      );

      wifiDiscoverInterval.current = setInterval(() => {
        if (wifiInfoRef.current?.groupFormed) return;
        wifiStartDiscoveringPeers().catch(() => {});
      }, 9000);

      try {
        await wifiCreateGroup();
      } catch {}

      wifiStartDiscoveringPeers().catch(() => {});
      void wifiReceiveLoop();
    } catch {}
  }

  async function pullFromServer() {
    try {
      const { enabled } = await getInternetSyncStatus();
      if (!enabled) return;
      const serverPosts = await inetPullPosts();
      if (serverPosts.length > 0) {
        setPosts((prev) => mergePosts(prev, serverPosts, retentionRef.current).posts);
      }
    } catch {}
  }

  function connect() {
    if (!myNodeRef.current.id) return;
    try {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        send({ type: "ANNOUNCE", node: myNodeRef.current, room: ROOM });
        heartbeatInterval.current = setInterval(() => {
          send({ type: "HEARTBEAT", node: myNodeRef.current, room: ROOM });
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
        pullFromServer();
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

      ws.onerror = () => { ws.close(); };
    } catch {}
  }

  function handleMessage(data: MeshMessage) {
    if (data.type === "ANNOUNCE" || data.type === "HEARTBEAT") {
      if (data.room !== ROOM) return;
      if (data.node.id === myNodeRef.current.id) return;
      const isNew = data.type === "ANNOUNCE";
      setPeers((prev) =>
        new Map(prev).set(data.node.id, { ...data.node, lastSeen: Date.now() })
      );
      if (isNew) {
        send({ type: "HEARTBEAT", node: myNodeRef.current, room: ROOM });
        onPeerDetected(data.node.name).catch(() => {});
        if (postsRef.current.length > 0) {
          setTimeout(() => {
            send({
              type: "POST_SYNC",
              posts: postsRef.current,
              fromName: myNodeRef.current.name,
            });
          }, 500);
        }
      }
    } else if (data.type === "GOODBYE") {
      if (data.room !== ROOM) return;
      setPeers((prev) => { const m = new Map(prev); m.delete(data.id); return m; });
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
    } else if (data.type === "POST_BROADCAST") {
      if (data.post.authorId === myNodeRef.current.id) return;
      const now = Date.now();
      if (data.post.expiresAt <= now) return;
      if (!isFreshEnough(data.post.timestamp, retentionRef.current)) return;
      setPosts((prev) => {
        if (prev.find((p) => p.id === data.post.id)) return prev;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        getInternetSyncStatus().then(({ enabled }) => {
          if (enabled) inetPushPosts([data.post]).catch(() => {});
        });
        return [data.post, ...prev].sort((a, b) => b.timestamp - a.timestamp);
      });
    } else if (data.type === "POST_SYNC") {
      setPosts((prev) => {
        const result = mergePosts(prev, data.posts, retentionRef.current);
        if (result.added > 0) {
          onSyncComplete(data.fromName, result.added).catch(() => {});
          const newPosts = data.posts.filter((p) =>
            result.posts.find((rp) => rp.id === p.id)
          );
          getInternetSyncStatus().then(({ enabled }) => {
            if (enabled) inetPushPosts(newPosts).catch(() => {});
          });
        }
        return result.posts;
      });
    }
  }

  function cleanup() {
    clearInterval(heartbeatInterval.current!);
    clearInterval(peerCleanupInterval.current!);
    clearTimeout(reconnectTimeout.current!);
    if (bleScanInterval.current) clearInterval(bleScanInterval.current);
    if (bleHeartbeatInterval.current) clearInterval(bleHeartbeatInterval.current);
    if (blePacketPumpRef.current) clearInterval(blePacketPumpRef.current);
    if (wifiDiscoverInterval.current) clearInterval(wifiDiscoverInterval.current);
    if (wifiPumpRef.current) clearInterval(wifiPumpRef.current);
    try {
      if (Platform.OS !== "web" && bleIsAdvertising()) bleStopAdvertising();
    } catch {}
    try {
      bleCleanupRef.current?.();
    } catch {}
    try {
      wifiStopRef.current = true;
      wifiStopReceivingMessage();
    } catch {}
    try {
      wifiStopDiscoveringPeers().catch(() => {});
    } catch {}
    try {
      wifiRemoveGroup().catch(() => {});
    } catch {}
    try {
      for (const sub of wifiSubsRef.current) sub.remove();
      wifiSubsRef.current = [];
    } catch {}
    if (wsRef.current) {
      send({ type: "GOODBYE", id: myNodeRef.current.id, room: ROOM });
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
    bleBroadcastMessage({ type: "CHAT", msg });
    wifiBroadcastMessage({ type: "CHAT", msg });
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
    bleBroadcastMessage({ type: "SOS", alert });
    wifiBroadcastMessage({ type: "SOS", alert });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  }, []);

  const ackSOS = useCallback((alertId: string) => {
    setSosAlerts((prev) =>
      prev.map((a) => (a.id === alertId ? { ...a, acked: true } : a))
    );
    send({ type: "SOS_ACK", alertId, from: myNodeRef.current.name });
    bleBroadcastMessage({ type: "SOS_ACK", alertId, from: myNodeRef.current.name });
    wifiBroadcastMessage({ type: "SOS_ACK", alertId, from: myNodeRef.current.name });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, []);

  const renameNode = useCallback(async (name: string) => {
    const trimmed = name.trim().slice(0, 32);
    if (!trimmed) return;
    await AsyncStorage.setItem("mesh_node_name", trimmed);
    setMyNode((prev) => {
      const updated = { ...prev, name: trimmed };
      myNodeRef.current = updated;
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "ANNOUNCE", node: updated, room: ROOM }));
      }
      bleBroadcastMessage({ type: "ANNOUNCE", node: updated, room: ROOM });
      wifiBroadcastMessage({ type: "ANNOUNCE", node: updated, room: ROOM }, 1);
      return updated;
    });
  }, []);

  const addPost = useCallback(async (text: string) => {
    const coords = await getCurrentCoords();
    const now = Date.now();
    const post: Post = {
      id: now.toString() + Math.random().toString(36).substring(2, 7),
      authorId: myNodeRef.current.id,
      authorName: myNodeRef.current.name,
      text: text.slice(0, 280),
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
      timestamp: now,
      expiresAt: now + ONE_YEAR_MS,
    };
    setPosts((prev) => [post, ...prev]);
    send({ type: "POST_BROADCAST", post });
    bleBroadcastMessage({ type: "POST_BROADCAST", post });
    wifiBroadcastMessage({ type: "POST_BROADCAST", post });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    getInternetSyncStatus().then(({ enabled }) => {
      if (enabled) inetPushPosts([post]).catch(() => {});
    });
  }, []);

  const setRetention = useCallback(async (days: number) => {
    await saveRetentionDays(days);
    retentionRef.current = days;
    setRetentionDaysState(days);
    // Immediately prune posts that now fall outside the new window
    const cutoff = retentionCutoff(days);
    const now = Date.now();
    setPosts((prev) =>
      prev.filter((p) => p.expiresAt > now && p.timestamp >= cutoff)
    );
  }, []);

  const peerList = Array.from(peers.values());

  return (
    <MeshContext.Provider
      value={{
        myNode,
        peers: peerList,
        messages,
        sosAlerts,
        posts,
        connected,
        retentionDays,
        sendMessage,
        sendSOS,
        ackSOS,
        addPost,
        renameNode,
        setRetention,
      }}
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
