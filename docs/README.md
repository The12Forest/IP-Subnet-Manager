# Subnet Manager — Documentation

## Overview

Subnet Manager is a self-hosted web application for tracking IP addresses and container assignments across your subnets. It provides live status monitoring, user management, audit logging, and a built-in MCP server for AI assistant integration.

## Feature Reference

| Feature | Description |
|---------|-------------|
| Subnet CRUD | Add, edit, delete, and reorder subnets |
| Host management | Add hosts with IP validation against subnet range |
| Live status | TCP port or ICMP ping checks with SSE updates |
| Wizard | First-launch setup for network config and admin account |
| Dark/light mode | Toggled per-browser, default dark |
| User roles | admin / editor / viewer |
| Audit log | Every create/update/delete is logged |
| Export | JSON and Markdown exports |
| Import | Bulk JSON import |
| MCP server | 14 tools for Claude integration |
| HTTPS | Off / self-signed / custom certificate modes |
| Docker | Single container with volume-mounted data directory |

## Documentation Files

| File | Contents |
|------|----------|
| [SETUP.md](SETUP.md) | Docker setup, env vars, HTTPS, GHCR publishing |
| [API.md](API.md) | All REST endpoints with request/response examples |
| [MCP.md](MCP.md) | MCP server connection and tool reference |
| [DEVELOPMENT.md](DEVELOPMENT.md) | Local dev, DB reset, adding settings keys |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Component diagram and module dependency graph |

## Component Summary

- **Web UI** — SPA served on port 3000. Vanilla HTML/CSS/JS. Dark mode by default.
- **REST API** — Express routes under `/api/v1`. JWT in httpOnly cookie.
- **SQLite** — `better-sqlite3`, single file at `data/subnet-manager.db`.
- **Status checker** — background `setInterval`, TCP + ICMP, broadcasts via SSE.
- **MCP server** — Streamable HTTP on port 3001, 14 tools.

## Screenshots

Screenshots can be placed in `docs/screenshots/` and referenced from the root `README.md`.
