import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMesh } from "@/context/MeshContext";
import { useColors } from "@/hooks/useColors";

function PulseRing({ color }: { color: string }) {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(scale, { toValue: 1.8, duration: 1500, useNativeDriver: true }),
          Animated.timing(scale, { toValue: 1, duration: 0, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(opacity, { toValue: 0, duration: 1500, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.6, duration: 0, useNativeDriver: true }),
        ]),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  return (
    <Animated.View
      style={{
        position: "absolute",
        width: 40,
        height: 40,
        borderRadius: 20,
        borderWidth: 2,
        borderColor: color,
        transform: [{ scale }],
        opacity,
      }}
    />
  );
}

export default function HomeScreen() {
  const { myNode, peers, connected, renameNode } = useMesh();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [editing, setEditing] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const inputRef = useRef<TextInput>(null);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : 0;

  const styles = makeStyles(colors);

  function startEdit() {
    setNameInput(myNode.name);
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  async function confirmRename() {
    const trimmed = nameInput.trim();
    if (trimmed && trimmed !== myNode.name) {
      await renameNode(trimmed);
    }
    setEditing(false);
  }

  function cancelEdit() {
    setEditing(false);
    setNameInput("");
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={[
        styles.container,
        { paddingTop: topPad + 16, paddingBottom: bottomPad + 100 },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Text style={styles.title}>Emergency Mesh</Text>
        <Text style={styles.subtitle}>Offline peer-to-peer network</Text>
        <View style={styles.statusRow}>
          <View style={[styles.statusDot, { backgroundColor: connected ? colors.success : colors.destructive }]} />
          <Text style={[styles.statusText, { color: connected ? colors.success : colors.destructive }]}>
            {connected ? "Connected to relay" : "Reconnecting..."}
          </Text>
        </View>
      </View>

      <View style={styles.grid}>
        <View style={[styles.card, styles.cardHalf]}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardLabel}>NODES</Text>
            <Feather name="users" size={16} color={colors.primary} />
          </View>
          <Text style={styles.cardNumber}>{peers.length + 1}</Text>
          <Text style={styles.cardSub}>in mesh</Text>
        </View>

        <View style={[styles.card, styles.cardHalf]}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardLabel}>STATUS</Text>
            <Feather name="radio" size={16} color={colors.success} />
          </View>
          <Text style={[styles.cardNumber, { color: colors.success, fontSize: 20 }]}>Online</Text>
          <Text style={styles.cardSub}>your node</Text>
        </View>

        <View style={[styles.card, styles.cardHalf]}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardLabel}>PEERS</Text>
            <Feather name="wifi" size={16} color={colors.primary} />
          </View>
          <Text style={styles.cardNumber}>{peers.length}</Text>
          <Text style={styles.cardSub}>reachable</Text>
        </View>

      </View>

      {/* YOUR NODE card */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Feather name="cpu" size={14} color={colors.primary} />
            <Text style={[styles.cardLabel, { marginLeft: 6 }]}>YOUR NODE</Text>
          </View>
        </View>

        {/* Name row — tappable */}
        <Pressable onPress={startEdit} style={styles.nodeRow}>
          <Text style={styles.nodeKey}>Name</Text>
          {editing ? (
            <View style={styles.renameRow}>
              <TextInput
                ref={inputRef}
                value={nameInput}
                onChangeText={setNameInput}
                style={[styles.renameInput, { color: colors.foreground, borderColor: colors.primary, backgroundColor: colors.secondary }]}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={32}
                returnKeyType="done"
                onSubmitEditing={confirmRename}
                selectTextOnFocus
              />
              <Pressable onPress={confirmRename} hitSlop={8}>
                <Feather name="check" size={18} color={colors.success} />
              </Pressable>
              <Pressable onPress={cancelEdit} hitSlop={8}>
                <Feather name="x" size={18} color={colors.mutedForeground} />
              </Pressable>
            </View>
          ) : (
            <View style={styles.renameRow}>
              <Text style={styles.nodeValue}>{myNode.name || "Initializing..."}</Text>
              <Feather name="edit-2" size={13} color={colors.mutedForeground} />
            </View>
          )}
        </Pressable>

        <View style={styles.divider} />
        <View style={styles.nodeRow}>
          <Text style={styles.nodeKey}>ID</Text>
          <Text style={[styles.nodeValue, styles.mono]}>{myNode.id || "..."}</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.nodeRow}>
          <Text style={styles.nodeKey}>Location</Text>
          <Text style={styles.nodeValue}>{myNode.location}</Text>
        </View>
      </View>

      {peers.length > 0 && (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Feather name="zap" size={14} color={colors.success} />
            <Text style={[styles.cardLabel, { marginLeft: 6 }]}>CONNECTED PEERS</Text>
          </View>
          {peers.map((peer) => (
            <View key={peer.id}>
              <View style={styles.peerRow}>
                <View style={styles.peerLeft}>
                  <View style={[styles.onlineDot, { backgroundColor: colors.success }]} />
                  <Text style={styles.peerName}>{peer.name}</Text>
                </View>
                <Text style={[styles.peerId, styles.mono]}>{peer.id}</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      <View style={[styles.card, styles.scanCard]}>
        <View style={styles.scanIcon}>
          <PulseRing color={colors.primary} />
          <Feather name="radio" size={20} color={colors.primary} />
        </View>
        <Text style={styles.scanText}>
          {peers.length === 0 ? "Scanning for peers..." : `${peers.length} peer${peers.length !== 1 ? "s" : ""} in mesh`}
        </Text>
        <Text style={styles.scanSub}>Open this app on another device to join the mesh</Text>
      </View>
    </ScrollView>
  );
}

function makeStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    container: { paddingHorizontal: 16, gap: 12 },
    header: { marginBottom: 4 },
    title: { fontSize: 26, fontWeight: "700" as const, color: colors.foreground, fontFamily: "Inter_700Bold" },
    subtitle: { fontSize: 13, color: colors.mutedForeground, marginTop: 2, fontFamily: "Inter_400Regular" },
    statusRow: { flexDirection: "row" as const, alignItems: "center" as const, marginTop: 8, gap: 6 },
    statusDot: { width: 7, height: 7, borderRadius: 4 },
    statusText: { fontSize: 12, fontFamily: "Inter_500Medium" },
    grid: { flexDirection: "row" as const, flexWrap: "wrap" as const, gap: 10 },
    card: {
      backgroundColor: colors.card,
      borderRadius: colors.radius ?? 12,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
    },
    cardHalf: { flex: 1, minWidth: "45%" as const },
    cardAlert: { borderColor: colors.destructive + "66" },
    cardHeader: { flexDirection: "row" as const, justifyContent: "space-between" as const, alignItems: "center" as const, marginBottom: 8 },
    cardLabel: { fontSize: 10, fontWeight: "600" as const, color: colors.mutedForeground, letterSpacing: 1, fontFamily: "Inter_600SemiBold" },
    cardNumber: { fontSize: 32, fontWeight: "700" as const, color: colors.foreground, fontFamily: "Inter_700Bold" },
    cardSub: { fontSize: 11, color: colors.mutedForeground, marginTop: 2, fontFamily: "Inter_400Regular" },
    nodeRow: { flexDirection: "row" as const, justifyContent: "space-between" as const, alignItems: "center" as const, paddingVertical: 8 },
    nodeKey: { fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
    nodeValue: { fontSize: 13, color: colors.foreground, fontFamily: "Inter_500Medium", maxWidth: 200, textAlign: "right" as const },
    mono: { fontFamily: "Inter_400Regular", fontSize: 12, backgroundColor: colors.secondary, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
    divider: { height: 1, backgroundColor: colors.border },
    // Rename row
    renameRow: { flexDirection: "row" as const, alignItems: "center" as const, gap: 8, flex: 1, justifyContent: "flex-end" as const },
    renameInput: {
      flex: 1,
      maxWidth: 160,
      fontSize: 13,
      fontFamily: "Inter_500Medium",
      borderWidth: 1,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: Platform.OS === "ios" ? 6 : 4,
      textAlign: "right" as const,
    },
    // Peers
    peerRow: { flexDirection: "row" as const, justifyContent: "space-between" as const, alignItems: "center" as const, paddingVertical: 8 },
    peerLeft: { flexDirection: "row" as const, alignItems: "center" as const, gap: 8, flex: 1 },
    onlineDot: { width: 7, height: 7, borderRadius: 4 },
    peerName: { fontSize: 14, color: colors.foreground, fontFamily: "Inter_500Medium" },
    peerId: { fontSize: 11, color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
    // Scan card
    scanCard: { alignItems: "center" as const, paddingVertical: 28 },
    scanIcon: { width: 48, height: 48, alignItems: "center" as const, justifyContent: "center" as const, marginBottom: 12 },
    scanText: { fontSize: 14, fontWeight: "600" as const, color: colors.foreground, fontFamily: "Inter_600SemiBold" },
    scanSub: { fontSize: 12, color: colors.mutedForeground, textAlign: "center" as const, marginTop: 4, fontFamily: "Inter_400Regular" },
  });
}
