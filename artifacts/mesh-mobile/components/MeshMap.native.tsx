import React from "react";
import { StyleSheet, Text, View } from "react-native";
import MapView, { Callout, Marker } from "react-native-maps";
import type { Post } from "@/context/MeshContext";
import type { useColors } from "@/hooks/useColors";

type Colors = ReturnType<typeof useColors>;

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(ts).toLocaleDateString();
}

export default function MeshMap({ posts, colors }: { posts: Post[]; colors: Colors }) {
  const geotagged = posts.filter((p) => p.lat !== null && p.lng !== null);
  const centerLat = geotagged.length > 0 ? geotagged[0].lat! : 37.7749;
  const centerLng = geotagged.length > 0 ? geotagged[0].lng! : -122.4194;

  return (
    <MapView
      style={{ flex: 1 }}
      initialRegion={{
        latitude: centerLat,
        longitude: centerLng,
        latitudeDelta: 0.08,
        longitudeDelta: 0.08,
      }}
      showsUserLocation
      userInterfaceStyle="dark"
    >
      {geotagged.map((post) => (
        <Marker
          key={post.id}
          coordinate={{ latitude: post.lat!, longitude: post.lng! }}
          pinColor={colors.primary}
        >
          <Callout tooltip>
            <View style={[styles.callout, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.calloutAuthor, { color: colors.primary }]}>{post.authorName}</Text>
              <Text style={[styles.calloutText, { color: colors.foreground }]}>{post.text}</Text>
              <Text style={[styles.calloutTime, { color: colors.mutedForeground }]}>{formatRelative(post.timestamp)}</Text>
            </View>
          </Callout>
        </Marker>
      ))}
    </MapView>
  );
}

const styles = StyleSheet.create({
  callout: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    maxWidth: 220,
    gap: 4,
  },
  calloutAuthor: { fontWeight: "700", fontSize: 12 },
  calloutText: { fontSize: 13, lineHeight: 18 },
  calloutTime: { fontSize: 11, marginTop: 2 },
});
