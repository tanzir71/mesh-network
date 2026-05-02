import { useState, useRef, useEffect } from "react";
import { Send, MessageSquare } from "lucide-react";
import type { ChatMessage, Peer } from "../hooks/useMesh";

type Props = {
  myNode: Peer;
  peers: Peer[];
  messages: ChatMessage[];
  sendMessage: (text: string) => void;
};

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function Chat({ myNode, peers, messages, sendMessage }: Props) {
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
    sendMessage(text);
    setInput("");
  };

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <div className="p-4 border-b border-gray-200 bg-white">
        <h1 className="text-lg font-bold text-gray-900">Mesh Chat</h1>
        <p className="text-xs text-gray-400">
          {peers.length === 0 ? "No peers connected" : `${peers.length} peer${peers.length !== 1 ? "s" : ""} reachable`}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3 pb-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-16">
            <MessageSquare size={40} className="text-gray-300 mb-3" />
            <p className="text-sm text-gray-400 font-medium">No messages yet</p>
            <p className="text-xs text-gray-300 mt-1">
              Messages will appear here once peers connect
            </p>
          </div>
        ) : (
          messages.map(msg => {
            const isMe = msg.fromId === myNode.id;
            return (
              <div key={msg.id} className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                <div className="text-xs text-gray-400 mb-1 px-1">
                  {isMe ? "You" : msg.from} · {formatTime(msg.timestamp)}
                </div>
                <div
                  className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm ${
                    isMe
                      ? "bg-blue-500 text-white rounded-br-sm"
                      : "bg-white border border-gray-200 text-gray-800 rounded-bl-sm"
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      <div className="p-4 border-t border-gray-200 bg-white pb-24">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSend()}
            placeholder={peers.length === 0 ? "Connect peers to chat..." : "Type a message..."}
            className="flex-1 border border-gray-200 rounded-full px-4 py-2 text-sm outline-none focus:border-blue-400 bg-gray-50"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-blue-600 transition-colors flex-shrink-0"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
