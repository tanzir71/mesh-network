import React, { useState } from "react";
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
import type { SosAlert } from "@/context/MeshContext";

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function AlertCard({
  alert,
  isMe,
  colors,
  onAck,
}: {
  alert: SosAlert;
  isMe: boolean;
  colors: ReturnType<typeof useColors>;
  onAck?: () => void;
}) {
  const isActive = !alert.acked;
  return (
    <View
      style={[
        styles.alertCard,
        {
          backgroundColor: isActive ? colors.destructive + "18" : colors.card,
          borderColor: isActive ? colors.destructive + "66" : colors.border,
        },
      ]}
    >
      <View style={styles.alertHeader}>
        <View style={styles.alertLeft}>
          <Feather
            name={isActive ? "alert-triangle" : "check-circle"}
            size={16}
            color={isActive ? colors.destructive : colors.success}
          />
          <Text style={[styles.alertFrom, { color: isActive ? colors.destructive : colors.mutedForeground }]}>
            {isMe ? "You" : alert.from}
          </Text>
        </View>
        {isActive && !isMe && onAck && (
          <Pressable
            onPress={onAck}
            style={[styles.ackBtn, { borderColor: colors.border, backgroundColor: colors.secondary }]}
          >
            <Text style={[styles.ackText, { color: colors.foreground }]}>Acknowledge</Text>
          </Pressable>
        )}
      </View>
      <Text style={[styles.alertMsg, { color: isActive ? colors.foreground : colors.mutedForeground }]}>
        {alert.message}
      </Text>
      <Text style={[styles.alertTime, { color: colors.mutedForeground }]}>
        {formatTime(alert.timestamp)}
      </Text>
    </View>
  );
}

export default function SOSScreen() {
  const { myNode, peers, sosAlerts, sendSOS, ackSOS } = useMesh();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [confirming, setConfirming] = useState(false);
  const [customMsg, setCustomMsg] = useState("");

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : 0;

  const active = sosAlerts.filter((a) => !a.acked);
  const resolved = sosAlerts.filter((a) => a.acked);

  const handleSOS = () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    sendSOS(customMsg.trim() || undefined);
    setCustomMsg("");
    setConfirming(false);
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={[
        styles.container,
        { paddingTop: topPad + 16, paddingBottom: bottomPad + 100 },
      ]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.headerSection}>
        <Text style={[styles.title, { color: colors.foreground }]}>SOS Alerts</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          Broadcast emergency to all mesh nodes
        </Text>
      </View>

      <View
        style={[
          styles.sosPanel,
          {
            backgroundColor: confirming ? colors.destructive + "18" : colors.card,
            borderColor: confirming ? colors.destructive : colors.border,
          },
        ]}
      >
        <View style={styles.sosIconRow}>
          <View
            style={[
              styles.sosIconBg,
              { backgroundColor: (confirming ? colors.destructive : colors.mutedForeground) + "22" },
            ]}
          >
            <Feather
              name="alert-triangle"
              size={28}
              color={confirming ? colors.destructive : colors.mutedForeground}
            />
          </View>
        </View>
        <Text style={[styles.sosHint, { color: confirming ? colors.destructive : colors.mutedForeground }]}>
          {confirming ? "Tap again to broadcast emergency" : "Send emergency alert to all peers"}
        </Text>
        <TextInput
          style={[styles.sosInput, { backgroundColor: colors.secondary, color: colors.foreground, borderColor: colors.border }]}
          value={customMsg}
          onChangeText={setCustomMsg}
          placeholder="Custom message (optional)"
          placeholderTextColor={colors.mutedForeground}
        />
        <Pressable
          onPress={handleSOS}
          style={({ pressed }) => [
            styles.sosBtn,
            {
              backgroundColor: confirming ? colors.destructive : colors.destructive + "cc",
              opacity: pressed ? 0.8 : 1,
            },
          ]}
        >
          <Feather name="alert-triangle" size={18} color="#ffffff" />
          <Text style={styles.sosBtnText}>
            {confirming ? "CONFIRM — SEND SOS NOW" : "SEND SOS ALERT"}
          </Text>
        </Pressable>
        {confirming && (
          <Pressable onPress={() => setConfirming(false)} style={styles.cancelBtn}>
            <Text style={[styles.cancelText, { color: colors.mutedForeground }]}>Cancel</Text>
          </Pressable>
        )}
        {peers.length === 0 && (
          <Text style={[styles.noPeersWarning, { color: colors.warning }]}>
            No peers connected — alert will broadcast when peers join
          </Text>
        )}
      </View>

      {active.length > 0 && (
        <View>
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>ACTIVE ALERTS</Text>
          {active.map((alert) => (
            <AlertCard
              key={alert.id}
              alert={alert}
              isMe={alert.fromId === myNode.id}
              colors={colors}
              onAck={() => ackSOS(alert.id)}
            />
          ))}
        </View>
      )}

      {resolved.length > 0 && (
        <View>
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>RESOLVED</Text>
          {resolved.map((alert) => (
            <AlertCard
              key={alert.id}
              alert={alert}
              isMe={alert.fromId === myNode.id}
              colors={colors}
            />
          ))}
        </View>
      )}

      {sosAlerts.length === 0 && (
        <View style={styles.allClear}>
          <Feather name="check-circle" size={32} color={colors.border} />
          <Text style={[styles.allClearText, { color: colors.mutedForeground }]}>All clear — no alerts</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, gap: 14 },
  headerSection: { marginBottom: 2 },
  title: { fontSize: 26, fontWeight: "700" as const, fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 13, marginTop: 2, fontFamily: "Inter_400Regular" },
  sosPanel: { borderRadius: 16, borderWidth: 1.5, padding: 20, gap: 12 },
  sosIconRow: { alignItems: "center" as const },
  sosIconBg: { width: 64, height: 64, borderRadius: 32, alignItems: "center" as const, justifyContent: "center" as const },
  sosHint: { textAlign: "center" as const, fontSize: 13, fontFamily: "Inter_400Regular" },
  sosInput: { borderRadius: 10, borderWidth: 1, padding: 12, fontSize: 14, fontFamily: "Inter_400Regular" },
  sosBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 8,
    borderRadius: 12,
    paddingVertical: 14,
  },
  sosBtnText: { color: "#ffffff", fontWeight: "700" as const, fontSize: 14, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  cancelBtn: { alignItems: "center" as const, paddingVertical: 4 },
  cancelText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  noPeersWarning: { fontSize: 12, textAlign: "center" as const, fontFamily: "Inter_400Regular" },
  sectionTitle: { fontSize: 11, fontWeight: "600" as const, letterSpacing: 1, fontFamily: "Inter_600SemiBold", marginBottom: 6 },
  alertCard: { borderRadius: 12, borderWidth: 1, padding: 14, gap: 6 },
  alertHeader: { flexDirection: "row" as const, justifyContent: "space-between" as const, alignItems: "center" as const },
  alertLeft: { flexDirection: "row" as const, alignItems: "center" as const, gap: 6 },
  alertFrom: { fontSize: 13, fontWeight: "600" as const, fontFamily: "Inter_600SemiBold" },
  ackBtn: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5 },
  ackText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  alertMsg: { fontSize: 14, fontFamily: "Inter_400Regular" },
  alertTime: { fontSize: 11, fontFamily: "Inter_400Regular" },
  allClear: { alignItems: "center" as const, paddingVertical: 20, gap: 8 },
  allClearText: { fontSize: 14, fontFamily: "Inter_400Regular" },
});
