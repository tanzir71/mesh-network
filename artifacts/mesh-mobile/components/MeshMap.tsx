import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import type { Post } from "@/context/MeshContext";
import type { useColors } from "@/hooks/useColors";

type Colors = ReturnType<typeof useColors>;

export default function MeshMap({ posts, colors }: { posts: Post[]; colors: Colors }) {
  const geotagged = posts.filter((p) => p.lat !== null && p.lng !== null);

  return (
    <View style={[styles.container, { backgroundColor: colors.card }]}>
      <Feather name="map" size={36} color={colors.border} />
      <Text style={[styles.title, { color: colors.mutedForeground }]}>Map view</Text>
      <Text style={[styles.sub, { color: colors.border }]}>
        Open in Expo Go on your device to see the live map
      </Text>
      {geotagged.length > 0 && (
        <View style={{ marginTop: 20, gap: 8, width: "100%" }}>
          {geotagged.slice(0, 6).map((p) => (
            <View key={p.id} style={[styles.row, { borderColor: colors.border }]}>
              <Feather name="map-pin" size={12} color={colors.primary} />
              <Text style={[styles.coord, { color: colors.mutedForeground }]}>
                {p.lat!.toFixed(4)}, {p.lng!.toFixed(4)}
              </Text>
              <Text style={[styles.postText, { color: colors.foreground }]} numberOfLines={1}>
                {p.text}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, padding: 32 },
  title: { fontSize: 16, fontWeight: "600" },
  sub: { fontSize: 13, textAlign: "center", lineHeight: 19 },
  row: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderRadius: 8, padding: 8, width: "100%" },
  coord: { fontSize: 11 },
  postText: { flex: 1, fontSize: 13 },
});
