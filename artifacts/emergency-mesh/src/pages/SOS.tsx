import { useState } from "react";
import { AlertTriangle, CheckCircle, Clock } from "lucide-react";
import type { SosAlert, Peer } from "../hooks/useMesh";

type Props = {
  myNode: Peer;
  peers: Peer[];
  sosAlerts: SosAlert[];
  sendSOS: (message?: string) => void;
  ackSOS: (id: string) => void;
};

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default function SOS({ myNode, peers, sosAlerts, sendSOS, ackSOS }: Props) {
  const [custom, setCustom] = useState("");
  const [confirming, setConfirming] = useState(false);

  const handleSend = () => {
    if (!confirming) { setConfirming(true); return; }
    sendSOS(custom.trim() || undefined);
    setCustom("");
    setConfirming(false);
  };

  const active = sosAlerts.filter(a => !a.acked);
  const resolved = sosAlerts.filter(a => a.acked);

  return (
    <div className="flex flex-col min-h-full bg-gray-50 p-4 pb-24">
      <div className="mb-5">
        <h1 className="text-lg font-bold text-gray-900">SOS Alerts</h1>
        <p className="text-xs text-gray-400">Broadcast emergency alerts to all mesh nodes</p>
      </div>

      <div className={`rounded-2xl p-5 mb-5 text-center border-2 transition-all ${confirming ? "border-red-500 bg-red-50" : "border-gray-200 bg-white"}`}>
        <AlertTriangle size={36} className={`mx-auto mb-3 ${confirming ? "text-red-500" : "text-gray-300"}`} />
        <p className="text-sm text-gray-600 mb-3">
          {confirming ? "Tap again to broadcast SOS to all peers" : "Send an emergency alert to all connected peers"}
        </p>
        <div className="mb-3">
          <input
            type="text"
            value={custom}
            onChange={e => setCustom(e.target.value)}
            placeholder="Custom message (optional)"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-red-300 bg-gray-50"
          />
        </div>
        <button
          onClick={handleSend}
          className={`w-full py-3 rounded-xl font-bold text-sm transition-all ${
            confirming
              ? "bg-red-600 text-white hover:bg-red-700"
              : "bg-red-500 text-white hover:bg-red-600"
          }`}
        >
          {confirming ? "CONFIRM — SEND SOS NOW" : "SEND SOS ALERT"}
        </button>
        {confirming && (
          <button onClick={() => setConfirming(false)} className="mt-2 text-xs text-gray-400 underline">
            Cancel
          </button>
        )}
        {peers.length === 0 && (
          <p className="text-xs text-orange-500 mt-2">No peers connected — alert will be sent when peers join</p>
        )}
      </div>

      {active.length > 0 && (
        <div className="mb-4">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Active Alerts</h2>
          <div className="space-y-2">
            {active.map(alert => (
              <div key={alert.id} className="bg-red-50 border border-red-200 rounded-xl p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-1.5 mb-1">
                      <AlertTriangle size={14} className="text-red-500 flex-shrink-0" />
                      <span className="text-sm font-semibold text-red-700">
                        {alert.fromId === myNode.id ? "You" : alert.from}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700">{alert.message}</p>
                    <div className="flex items-center gap-1 mt-1">
                      <Clock size={11} className="text-gray-400" />
                      <span className="text-xs text-gray-400">{formatTime(alert.timestamp)}</span>
                    </div>
                  </div>
                  {alert.fromId !== myNode.id && (
                    <button
                      onClick={() => ackSOS(alert.id)}
                      className="text-xs bg-white border border-gray-200 text-gray-600 px-2.5 py-1 rounded-lg hover:bg-gray-50 flex-shrink-0"
                    >
                      Acknowledge
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {resolved.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Resolved</h2>
          <div className="space-y-2">
            {resolved.map(alert => (
              <div key={alert.id} className="bg-white border border-gray-200 rounded-xl p-4 opacity-60">
                <div className="flex items-center gap-1.5 mb-1">
                  <CheckCircle size={14} className="text-green-500" />
                  <span className="text-sm font-medium text-gray-600">
                    {alert.fromId === myNode.id ? "You" : alert.from}
                  </span>
                  <span className="text-xs text-gray-400">· {formatTime(alert.timestamp)}</span>
                </div>
                <p className="text-sm text-gray-500">{alert.message}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {sosAlerts.length === 0 && (
        <div className="text-center py-8 text-gray-400">
          <CheckCircle size={32} className="mx-auto mb-2 text-gray-200" />
          <p className="text-sm">No alerts — all clear</p>
        </div>
      )}
    </div>
  );
}
