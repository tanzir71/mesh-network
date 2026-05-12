# Emergency Mesh Network

An offline-capable peer-to-peer communication network designed for emergency situations. This project enables users to stay connected, broadcast SOS alerts, and communicate even when traditional internet infrastructure is unavailable.

## What’s Implemented (Current)

This repo contains real, minimal transports (not just simulation):

- **Web mesh (browser ↔ browser)**: WebRTC DataChannels for peer-to-peer messaging, with a WebSocket used for discovery + signaling (SDP/ICE). Supports WAN via STUN (default) and optional TURN.
- **Mobile mesh (phone ↔ phone)**:
  - **Bluetooth LE**: advertising + scan + connect, then broadcast via GATT notifications (chunked to fit MTU) with TTL forwarding and de-dupe.
  - **Wi‑Fi Direct (Android)**: higher-throughput local transport using Wi‑Fi P2P; star topology with a group owner forwarding to connected clients.
- **Routing + congestion control (minimal)**:
  - Web: bounded fanout forwarding + DataChannel backpressure checks.
  - Mobile BLE/Wi‑Fi Direct: rate-limited send queues + jittered forwarding to reduce broadcast storms.

## Architecture

This project is structured as a pnpm monorepo with multiple distinct components:

### 📱 Applications (Artifacts)

- **`emergency-mesh`** (`artifacts/emergency-mesh`): The React web application dashboard. Built with Vite, Tailwind CSS, and Radix UI components for a modern, accessible interface. It includes features for viewing the network map, chatting, and managing emergency alerts.
- **`mesh-mobile`** (`artifacts/mesh-mobile`): The React Native mobile app built with Expo. Designed for field use, offering background synchronization, location tracking (MeshMap), and local offline storage.
- **`api-server`** (`artifacts/api-server`): An Express.js backend server handling data synchronization, WebSocket connections for real-time updates, and persistence. Uses Drizzle ORM for database interactions.
- **`mockup-sandbox`** (`artifacts/mockup-sandbox`): A UI component sandbox for rapid prototyping and testing isolated React components.

### 🛠️ Shared Libraries

- **`db`** (`lib/db`): Centralized database schemas and migrations using Drizzle ORM.
- **`api-zod`** (`lib/api-zod`): Shared Zod validation schemas ensuring type safety across the frontend and backend.
- **`api-client-react`** (`lib/api-client-react`): Generated React Query hooks and API clients for seamless data fetching in the web and mobile apps.
- **`api-spec`** (`lib/api-spec`): OpenAPI specifications defining the API contract.

## Tech Stack

- **Frontend**: React, React Native (Expo), Tailwind CSS, Radix UI, Vite.
- **Backend**: Node.js, Express.js, WebSockets (`ws`).
- **Database & State**: Drizzle ORM, React Query.
- **Tooling**: TypeScript, pnpm (Workspaces), ESLint, Prettier, esbuild.

## How the Mesh Works

### Web (WebRTC overlay mesh)

- **Discovery + signaling**: browsers connect to `api-server` via WebSocket at `/api/ws/mesh`.
  - Room-scoped: peers only see others in the same `room`.
  - Signaling messages are routed target-to-target inside a room.
- **Transport**: WebRTC DataChannels carry all mesh payloads peer-to-peer once connected.
- **Multi-hop delivery**: messages are forwarded with **TTL + de-dupe** to allow multi-hop propagation when the overlay is not fully connected.
- **Scaling**:
  - **Bounded-degree partial mesh**: each node maintains up to `k` peer connections (default 6).
  - **Bounded fanout forwarding**: each message forwards to a deterministic subset of peers to reduce amplification.
- **Congestion control (minimal)**:
  - Skips sends if `RTCDataChannel.bufferedAmount` exceeds a threshold.
  - Global token bucket caps sends/sec to reduce forwarding storms.

Relevant code:
- Web mesh hook: [useMesh.ts](file:///c:/Users/tanzir/Desktop/mesh-network/artifacts/emergency-mesh/src/hooks/useMesh.ts)
- Signaling/rooms: [mesh.ts](file:///c:/Users/tanzir/Desktop/mesh-network/artifacts/api-server/src/mesh.ts)

### Mobile (BLE mesh + Wi‑Fi Direct)

Mobile runs multiple transports in parallel:

- **Bluetooth LE (Android + iOS)**:
  - Advertises a shared BLE service UUID and scans for nearby peers.
  - Connects and subscribes to notifications, then sends mesh messages as **chunked notifications** (MTU-sized packets) with **TTL forwarding + de-dupe**.
  - Congestion control: packet queue + token bucket + jittered forwarding.
- **Wi‑Fi Direct / Wi‑Fi P2P (Android only)**:
  - Uses Wi‑Fi Direct discovery + connection to form a group.
  - Uses `sendMessage` / `receiveMessage` (TCP) for higher-throughput local messaging.
  - Topology is effectively **star**: the group owner learns client addresses and forwards messages to clients (with TTL).
  - Congestion control: send queue + token bucket.

Relevant code:
- Mobile mesh context: [MeshContext.tsx](file:///c:/Users/tanzir/Desktop/mesh-network/artifacts/mesh-mobile/context/MeshContext.tsx)

### WAN Support (STUN/TURN)

- The web mesh supports WAN scenarios via STUN by default, and **optional TURN** for hard NAT cases.
- `api-server` exposes ICE config at `GET /api/mesh/ice`. If TURN environment variables are set, the endpoint returns TURN credentials as part of `iceServers`.

Relevant code:
- ICE config endpoint: [mesh.ts](file:///c:/Users/tanzir/Desktop/mesh-network/artifacts/api-server/src/routes/mesh.ts)

## Setup Instructions

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- [pnpm](https://pnpm.io/) (v8 or higher)

### Installation

1. Clone the repository and navigate into the project directory:
   ```bash
   git clone <repository-url>
   cd mesh-network
   ```

2. Install dependencies across the monorepo:
   ```bash
   pnpm install
   ```

### Running the Services

You can run individual services using pnpm's filter command, or navigate to their respective directories.

**Start the API Server:**
```bash
pnpm --filter @workspace/api-server run dev
```

**Start the Web Dashboard:**
```bash
pnpm --filter @workspace/emergency-mesh run dev
```
The web dashboard will typically be available at `http://localhost:5173`.

**Start the Mobile App (Expo):**
```bash
pnpm --filter @workspace/mesh-mobile run dev
```
Use the Expo Go app on your physical device or an emulator to scan the QR code and launch the app.

## Configuration

### Web mesh query params

The web app reads these URL query parameters:

- `room=<string>`: scopes discovery/signaling to a room. Default: `public`
- `k=<number>`: max WebRTC connections per node. Default: `6` (clamped to 1–16)
- `ws=<ws(s)://.../api/ws/mesh>`: override signaling WebSocket URL
- `ice=<http(s)://.../api/mesh/ice>`: override ICE config endpoint (for TURN)

### API server (TURN)

To enable TURN for WAN WebRTC connectivity, set these environment variables for `api-server`:

- `TURN_URLS` (comma-separated URLs, e.g. `turn:host:3478?transport=udp,turn:host:3478?transport=tcp`)
- `TURN_USERNAME`
- `TURN_CREDENTIAL`

The endpoint `GET /api/mesh/ice` always returns a default STUN server, and includes TURN servers if the env vars are present.

### Mobile env vars

- `EXPO_PUBLIC_DOMAIN`: used to construct the WebSocket URL `wss://$EXPO_PUBLIC_DOMAIN/api/ws/mesh`
- `EXPO_PUBLIC_MESH_ROOM` (optional): defaults to `public`

## Notes / Limitations

- **Security**: end-to-end encryption and authenticated peer identity are not implemented yet.
- **Wi‑Fi Direct**: Android-only. iOS has no Wi‑Fi Direct equivalent; use BLE or add Multipeer Connectivity separately.
- **BLE**: intended for small payloads and proximity use; throughput is limited and messages are chunked.
- **Expo**: BLE + Wi‑Fi Direct require native modules; use a compatible native build/runtime rather than expecting full support in a pure Expo Go environment.

## How to Modify and Improve

### Adding New Database Models
1. Define your new schema in `lib/db/src/schema/`.
2. Update the export in `lib/db/src/index.ts`.
3. Generate migrations (if applicable to your setup) and update the `api-server` to utilize the new tables.

### Expanding the API
1. Update the OpenAPI specification in `lib/api-spec/openapi.yaml`.
2. Generate the updated types and client code (usually handled by an orval script if configured).
3. Implement the new routes in `artifacts/api-server/src/routes/`.
4. Ensure validation logic is added to `lib/api-zod`.

### UI Enhancements
- Web components are located in `artifacts/emergency-mesh/src/components/ui/`. They follow the shadcn/ui pattern. You can modify these base components or add new ones.
- Mobile components are in `artifacts/mesh-mobile/components/`.

### Network & Offline Capabilities
- Explore `artifacts/mesh-mobile/services/` to enhance background synchronization (`backgroundSync.ts`) and internet connectivity fallbacks (`internetSync.ts`).
- WebRTC mesh logic lives in `artifacts/emergency-mesh/src/hooks/useMesh.ts`.
- Signaling + rooms live in `artifacts/api-server/src/mesh.ts` and ICE config is in `artifacts/api-server/src/routes/mesh.ts`.
- Mobile BLE + Wi‑Fi Direct mesh logic lives in `artifacts/mesh-mobile/context/MeshContext.tsx`.

## License

MIT License
