import { useEffect, useRef } from "react";
import { Wifi, WifiOff } from "lucide-react";
import type { Peer } from "../hooks/useMesh";

type Props = {
  myNode: Peer;
  peers: Peer[];
};

export default function Network({ myNode, peers }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const allNodes = [myNode, ...peers];
    const total = allNodes.length;
    const cx = w / 2;
    const cy = h / 2;
    const radius = Math.min(w, h) * 0.32;

    const positions: { x: number; y: number; node: Peer; isMe: boolean }[] = allNodes.map((node, i) => {
      if (total === 1) return { x: cx, y: cy, node, isMe: true };
      const angle = (i / total) * 2 * Math.PI - Math.PI / 2;
      const r = i === 0 ? 0 : radius;
      return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle), node, isMe: i === 0 };
    });

    ctx.strokeStyle = "#93c5fd";
    ctx.lineWidth = 1.5;
    if (positions.length > 1) {
      for (let i = 1; i < positions.length; i++) {
        ctx.beginPath();
        ctx.moveTo(positions[0].x, positions[0].y);
        ctx.lineTo(positions[i].x, positions[i].y);
        ctx.stroke();
      }
    }

    for (const pos of positions) {
      const nodeRadius = pos.isMe ? 22 : 18;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, nodeRadius, 0, 2 * Math.PI);
      ctx.fillStyle = pos.isMe ? "#3b82f6" : "#e0f2fe";
      ctx.fill();
      ctx.strokeStyle = pos.isMe ? "#1d4ed8" : "#7dd3fc";
      ctx.lineWidth = 2;
      ctx.stroke();

      if (pos.isMe) {
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, nodeRadius + 6, 0, 2 * Math.PI);
        ctx.strokeStyle = "rgba(59,130,246,0.25)";
        ctx.lineWidth = 6;
        ctx.stroke();
      }

      ctx.fillStyle = pos.isMe ? "#fff" : "#1e40af";
      ctx.font = `bold ${pos.isMe ? 10 : 9}px monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(pos.node.id.slice(0, 4), pos.x, pos.y);

      ctx.fillStyle = "#374151";
      ctx.font = "bold 10px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      const label = pos.node.name.replace("Node-", "");
      ctx.fillText(label, pos.x, pos.y + nodeRadius + 5);
    }
  }, [myNode, peers]);

  return (
    <div className="flex flex-col min-h-full bg-gray-50 p-4 pb-24">
      <div className="mb-5">
        <h1 className="text-lg font-bold text-gray-900">Network Map</h1>
        <p className="text-xs text-gray-400">Live mesh topology</p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-4 mb-4 flex justify-center">
        <canvas ref={canvasRef} width={320} height={300} className="max-w-full" />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-3">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Node List</h2>
        <div className="space-y-2">
          <div className="flex items-center justify-between py-1">
            <div className="flex items-center gap-2">
              <Wifi size={14} className="text-blue-500" />
              <span className="text-sm font-medium text-gray-800">{myNode.name}</span>
              <span className="text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded font-medium">you</span>
            </div>
            <div className="text-right">
              <div className="font-mono text-xs text-gray-400">{myNode.id}</div>
              <div className="text-xs text-gray-300 truncate max-w-[120px]">{myNode.location}</div>
            </div>
          </div>
          {peers.map(peer => (
            <div key={peer.id} className="flex items-center justify-between py-1 border-t border-gray-50">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-400" />
                <span className="text-sm font-medium text-gray-700">{peer.name}</span>
              </div>
              <div className="text-right">
                <div className="font-mono text-xs text-gray-400">{peer.id}</div>
                <div className="text-xs text-gray-300 truncate max-w-[120px]">{peer.location}</div>
              </div>
            </div>
          ))}
          {peers.length === 0 && (
            <div className="flex items-center gap-2 text-gray-400 py-2">
              <WifiOff size={14} />
              <span className="text-sm">No peers discovered yet</span>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Network Stats</h2>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <div className="text-xl font-bold text-gray-900">{peers.length + 1}</div>
            <div className="text-xs text-gray-400">Total Nodes</div>
          </div>
          <div>
            <div className="text-xl font-bold text-gray-900">{peers.length}</div>
            <div className="text-xs text-gray-400">Connections</div>
          </div>
          <div>
            <div className="text-xl font-bold text-green-600">100%</div>
            <div className="text-xs text-gray-400">Uptime</div>
          </div>
        </div>
      </div>
    </div>
  );
}
