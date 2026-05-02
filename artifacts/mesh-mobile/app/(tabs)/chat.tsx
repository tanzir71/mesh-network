import React, { useState } from "react";
import {
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMesh } from "@/context/MeshContext";
import { useColors } from "@/hooks/useColors";
import type { ChatMessage } from "@/context/MeshContext";

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function MessageBubble({ msg, isMe, colors }: { msg: ChatMessage; isMe: boolean; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={[styles.bubbleWrapper, isMe ? styles.bubbleRight : styles.bubbleLeft]}>
      {!isMe && (
        <Text style={[styles.bubbleFrom, { color: colors.mutedForeground }]}>{msg.from}</Text>
      )}
      <View
        style={[
          styles.bubble,
          isMe
            ? { backgroundColor: colors.primary }
            : { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 },
        ]}
      >
        <Text style={[styles.bubbleText, { color: isMe ? colors.primaryForeground : colors.foreground }]}>
          {msg.text}
        </Text>
      </View>
      <Text style={[styles.bubbleTime, { color: colors.mutedForeground }]}>{formatTime(msg.timestamp)}</Text>
    </View>
  );
}

export default function ChatScreen() {
  const { myNode, peers, messages, sendMessage } = useMesh();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [input, setInput] = useState("");

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
    sendMessage(text);
    setInput("");
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior="padding"
      keyboardVerticalOffset={0}
    >
      <View style={[styles.header, { paddingTop: topPad + 12, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Mesh Chat</Text>
        <View style={styles.headerBadge}>
          <View style={[styles.dot, { backgroundColor: peers.length > 0 ? colors.success : colors.mutedForeground }]} />
          <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>
            {peers.length === 0 ? "No peers" : `${peers.length} peer${peers.length !== 1 ? "s" : ""}`}
          </Text>
        </View>
      </View>

      {messages.length === 0 ? (
        <View style={styles.empty}>
          <Feather name="message-square" size={40} color={colors.border} />
          <Text style={[styles.emptyTitle, { color: colors.mutedForeground }]}>No messages yet</Text>
          <Text style={[styles.emptySub, { color: colors.border }]}>
            {peers.length === 0 ? "Connect peers to start chatting" : "Send the first message"}
          </Text>
        </View>
      ) : (
        <FlatList
          data={messages}
          keyExtractor={(m) => m.id}
          inverted
          contentContainerStyle={{ padding: 16, gap: 4, paddingTop: 8 }}
          showsVerticalScrollIndicator={false}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <MessageBubble
              msg={item}
              isMe={item.fromId === myNode.id}
              colors={colors}
            />
          )}
        />
      )}

      <View style={[styles.inputBar, { borderTopColor: colors.border, backgroundColor: colors.card, paddingBottom: bottomPad + 8 }]}>
        <TextInput
          style={[styles.input, { backgroundColor: colors.secondary, color: colors.foreground, borderColor: colors.border }]}
          value={input}
          onChangeText={setInput}
          onSubmitEditing={handleSend}
          placeholder={peers.length === 0 ? "Connect peers to chat..." : "Message..."}
          placeholderTextColor={colors.mutedForeground}
          returnKeyType="send"
          blurOnSubmit={false}
        />
        <Pressable
          onPress={handleSend}
          disabled={!input.trim()}
          style={({ pressed }) => [
            styles.sendBtn,
            { backgroundColor: colors.primary, opacity: pressed || !input.trim() ? 0.5 : 1 },
          ]}
        >
          <Feather name="send" size={18} color={colors.primaryForeground} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: 1 },
  headerTitle: { fontSize: 22, fontWeight: "700" as const, fontFamily: "Inter_700Bold" },
  headerBadge: { flexDirection: "row" as const, alignItems: "center" as const, gap: 6, marginTop: 4 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  headerSub: { fontSize: 12, fontFamily: "Inter_400Regular" },
  empty: { flex: 1, alignItems: "center" as const, justifyContent: "center" as const, gap: 8, paddingHorizontal: 40 },
  emptyTitle: { fontSize: 16, fontWeight: "600" as const, fontFamily: "Inter_600SemiBold" },
  emptySub: { fontSize: 13, textAlign: "center" as const, fontFamily: "Inter_400Regular" },
  bubbleWrapper: { marginVertical: 2, maxWidth: "80%" as const },
  bubbleLeft: { alignSelf: "flex-start" as const },
  bubbleRight: { alignSelf: "flex-end" as const },
  bubbleFrom: { fontSize: 11, marginBottom: 3, marginLeft: 4, fontFamily: "Inter_400Regular" },
  bubble: { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleText: { fontSize: 15, fontFamily: "Inter_400Regular", lineHeight: 20 },
  bubbleTime: { fontSize: 10, marginTop: 3, marginHorizontal: 4, fontFamily: "Inter_400Regular" },
  inputBar: { flexDirection: "row" as const, alignItems: "center" as const, gap: 10, padding: 12, paddingTop: 10, borderTopWidth: 1 },
  input: { flex: 1, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, borderWidth: 1, fontFamily: "Inter_400Regular" },
  sendBtn: { width: 42, height: 42, borderRadius: 21, alignItems: "center" as const, justifyContent: "center" as const },
});
