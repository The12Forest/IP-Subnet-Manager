# Architecture

## Component Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser (port 3000)                                            │
│                                                                 │
│  index.html  ←  style.css                                       │
│  app.js  settings.js  users.js  wizard.js                       │
│       │                                                         │
│       │  REST API calls (fetch)           SSE /events           │
└───────┼───────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────┐
│  Express App  (src/server.js)                                   │
│                                                                 │
│  Middleware:                                                     │
│    cookie-parser → express.json → security headers              │
│                                                                 │
│  Routes (all under /api/v1):                                    │
│    /auth     → routes/auth.js                                   │
│    /wizard   → routes/wizard.js                                 │
│    /subnets  → routes/subnets.js                                │
│    /subnets/:id/hosts → routes/hosts.js                         │
│    /hosts    → routes/hosts.js                                  │
│    /users    → routes/users.js                                  │
│    /settings → routes/settings.js                               │
│    /status   → routes/status.js ─────→ SSE Hub                  │
│    /audit    → routes/audit.js                                  │
│    /export   → routes/export.js                                 │
│    /import   → routes/export.js                                 │
│                                                                 │
│  Static files: src/public/ (SPA fallback to index.html)         │
└─────────────────────┬───────────────────────────────────────────┘
                      │
          ┌───────────┼───────────────────────────┐
          │           │                           │
          ▼           ▼                           ▼
┌─────────────┐ ┌──────────────────┐   ┌──────────────────────┐
│ SQLite DB   │ │ Background       │   │ SSE Hub              │
│ (data/)     │ │ Checker          │   │ (lib/sseHub.js)       │
│             │ │ (lib/checker.js) │   │                      │
│ better-     │ │                  │   │ Set<client>          │
│ sqlite3     │ │ TCP + ICMP ping  │   │ broadcast(event)     │
│ (sync)      │ │ every N seconds  │   │                      │
└─────────────┘ └────────┬─────────┘   └──────────────────────┘
                         │                       ▲
                         └───── on change ───────┘

┌─────────────────────────────────────────────────────────────────┐
│  MCP Server  (src/mcp/server.js, port 3001)                     │
│                                                                 │
│  Streamable HTTP transport:                                     │
│    POST   /mcp  →  JSON-RPC dispatch                           │
│    GET    /mcp  →  SSE notifications (server → client)          │
│    DELETE /mcp  →  session teardown                             │
│                                                                 │
│  Auth: Bearer token (MCP_TOKEN)                                 │
│                                                                 │
│  Tools: list/add/update/remove subnets + hosts,                 │
│         check_status, search, get_settings, get_audit_log       │
│                                                                 │
│  (shares same SQLite DB instance via require('../db/schema'))   │
└─────────────────────────────────────────────────────────────────┘
```

## Data Flow

### First Launch
1. Browser loads `index.html`
2. `app.js` calls `GET /api/v1/wizard/status`
3. Returns `{ needed: true }` → wizard overlay shown
4. User fills form → `POST /api/v1/wizard/complete`
5. Server creates admin user + first subnet, sets JWT cookie
6. App initialises dashboard

### Normal Requests
1. Browser sends request with `token` cookie
2. `requireAuth` middleware verifies JWT, attaches `req.user`
3. Route handler reads from SQLite (sync, no async)
4. Response JSON sent back

### Live Status Updates
1. Background checker runs every `CHECK_INTERVAL` seconds
2. For each host: TCP connect or ICMP ping
3. On status change: `broadcast('status_update', { hostId, ip, status })`
4. SSE Hub writes to all connected `EventSource` clients
5. `app.js` listener updates the status dot in the DOM

### MCP Session
1. Claude sends `POST /mcp` with `method: initialize` (no session ID)
2. Server creates a session, responds with `Mcp-Session-Id` header
3. Subsequent calls include that header
4. Tool calls are synchronous SQLite reads/writes

## Module Dependency Graph

```
server.js
├── config.js
├── db/schema.js  ← config.js
├── db/seed.js    ← db/schema.js
├── routes/*.js   ← db/schema.js, middleware/*.js, lib/*.js
├── lib/checker.js ← db/schema.js, config.js, lib/sseHub.js
└── mcp/server.js  ← db/schema.js, config.js, lib/checker.js
```

`lib/sseHub.js` has no local dependencies — this breaks the circular
dependency between `routes/status.js` (which manages SSE clients) and
`lib/checker.js` (which broadcasts events).

## File Layout

```
src/
  server.js          Entry point, HTTP/HTTPS factory, mounts everything
  config.js          All env vars with defaults, single export object
  db/
    schema.js        SQLite tables, WAL mode, FK enforcement
    seed.js          INSERT OR IGNORE default settings rows
  routes/
    auth.js          Login, logout, me
    wizard.js        First-run setup
    subnets.js       Subnet CRUD + hosts sub-router
    hosts.js         Host CRUD + manual check
    users.js         User management (admin only)
    settings.js      Key/value settings
    status.js        Status query + SSE endpoint
    audit.js         Audit log query
    export.js        JSON/Markdown export + JSON import
  middleware/
    auth.js          JWT cookie verification
    admin.js         requireRole() factory
  lib/
    checker.js       TCP/ICMP status checking, background interval
    sseHub.js        Shared SSE client set + broadcast function
    audit.js         Write to audit_log table
    ipUtils.js       IP math helpers
  mcp/
    server.js        MCP Streamable HTTP server
  public/            Static files served by Express
    index.html       SPA shell
    style.css        CSS custom properties (dark/light)
    app.js           Dashboard logic, SSE subscriber
    settings.js      Settings panel
    users.js         Users panel (admin)
    wizard.js        Setup wizard overlay
data/
  subnet-manager.db  SQLite database (volume-mounted)
  certs/             Generated TLS certificates (if HTTPS enabled)
```
