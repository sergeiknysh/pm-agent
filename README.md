# pm-agent

PM-as-files tracker + web UI.

## Dev (Docker, hot reload)

Requirements: Docker Desktop / docker engine with Compose.

```bash
make up
```

- API: http://localhost:8787
- Web UI: http://localhost:5173

Stop:
```bash
make down
```

Tail logs:
```bash
make logs
```

If you want a clean slate (removes docker volumes used for `node_modules`):
```bash
make clean
```

Data persistence:
- `./pm` is bind-mounted into the API container, so tasks persist between restarts.
- `./.pm-secrets` is bind-mounted too (sessions/password shadow).
