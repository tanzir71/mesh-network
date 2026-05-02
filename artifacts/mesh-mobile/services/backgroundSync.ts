/**
 * Background sync service.
 * This file MUST be imported at app startup (root _layout.tsx) so that
 * TaskManager.defineTask runs before any registration calls.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as BackgroundFetch from "expo-background-fetch";
import * as Notifications from "expo-notifications";
import * as TaskManager from "expo-task-manager";
import { Platform } from "react-native";

// ─── Keys ────────────────────────────────────────────────────────────────────
export const BG_SYNC_TASK = "MESH_BACKGROUND_SYNC";
const KEY_ENABLED = "mesh_bg_enabled";
const KEY_INTERVAL = "mesh_bg_interval_min";
const KEY_NOTIF_ID = "mesh_bg_notif_id";
const KEY_LAST_SYNC = "mesh_bg_last_sync";
const KEY_LAST_PEER = "mesh_bg_last_peer";
const KEY_SYNC_COUNT = "mesh_bg_sync_count";

// ─── Android notification channel ────────────────────────────────────────────
if (Platform.OS === "android") {
  Notifications.setNotificationChannelAsync("mesh-sync", {
    name: "Mesh Background Sync",
    importance: Notifications.AndroidImportance.LOW,
    enableVibrate: false,
    showBadge: false,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  }).catch(() => {});
}

// ─── Background task (module-level, required by TaskManager) ─────────────────
TaskManager.defineTask(BG_SYNC_TASK, async () => {
  try {
    const now = Date.now();
    const rawCount = await AsyncStorage.getItem(KEY_SYNC_COUNT);
    const count = rawCount ? parseInt(rawCount) + 1 : 1;
    await AsyncStorage.setItem(KEY_SYNC_COUNT, count.toString());
    await AsyncStorage.setItem(KEY_LAST_SYNC, now.toString());

    const peer = await AsyncStorage.getItem(KEY_LAST_PEER);
    const time = new Date(now).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    const body = peer
      ? `Last synced with ${peer} · ${time}`
      : `Scanning for nearby devices · ${time}`;

    await _showNotif(body);
    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch {
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

// ─── Internal notification helper ────────────────────────────────────────────
let _notifId: string | null = null;

async function _showNotif(body: string): Promise<void> {
  if (Platform.OS === "web") return;

  // Cancel the previous one
  const prev = _notifId ?? (await AsyncStorage.getItem(KEY_NOTIF_ID));
  if (prev) {
    await Notifications.dismissNotificationAsync(prev).catch(() => {});
    _notifId = null;
  }

  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: "📡 Mesh Sync",
      body,
      data: { type: "mesh-bg-sync" },
      ...(Platform.OS === "android"
        ? {
            sticky: true,
            autoDismiss: false,
            color: "#00c8ff",
            channelId: "mesh-sync",
            priority: Notifications.AndroidNotificationPriority.LOW,
          }
        : {}),
    },
    trigger: null,
  });

  _notifId = id;
  await AsyncStorage.setItem(KEY_NOTIF_ID, id);
}

// ─── Public API ──────────────────────────────────────────────────────────────
export async function requestNotifPermissions(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === "granted") return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === "granted";
}

export async function enableBackgroundSync(
  intervalMinutes: number
): Promise<void> {
  if (Platform.OS === "web") return;

  await AsyncStorage.multiSet([
    [KEY_ENABLED, "true"],
    [KEY_INTERVAL, intervalMinutes.toString()],
  ]);

  // Register / update background fetch
  try {
    const isReg = await TaskManager.isTaskRegisteredAsync(BG_SYNC_TASK);
    if (isReg) await BackgroundFetch.unregisterTaskAsync(BG_SYNC_TASK);
    await BackgroundFetch.registerTaskAsync(BG_SYNC_TASK, {
      minimumInterval: intervalMinutes * 60,
      stopOnTerminate: false,
      startOnBoot: true,
    });
  } catch {
    // Background fetch unavailable (simulator / Expo Go limitation)
  }

  const label =
    intervalMinutes < 60
      ? `${intervalMinutes} min`
      : `${intervalMinutes / 60}h`;
  await _showNotif(`Active · checking every ${label} — scanning for devices`);
}

export async function disableBackgroundSync(): Promise<void> {
  if (Platform.OS === "web") return;

  await AsyncStorage.setItem(KEY_ENABLED, "false");

  try {
    const isReg = await TaskManager.isTaskRegisteredAsync(BG_SYNC_TASK);
    if (isReg) await BackgroundFetch.unregisterTaskAsync(BG_SYNC_TASK);
  } catch {}

  // Dismiss notification
  const id = _notifId ?? (await AsyncStorage.getItem(KEY_NOTIF_ID));
  if (id) {
    await Notifications.dismissNotificationAsync(id).catch(() => {});
    await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
    _notifId = null;
  }
  await AsyncStorage.removeItem(KEY_NOTIF_ID);
}

/** Called by MeshContext when a new peer announces itself */
export async function onPeerDetected(peerName: string): Promise<void> {
  if (Platform.OS === "web") return;
  const enabled = await AsyncStorage.getItem(KEY_ENABLED);
  if (enabled !== "true") return;
  await AsyncStorage.setItem(KEY_LAST_PEER, peerName);
  await _showNotif(`Detected ${peerName} — syncing...`);
}

/** Called by MeshContext after a POST_SYNC round-trip */
export async function onSyncComplete(
  peerName: string,
  newPostCount: number
): Promise<void> {
  if (Platform.OS === "web") return;
  const enabled = await AsyncStorage.getItem(KEY_ENABLED);
  if (enabled !== "true") return;

  const now = Date.now();
  const rawCount = await AsyncStorage.getItem(KEY_SYNC_COUNT);
  const count = rawCount ? parseInt(rawCount) + 1 : 1;
  await AsyncStorage.multiSet([
    [KEY_LAST_SYNC, now.toString()],
    [KEY_LAST_PEER, peerName],
    [KEY_SYNC_COUNT, count.toString()],
  ]);

  const time = new Date(now).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  const detail =
    newPostCount > 0
      ? `${newPostCount} new update${newPostCount !== 1 ? "s" : ""}`
      : "already up to date";
  await _showNotif(`${peerName} · ${detail} · ${time}`);
}

/** Load persisted settings for the Network tab UI */
export async function getBackgroundSyncSettings(): Promise<{
  enabled: boolean;
  intervalMinutes: number;
  lastSync: number | null;
  lastPeer: string | null;
  syncCount: number;
}> {
  const [enabled, interval, lastSync, lastPeer, count] =
    await AsyncStorage.multiGet([
      KEY_ENABLED,
      KEY_INTERVAL,
      KEY_LAST_SYNC,
      KEY_LAST_PEER,
      KEY_SYNC_COUNT,
    ]);
  return {
    enabled: enabled[1] === "true",
    intervalMinutes: interval[1] ? parseInt(interval[1]) : 15,
    lastSync: lastSync[1] ? parseInt(lastSync[1]) : null,
    lastPeer: lastPeer[1] ?? null,
    syncCount: count[1] ? parseInt(count[1]) : 0,
  };
}
