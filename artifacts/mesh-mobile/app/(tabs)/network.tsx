import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMesh } from "@/context/MeshContext";
import { useColors } from "@/hooks/useColors";
import {
  disableBackgroundSync,
  enableBackgroundSync,
  getBackgroundSyncSettings,
  requestNotifPermissions,
} from "@/services/backgroundSync";
import {
  getInternetSyncStatus,
  setInternetSyncEnabled,
  pullPosts,
} from "@/services/internetSync";
import { RETENTION_OPTIONS } from "@/services/retentionSettings";

// ─── Interval options ─────────────────────────────────────────────────────────
const INTERVALS: { label: string; value: number }[] = [
  { label: "15m", value: 15 },
  { label: "30m", value: 30 },
  { label: "1h",  value: 60 },
  { label: "2h",  value: 120 },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatRelative(ts: number): string {
  const d = Date.now() - ts;
  if (d < 60_000) return "just now";
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m ago`;
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}h ago`;
  return new Date(ts).toLocaleDateString();
}

// ─── NodeDot ──────────────────────────────────────────────────────────────────
function NodeDot({
  label,
  sublabel,
  isMe,
  size = 56,
  colors,
}: {
  label: string;
  sublabel: string;
  isMe: boolean;
  size?: number;
  colors: ReturnType<typeof useColors>;
}) {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!isMe) return;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.15, duration: 1200, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 1200, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [isMe]);

  return (
    <View style={{ alignItems: "center", gap: 6 }}>
      <Animated.View
        style={[
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: isMe ? colors.primary + "22" : colors.card,
            borderWidth: 2,
            borderColor: isMe ? colors.primary : colors.border,
          },
          isMe && { transform: [{ scale: pulse }] },
        ]}
      >
        <Feather
          name="radio"
          size={isMe ? 20 : 16}
          color={isMe ? colors.primary : colors.mutedForeground}
        />
      </Animated.View>
      <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold", color: colors.foreground }}>
        {label}
      </Text>
      <Text style={{ fontSize: 9, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>
        {sublabel}
      </Text>
    </View>
  );
}

// ─── InternetSyncCard ─────────────────────────────────────────────────────────
function InternetSyncCard({ colors }: { colors: ReturnType<typeof useColors> }) {
  const [enabled, setEnabled] = useState(true);
  const [lastPull, setLastPull] = useState<number | null>(null);
  const [lastPush, setLastPush] = useState<number | null>(null);
  const [serverPostCount, setServerPostCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const reload = useCallback(async () => {
    const s = await getInternetSyncStatus();
    setEnabled(s.enabled);
    setLastPull(s.lastPull);
    setLastPush(s.lastPush);
    setServerPostCount(s.serverPostCount);
  }, []);

  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  const handleToggle = async (value: boolean) => {
    await setInternetSyncEnabled(value);
    setEnabled(value);
    if (value) {
      setSyncing(true);
      await pullPosts();
      setSyncing(false);
      reload();
    }
  };

  const handleManualSync = async () => {
    if (syncing) return;
    setSyncing(true);
    await pullPosts();
    setSyncing(false);
    reload();
  };

  const statusText = (() => {
    if (!enabled) return "Off";
    if (syncing) return "Syncing...";
    if (lastPull) return `Last pull ${formatRelative(lastPull)}`;
    return "Waiting for first sync...";
  })();

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: enabled ? colors.primary + "55" : colors.border },
      ]}
    >
      <View style={styles.bgRow}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>INTERNET SYNC</Text>
          <Text style={[styles.bgTitle, { color: colors.foreground }]}>Sync over internet</Text>
          <Text style={[styles.bgNote, { color: colors.mutedForeground }]}>Push & pull updates via relay server</Text>
        </View>
        <Switch
          value={enabled}
          onValueChange={handleToggle}
          trackColor={{ false: colors.border, true: colors.primary + "88" }}
          thumbColor={enabled ? colors.primary : colors.mutedForeground}
          ios_backgroundColor={colors.border}
        />
      </View>

      <View style={[styles.divider, { backgroundColor: colors.border }]} />
      <View style={styles.inetStatsRow}>
        <View style={styles.inetStat}>
          <Text style={[styles.inetStatValue, { color: enabled ? colors.primary : colors.mutedForeground }]}>
            {serverPostCount}
          </Text>
          <Text style={[styles.inetStatLabel, { color: colors.mutedForeground }]}>On server</Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
        <View style={styles.inetStat}>
          <Text style={[styles.inetStatValue, { color: colors.foreground }]}>
            {lastPull ? formatRelative(lastPull) : "—"}
          </Text>
          <Text style={[styles.inetStatLabel, { color: colors.mutedForeground }]}>Last pull</Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
        <View style={styles.inetStat}>
          <Text style={[styles.inetStatValue, { color: colors.foreground }]}>
            {lastPush ? formatRelative(lastPush) : "—"}
          </Text>
          <Text style={[styles.inetStatLabel, { color: colors.mutedForeground }]}>Last push</Text>
        </View>
      </View>

      <View style={[styles.statusBox, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
        <View style={styles.statusRow}>
          <View style={[styles.statusDot, { backgroundColor: enabled ? colors.primary : colors.border }]} />
          <Text style={[styles.statusText, { color: colors.foreground }]}>{statusText}</Text>
          {enabled && (
            <Pressable
              onPress={handleManualSync}
              style={({ pressed }) => [styles.syncBtn, { opacity: pressed || syncing ? 0.5 : 1 }]}
            >
              <Feather name="refresh-cw" size={13} color={colors.primary} />
              <Text style={[styles.syncBtnText, { color: colors.primary }]}>Sync now</Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

// ─── DataRetentionCard ────────────────────────────────────────────────────────
function DataRetentionCard({ colors }: { colors: ReturnType<typeof useColors> }) {
  const { retentionDays, setRetention, posts } = useMesh();

  // preview how many posts would survive at a given setting
  function previewCount(days: number) {
    if (days === 0) return posts.length;
    const cutoff = Date.now() - days * 86_400_000;
    return posts.filter((p) => p.timestamp >= cutoff).length;
  }

  const activeLabel =
    RETENTION_OPTIONS.find((o) => o.days === retentionDays)?.label ?? "1yr";

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={{ gap: 2 }}>
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>DATA RETENTION</Text>
        <Text style={[styles.bgTitle, { color: colors.foreground }]}>Keep posts for</Text>
        <Text style={[styles.bgNote, { color: colors.mutedForeground }]}>
          Posts older than this window are removed from storage and skipped in sync
        </Text>
      </View>

      <View style={[styles.divider, { backgroundColor: colors.border }]} />

      {/* Option grid — two rows of three */}
      <View style={styles.retentionGrid}>
        {RETENTION_OPTIONS.map((opt) => {
          const active = opt.days === retentionDays;
          return (
            <Pressable
              key={opt.days}
              onPress={() => setRetention(opt.days)}
              style={({ pressed }) => [
                styles.retentionBtn,
                {
                  backgroundColor: active ? colors.primary : colors.secondary,
                  borderColor: active ? colors.primary : colors.border,
                  opacity: pressed ? 0.75 : 1,
                },
              ]}
            >
              <Text
                style={[
                  styles.retentionBtnLabel,
                  { color: active ? colors.primaryForeground : colors.mutedForeground },
                ]}
              >
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Summary */}
      <View style={[styles.statusBox, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
        <View style={styles.statusRow}>
          <Feather name="database" size={13} color={colors.primary} />
          <Text style={[styles.statusText, { color: colors.foreground }]}>
            {posts.length === 0
              ? "No posts stored"
              : `${previewCount(retentionDays)} of ${posts.length} post${posts.length !== 1 ? "s" : ""} within window`}
          </Text>
        </View>
        {retentionDays === 0 && (
          <Text style={[styles.bgNote, { color: colors.mutedForeground, marginTop: 4 }]}>
            All posts kept indefinitely
          </Text>
        )}
      </View>
    </View>
  );
}

// ─── BackgroundSyncCard ───────────────────────────────────────────────────────
function BackgroundSyncCard({ colors }: { colors: ReturnType<typeof useColors> }) {
  const [enabled, setEnabled] = useState(false);
  const [interval, setIntervalVal] = useState(15);
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [lastPeer, setLastPeer] = useState<string | null>(null);
  const [syncCount, setSyncCount] = useState(0);
  const [toggling, setToggling] = useState(false);

  useFocusEffect(
    useCallback(() => {
      getBackgroundSyncSettings().then((s) => {
        setEnabled(s.enabled);
        setIntervalVal(s.intervalMinutes);
        setLastSync(s.lastSync);
        setLastPeer(s.lastPeer);
        setSyncCount(s.syncCount);
      });
    }, [])
  );

  const handleToggle = async (value: boolean) => {
    if (toggling) return;
    setToggling(true);
    try {
      if (value) {
        if (Platform.OS !== "web") {
          const granted = await requestNotifPermissions();
          if (!granted) { setToggling(false); return; }
        }
        await enableBackgroundSync(interval);
        setEnabled(true);
      } else {
        await disableBackgroundSync();
        setEnabled(false);
      }
    } finally {
      setToggling(false);
    }
  };

  const handleIntervalChange = async (mins: number) => {
    setIntervalVal(mins);
    if (enabled) await enableBackgroundSync(mins);
  };

  const statusText = (() => {
    if (!enabled) return "Off";
    if (lastPeer && lastSync) return `Last: ${lastPeer} · ${formatRelative(lastSync)}`;
    if (lastSync) return `Last check ${formatRelative(lastSync)}`;
    return "Scanning for nearby devices...";
  })();

  const isWeb = Platform.OS === "web";

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: enabled ? colors.primary + "55" : colors.border },
      ]}
    >
      <View style={styles.bgRow}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>BACKGROUND SYNC</Text>
          <Text style={[styles.bgTitle, { color: colors.foreground }]}>Sync when app is closed</Text>
          {isWeb && (
            <Text style={[styles.bgNote, { color: colors.mutedForeground }]}>Requires Expo Go on device</Text>
          )}
        </View>
        <Switch
          value={enabled}
          onValueChange={handleToggle}
          disabled={toggling || isWeb}
          trackColor={{ false: colors.border, true: colors.primary + "88" }}
          thumbColor={enabled ? colors.primary : colors.mutedForeground}
          ios_backgroundColor={colors.border}
        />
      </View>

      {enabled && !isWeb && (
        <>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <View style={{ gap: 8 }}>
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>CHECK INTERVAL</Text>
            <View style={styles.intervalRow}>
              {INTERVALS.map((opt) => (
                <Pressable
                  key={opt.value}
                  onPress={() => handleIntervalChange(opt.value)}
                  style={({ pressed }) => [
                    styles.intervalBtn,
                    {
                      backgroundColor: interval === opt.value ? colors.primary : colors.secondary,
                      borderColor: interval === opt.value ? colors.primary : colors.border,
                      opacity: pressed ? 0.75 : 1,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.intervalText,
                      { color: interval === opt.value ? colors.primaryForeground : colors.mutedForeground },
                    ]}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={[styles.intervalNote, { color: colors.border }]}>
              iOS minimum is 15 min · OS controls actual timing
            </Text>
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <View style={[styles.statusBox, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
            <View style={styles.statusRow}>
              <View style={[styles.statusDot, { backgroundColor: lastSync ? colors.success : colors.primary }]} />
              <Text style={[styles.statusText, { color: colors.foreground }]}>{statusText}</Text>
            </View>
            {syncCount > 0 && (
              <Text style={[styles.syncCount, { color: colors.mutedForeground }]}>
                {syncCount} sync{syncCount !== 1 ? "s" : ""} total
              </Text>
            )}
          </View>

          <View style={styles.notifHint}>
            <Feather name="bell" size={12} color={colors.mutedForeground} />
            <Text style={[styles.notifHintText, { color: colors.mutedForeground }]}>
              Live status visible in your notification tray
            </Text>
          </View>
        </>
      )}
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function NetworkScreen() {
  const { myNode, peers, connected } = useMesh();
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 84 : 0;
  const totalNodes = peers.length + 1;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={[
        styles.container,
        { paddingTop: topPad + 16, paddingBottom: bottomPad + 24 },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <View>
        <Text style={[styles.title, { color: colors.foreground }]}>Network Map</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Live mesh topology</Text>
      </View>

      {/* Mesh topology */}
      <View style={[styles.mapCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {peers.length === 0 ? (
          <View style={styles.mapEmpty}>
            <NodeDot
              label={myNode.name.replace("Node-", "")}
              sublabel={myNode.id.slice(0, 6)}
              isMe
              size={72}
              colors={colors}
            />
            <Text style={[styles.mapEmptyText, { color: colors.mutedForeground }]}>
              Scanning for peers...
            </Text>
          </View>
        ) : (
          <View style={styles.mapGrid}>
            <View style={styles.mapCenter}>
              <NodeDot
                label={myNode.name.replace("Node-", "")}
                sublabel={myNode.id.slice(0, 6)}
                isMe
                size={72}
                colors={colors}
              />
            </View>
            <View style={styles.connectLine}>
              {peers.map((_, i) => (
                <View key={i} style={[styles.lineDot, { backgroundColor: colors.primary + "40" }]} />
              ))}
            </View>
            <View style={styles.peersRow}>
              {peers.map((peer) => (
                <NodeDot
                  key={peer.id}
                  label={peer.name.replace("Node-", "")}
                  sublabel={peer.id.slice(0, 6)}
                  isMe={false}
                  size={52}
                  colors={colors}
                />
              ))}
            </View>
          </View>
        )}
      </View>

      {/* Internet Sync */}
      <InternetSyncCard colors={colors} />

      {/* Data Retention */}
      <DataRetentionCard colors={colors} />

      {/* Background Sync */}
      <BackgroundSyncCard colors={colors} />

      {/* Node list */}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>NODE LIST</Text>
        <View style={styles.nodeItem}>
          <View style={styles.nodeLeft}>
            <View style={[styles.badge, { backgroundColor: colors.primary + "22" }]}>
              <Text style={[styles.badgeText, { color: colors.primary }]}>YOU</Text>
            </View>
            <Text style={[styles.nodeName, { color: colors.foreground }]}>{myNode.name}</Text>
          </View>
          <View style={styles.nodeRight}>
            <Text style={[styles.nodeId, { color: colors.mutedForeground }]}>{myNode.id}</Text>
            <Text style={[styles.nodeLoc, { color: colors.border }]} numberOfLines={1}>
              {myNode.location}
            </Text>
          </View>
        </View>
        {peers.map((peer) => (
          <View key={peer.id}>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <View style={styles.nodeItem}>
              <View style={styles.nodeLeft}>
                <View style={[styles.onlineDot, { backgroundColor: colors.success }]} />
                <Text style={[styles.nodeName, { color: colors.foreground }]}>{peer.name}</Text>
              </View>
              <View style={styles.nodeRight}>
                <Text style={[styles.nodeId, { color: colors.mutedForeground }]}>{peer.id}</Text>
                <Text style={[styles.nodeLoc, { color: colors.border }]} numberOfLines={1}>
                  {peer.location}
                </Text>
              </View>
            </View>
          </View>
        ))}
        {peers.length === 0 && (
          <View style={styles.emptyPeers}>
            <Feather name="wifi-off" size={16} color={colors.border} />
            <Text style={[styles.emptyPeersText, { color: colors.mutedForeground }]}>
              No peers discovered
            </Text>
          </View>
        )}
      </View>

      {/* Network stats */}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>NETWORK STATS</Text>
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={[styles.statValue, { color: colors.foreground }]}>{totalNodes}</Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Total Nodes</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
          <View style={styles.stat}>
            <Text style={[styles.statValue, { color: colors.foreground }]}>{peers.length}</Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Connections</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
          <View style={styles.stat}>
            <Text
              style={[
                styles.statValue,
                { color: connected ? colors.success : colors.destructive },
              ]}
            >
              {connected ? "Live" : "Off"}
            </Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Relay</Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, gap: 12 },
  title: { fontSize: 26, fontWeight: "700", fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 13, marginTop: 2, fontFamily: "Inter_400Regular" },
  mapCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 24,
    minHeight: 200,
    alignItems: "center",
    justifyContent: "center",
  },
  mapEmpty: { alignItems: "center", gap: 16 },
  mapEmptyText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  mapGrid: { alignItems: "center", gap: 12, width: "100%" },
  mapCenter: { alignItems: "center" },
  connectLine: { flexDirection: "row", gap: 4, alignItems: "center" },
  lineDot: { width: 4, height: 4, borderRadius: 2 },
  peersRow: { flexDirection: "row", flexWrap: "wrap", gap: 24, justifyContent: "center" },
  card: { borderRadius: 14, borderWidth: 1, padding: 16, gap: 12 },
  sectionLabel: { fontSize: 11, fontWeight: "600", letterSpacing: 1, fontFamily: "Inter_600SemiBold" },
  bgRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  bgTitle: { fontSize: 15, fontWeight: "600", fontFamily: "Inter_600SemiBold" },
  bgNote: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  intervalRow: { flexDirection: "row", gap: 8 },
  intervalBtn: { flex: 1, paddingVertical: 8, borderRadius: 10, borderWidth: 1, alignItems: "center" },
  intervalText: { fontSize: 13, fontWeight: "600", fontFamily: "Inter_600SemiBold" },
  intervalNote: { fontSize: 10, fontFamily: "Inter_400Regular" },
  // Retention
  retentionGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  retentionBtn: {
    paddingVertical: 8,
    paddingHorizontal: 0,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    width: "30%",
    flexGrow: 1,
  },
  retentionBtnLabel: { fontSize: 13, fontWeight: "600", fontFamily: "Inter_600SemiBold" },
  // Status
  statusBox: { borderRadius: 10, borderWidth: 1, padding: 12, gap: 4 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 13, fontFamily: "Inter_400Regular", flex: 1 },
  syncCount: { fontSize: 11, fontFamily: "Inter_400Regular", paddingLeft: 16 },
  syncBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  syncBtnText: { fontSize: 12, fontWeight: "600", fontFamily: "Inter_600SemiBold" },
  notifHint: { flexDirection: "row", alignItems: "center", gap: 6 },
  notifHintText: { fontSize: 11, fontFamily: "Inter_400Regular" },
  // Internet sync stats
  inetStatsRow: { flexDirection: "row", gap: 0 },
  inetStat: { flex: 1, alignItems: "center", gap: 3 },
  inetStatValue: { fontSize: 14, fontWeight: "700", fontFamily: "Inter_700Bold" },
  inetStatLabel: { fontSize: 10, fontFamily: "Inter_400Regular" },
  // Node list
  nodeItem: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 4 },
  nodeLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  nodeRight: { alignItems: "flex-end", gap: 2, flex: 1, marginLeft: 12 },
  badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 },
  badgeText: { fontSize: 10, fontWeight: "700", fontFamily: "Inter_700Bold" },
  nodeName: { fontSize: 13, fontWeight: "600", fontFamily: "Inter_600SemiBold" },
  nodeId: { fontSize: 10, fontFamily: "Inter_400Regular" },
  nodeLoc: { fontSize: 10, fontFamily: "Inter_400Regular", maxWidth: 140, textAlign: "right" },
  onlineDot: { width: 8, height: 8, borderRadius: 4 },
  emptyPeers: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8 },
  emptyPeersText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  // Stats
  statsRow: { flexDirection: "row" },
  stat: { flex: 1, alignItems: "center", gap: 4 },
  statValue: { fontSize: 20, fontWeight: "700", fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  statDivider: { width: 1, marginVertical: 4 },
  divider: { height: 1 },
});
