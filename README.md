# Emergency Mesh Network

An offline-capable peer-to-peer communication network designed for emergency situations. This project enables users to stay connected, broadcast SOS alerts, and communicate even when traditional internet infrastructure is unavailable.

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
- WebSockets logic in `artifacts/api-server/src/mesh.ts` handles the real-time node coordination.

## License

MIT License
