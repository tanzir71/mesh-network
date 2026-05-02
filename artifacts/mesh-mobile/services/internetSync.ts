import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Post } from "@/context/MeshContext";

const ENABLED_KEY = "mesh_internet_sync_enabled";
const STATUS_KEY = "mesh_internet_sync_status";

const API_BASE = `https://${process.env.EXPO_PUBLIC_DOMAIN}/api`;

type SyncStatus = {
  enabled: boolean;
  lastPull: number | null;
  lastPush: number | null;
  serverPostCount: number;
};

async function loadStatus(): Promise<SyncStatus> {
  try {
    const [enabledRaw, statusRaw] = await Promise.all([
      AsyncStorage.getItem(ENABLED_KEY),
      AsyncStorage.getItem(STATUS_KEY),
    ]);
    const enabled = enabledRaw === null ? true : enabledRaw === "true";
    const status = statusRaw ? JSON.parse(statusRaw) : {};
    return {
      enabled,
      lastPull: status.lastPull ?? null,
      lastPush: status.lastPush ?? null,
      serverPostCount: status.serverPostCount ?? 0,
    };
  } catch {
    return { enabled: true, lastPull: null, lastPush: null, serverPostCount: 0 };
  }
}

async function saveStatus(patch: Partial<Omit<SyncStatus, "enabled">>) {
  try {
    const raw = await AsyncStorage.getItem(STATUS_KEY);
    const prev = raw ? JSON.parse(raw) : {};
    await AsyncStorage.setItem(STATUS_KEY, JSON.stringify({ ...prev, ...patch }));
  } catch {}
}

export async function getInternetSyncStatus(): Promise<SyncStatus> {
  return loadStatus();
}

export async function setInternetSyncEnabled(value: boolean): Promise<void> {
  await AsyncStorage.setItem(ENABLED_KEY, value ? "true" : "false");
}

export async function pullPosts(): Promise<Post[]> {
  try {
    const res = await fetch(`${API_BASE}/posts`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return [];
    const posts: Post[] = await res.json();
    await saveStatus({ lastPull: Date.now(), serverPostCount: posts.length });
    return posts;
  } catch {
    return [];
  }
}

export async function pushPosts(posts: Post[]): Promise<void> {
  if (posts.length === 0) return;
  try {
    const res = await fetch(`${API_BASE}/posts/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(posts),
    });
    if (res.ok) {
      const data = await res.json();
      await saveStatus({ lastPush: Date.now(), serverPostCount: data.total });
    }
  } catch {}
}
