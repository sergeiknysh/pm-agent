# PM Web UI (v1 Kanban)

Lightweight Kanban SPA (Vite + React + TypeScript) that reads tasks from the backend index and supports drag&drop status changes.

## API contract (expected)

- `GET /api/index` → returns `pm/_meta/index.json`
- `POST /api/task/:id/status` body `{ "status": "todo"|"doing"|"blocked"|"done" }`

## Run (dev)

1) Start the backend API (see TASK-0009).

By default, the UI expects the backend at `http://127.0.0.1:8787` in development (Vite proxy).

2) Start the UI:

```bash
cd web
npm install
npm run dev
```

If your backend runs on a different port:

```bash
cd web
VITE_API_PROXY_TARGET=http://127.0.0.1:3000 npm run dev
```

Then open the printed URL (usually `http://localhost:5173`).

## Build

```bash
cd web
npm install
npm run build
npm run preview
```
