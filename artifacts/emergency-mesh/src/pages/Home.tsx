import { Users, Radio, Wifi, AlertTriangle } from "lucide-react";
import type { Peer, SosAlert } from "../hooks/useMesh";

type Props = {
  myNode: Peer;
  peers: Peer[];
  sosAlerts: SosAlert[];
};

export default function Home({ myNode, peers, sosAlerts }: Props) {
  const totalNodes = peers.length + 1;
  const activeSos = sosAlerts.filter(a => !a.acked).length;

  return (
    <div className="flex flex-col min-h-full bg-gray-50 p-4 pb-24">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Emergency Mesh</h1>
        <p className="text-sm text-gray-500">Offline peer-to-peer communication network</p>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Nodes</span>
            <Users size={18} className="text-blue-500" />
          </div>
          <div className="text-3xl font-bold text-gray-900">{totalNodes}</div>
          <div className="text-xs text-gray-400 mt-1">in mesh network</div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Status</span>
            <Radio size={18} className="text-green-500" />
          </div>
          <div className="text-xl font-bold text-green-600">Online</div>
          <div className="text-xs text-gray-400 mt-1">your node status</div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Online</span>
            <Wifi size={18} className="text-blue-400" />
          </div>
          <div className="text-3xl font-bold text-gray-900">{peers.length}</div>
          <div className="text-xs text-gray-400 mt-1">peers reachable</div>
        </div>

        <div className={`bg-white rounded-xl border p-4 ${activeSos > 0 ? "border-red-300 bg-red-50" : "border-gray-200"}`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">SOS</span>
            <AlertTriangle size={18} className={activeSos > 0 ? "text-red-500" : "text-gray-400"} />
          </div>
          <div className={`text-3xl font-bold ${activeSos > 0 ? "text-red-600" : "text-gray-900"}`}>{activeSos}</div>
          <div className="text-xs text-gray-400 mt-1">emergency alerts</div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-3">
        <div className="flex items-center gap-2 mb-3">
          <Wifi size={16} className="text-blue-500" />
          <span className="text-sm font-semibold text-gray-700">Your Node</span>
        </div>
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Name</span>
            <span className="font-medium text-gray-900">{myNode.name}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">ID</span>
            <span className="font-mono text-xs text-gray-700 bg-gray-100 px-2 py-0.5 rounded">{myNode.id}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Location</span>
            <span className="font-medium text-gray-700 text-right max-w-[160px] truncate">
              {myNode.location}
            </span>
          </div>
        </div>
      </div>

      {peers.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-3">
          <div className="flex items-center gap-2 mb-3">
            <Users size={16} className="text-blue-500" />
            <span className="text-sm font-semibold text-gray-700">Connected Peers</span>
          </div>
          <div className="space-y-2">
            {peers.map(peer => (
              <div key={peer.id} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-400" />
                  <span className="text-sm font-medium text-gray-800">{peer.name}</span>
                </div>
                <span className="font-mono text-xs text-gray-400">{peer.id}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-6 text-center">
        <div className="flex justify-center mb-3">
          <div className="relative">
            <Radio size={32} className="text-blue-400" />
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-blue-400 rounded-full animate-ping opacity-75" />
          </div>
        </div>
        <p className="text-sm font-medium text-gray-600">
          {peers.length === 0 ? "Scanning for peers..." : `${peers.length} peer${peers.length !== 1 ? "s" : ""} connected`}
        </p>
        <p className="text-xs text-gray-400 mt-2">
          Open this app in another tab or window to simulate a nearby device joining the mesh
        </p>
      </div>
    </div>
  );
}
