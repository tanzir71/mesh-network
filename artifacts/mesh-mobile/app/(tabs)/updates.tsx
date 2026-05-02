import React, { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMesh } from "@/context/MeshContext";
import { useColors } from "@/hooks/useColors";
import MeshMap from "@/components/MeshMap";
import type { Post } from "@/context/MeshContext";

const MAX_CHARS = 280;

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return new Date(ts).toLocaleDateString();
}

function PostCard({
  post,
  isMe,
  colors,
}: {
  post: Post;
  isMe: boolean;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View
      style={[
        styles.postCard,
        {
          backgroundColor: colors.card,
          borderColor: isMe ? colors.primary + "55" : colors.border,
        },
      ]}
    >
      <View style={styles.postHeader}>
        <View style={styles.postAuthorRow}>
          <View style={[styles.authorDot, { backgroundColor: isMe ? colors.primary : colors.success }]} />
          <Text style={[styles.authorName, { color: colors.foreground }]}>
            {isMe ? "You" : post.authorName}
          </Text>
          {!isMe && (
            <View style={[styles.syncBadge, { backgroundColor: colors.primary + "22" }]}>
              <Feather name="radio" size={9} color={colors.primary} />
              <Text style={[styles.syncText, { color: colors.primary }]}>mesh</Text>
            </View>
          )}
        </View>
        <Text style={[styles.postTime, { color: colors.mutedForeground }]}>
          {formatRelative(post.timestamp)}
        </Text>
      </View>

      <Text style={[styles.postText, { color: colors.foreground }]}>{post.text}</Text>

      {post.lat !== null && post.lng !== null && (
        <View style={styles.postLocationRow}>
          <Feather name="map-pin" size={11} color={colors.primary} />
          <Text style={[styles.postCoords, { color: colors.mutedForeground }]}>
            {post.lat.toFixed(4)}, {post.lng.toFixed(4)}
          </Text>
        </View>
      )}
    </View>
  );
}

function Composer({
  colors,
  onPost,
}: {
  colors: ReturnType<typeof useColors>;
  onPost: (text: string) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);
  const remaining = MAX_CHARS - text.length;
  const canPost = text.trim().length > 0 && remaining >= 0 && !posting;

  const handlePost = async () => {
    if (!canPost) return;
    setPosting(true);
    await onPost(text.trim());
    setText("");
    setPosting(false);
  };

  return (
    <View style={[styles.composer, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
      <TextInput
        style={[
          styles.composerInput,
          {
            color: colors.foreground,
            backgroundColor: colors.secondary,
            borderColor: colors.border,
          },
        ]}
        value={text}
        onChangeText={setText}
        placeholder="What's happening on the mesh?"
        placeholderTextColor={colors.mutedForeground}
        multiline
        maxLength={MAX_CHARS + 10}
      />
      <View style={styles.composerFooter}>
        <Text
          style={[
            styles.charCount,
            {
              color:
                remaining < 20
                  ? remaining < 0
                    ? colors.destructive
                    : "#f59e0b"
                  : colors.mutedForeground,
            },
          ]}
        >
          {remaining}
        </Text>
        <Pressable
          onPress={handlePost}
          disabled={!canPost}
          style={({ pressed }) => [
            styles.postBtn,
            {
              backgroundColor: colors.primary,
              opacity: !canPost ? 0.4 : pressed ? 0.75 : 1,
            },
          ]}
        >
          {posting ? (
            <ActivityIndicator size="small" color={colors.primaryForeground} />
          ) : (
            <Text style={[styles.postBtnText, { color: colors.primaryForeground }]}>Post</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

function EmptyTimeline({ colors }: { colors: ReturnType<typeof useColors> }) {
  return (
    <View style={styles.empty}>
      <Feather name="edit-3" size={36} color={colors.border} />
      <Text style={[styles.emptyTitle, { color: colors.mutedForeground }]}>No updates yet</Text>
      <Text style={[styles.emptySub, { color: colors.border }]}>
        Post something — it syncs automatically to nearby peers
      </Text>
    </View>
  );
}

export default function UpdatesScreen() {
  const { myNode, posts, addPost } = useMesh();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [view, setView] = useState<"timeline" | "map">("timeline");

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            paddingTop: topPad + 10,
            backgroundColor: colors.background,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <Text style={[styles.title, { color: colors.foreground }]}>Updates</Text>
        <View style={[styles.toggle, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
          <Pressable
            onPress={() => setView("timeline")}
            style={[styles.toggleBtn, view === "timeline" && { backgroundColor: colors.card }]}
          >
            <Feather
              name="list"
              size={14}
              color={view === "timeline" ? colors.foreground : colors.mutedForeground}
            />
            <Text
              style={[
                styles.toggleText,
                { color: view === "timeline" ? colors.foreground : colors.mutedForeground },
              ]}
            >
              Timeline
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setView("map")}
            style={[styles.toggleBtn, view === "map" && { backgroundColor: colors.card }]}
          >
            <Feather
              name="map"
              size={14}
              color={view === "map" ? colors.foreground : colors.mutedForeground}
            />
            <Text
              style={[
                styles.toggleText,
                { color: view === "map" ? colors.foreground : colors.mutedForeground },
              ]}
            >
              Map
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Content */}
      <View style={{ flex: 1 }}>
        {view === "timeline" ? (
          posts.length === 0 ? (
            <EmptyTimeline colors={colors} />
          ) : (
            <FlatList
              data={posts}
              keyExtractor={(p) => p.id}
              contentContainerStyle={{
                paddingHorizontal: 14,
                paddingTop: 10,
                paddingBottom: bottomPad + 165,
                gap: 10,
              }}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => (
                <PostCard post={item} isMe={item.authorId === myNode.id} colors={colors} />
              )}
            />
          )
        ) : (
          <MeshMap posts={posts} colors={colors} myId={myNode.id} />
        )}
      </View>

      {/* Composer — pinned at bottom, timeline view only */}
      {view === "timeline" && (
        <View style={[styles.composerWrapper, { paddingBottom: bottomPad + 65 }]}>
          <Composer colors={colors} onPost={addPost} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: { fontSize: 22, fontWeight: "700" },
  toggle: {
    flexDirection: "row",
    borderRadius: 10,
    borderWidth: 1,
    overflow: "hidden",
    padding: 2,
    gap: 2,
  },
  toggleBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  toggleText: { fontSize: 12, fontWeight: "500" },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 40,
  },
  emptyTitle: { fontSize: 16, fontWeight: "600" },
  emptySub: { fontSize: 13, textAlign: "center", lineHeight: 19 },
  postCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 8,
  },
  postHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  postAuthorRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  authorDot: { width: 7, height: 7, borderRadius: 4 },
  authorName: { fontSize: 13, fontWeight: "600" },
  syncBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 6,
  },
  syncText: { fontSize: 9, fontWeight: "500" },
  postTime: { fontSize: 11 },
  postText: { fontSize: 15, lineHeight: 22 },
  postLocationRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  postCoords: { fontSize: 11 },
  composerWrapper: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
  },
  composer: {
    borderTopWidth: 1,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 8,
    gap: 8,
  },
  composerInput: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    fontSize: 15,
    minHeight: 60,
    maxHeight: 120,
    textAlignVertical: "top",
  },
  composerFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  charCount: { fontSize: 12, fontWeight: "500" },
  postBtn: {
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 8,
    minWidth: 70,
    alignItems: "center",
  },
  postBtnText: { fontSize: 14, fontWeight: "700" },
});
