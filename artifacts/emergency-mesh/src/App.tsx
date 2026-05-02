import { useState } from "react";
import { Home, MessageSquare, AlertTriangle, Radio } from "lucide-react";
import { useMesh } from "./hooks/useMesh";
import HomePage from "./pages/Home";
import ChatPage from "./pages/Chat";
import SOSPage from "./pages/SOS";
import NetworkPage from "./pages/Network";

type Tab = "home" | "chat" | "sos" | "network";

const tabs: { id: Tab; label: string; icon: typeof Home }[] = [
  { id: "home", label: "Home", icon: Home },
  { id: "chat", label: "Chat", icon: MessageSquare },
  { id: "sos", label: "SOS", icon: AlertTriangle },
  { id: "network", label: "Network", icon: Radio },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>("home");
  const { myNode, peers, messages, sosAlerts, sendMessage, sendSOS, ackSOS } = useMesh();

  const activeSos = sosAlerts.filter(a => !a.acked).length;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-md mx-auto relative">
      <div className="flex-1 overflow-y-auto">
        {activeTab === "home" && (
          <HomePage myNode={myNode} peers={peers} sosAlerts={sosAlerts} />
        )}
        {activeTab === "chat" && (
          <div className="flex flex-col h-screen">
            <ChatPage myNode={myNode} peers={peers} messages={messages} sendMessage={sendMessage} />
          </div>
        )}
        {activeTab === "sos" && (
          <SOSPage myNode={myNode} peers={peers} sosAlerts={sosAlerts} sendSOS={sendSOS} ackSOS={ackSOS} />
        )}
        {activeTab === "network" && (
          <NetworkPage myNode={myNode} peers={peers} />
        )}
      </div>

      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-white border-t border-gray-200 flex z-50">
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          const hasBadge = tab.id === "sos" && activeSos > 0;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-xs font-medium transition-colors relative ${
                isActive ? "text-blue-600" : "text-gray-400 hover:text-gray-600"
              }`}
            >
              <div className="relative">
                <Icon size={22} strokeWidth={isActive ? 2.5 : 1.8} />
                {hasBadge && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[9px] rounded-full flex items-center justify-center font-bold">
                    {activeSos}
                  </span>
                )}
              </div>
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
