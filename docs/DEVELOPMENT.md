# Development Guide

## Running Locally (without Docker)

```sh
git clone https://github.com/YOUR_USERNAME/subnet-manager
cd subnet-manager
npm install
cp .env.example .env
# Edit .env — at minimum set JWT_SECRET
node src/server.js
```

Open http://localhost:3000 — the setup wizard appears on first launch.

### Hot reload

```sh
node --watch src/server.js
```

Node 18+ supports `--watch` natively. The server restarts on any `.js` file change in `src/`.

### Environment variables

You can set env vars inline without a `.env` file:

```sh
JWT_SECRET=mysecret CHECK_INTERVAL=10 node src/server.js
```

### Default ports

| Service    | Port |
|------------|------|
| Web UI     | 3000 |
| MCP server | 3001 |

Override with `PORT=` and `MCP_PORT=`.

---

## Resetting the Database

Delete the SQLite file and restart:

```sh
rm data/subnet-manager.db
node src/server.js
```

The setup wizard reappears on the next visit.

---

## Adding a New Settings Key

1. Add a row to `defaults` in `src/db/seed.js`:
   ```js
   { key: 'my_feature_flag', value: 'false', description: 'Enable my feature' },
   ```
2. The key is seeded on next startup via `INSERT OR IGNORE` — no migration needed.
3. If the key should be overridable by an env var, add the mapping to `ENV_KEY_MAP` in `src/routes/settings.js`:
   ```js
   my_feature_flag: 'MY_FEATURE_FLAG',
   ```
4. Read the setting at runtime:
   ```js
   const row = db.prepare("SELECT value FROM settings WHERE key = 'my_feature_flag'").get();
   const enabled = row && row.value === 'true';
   ```

---

## Adding a New API Route

1. Create `src/routes/myfeature.js`:
   ```js
   'use strict';
   const express = require('express');
   const requireAuth = require('../middleware/auth');
   const router = express.Router();
   router.get('/', requireAuth, (req, res) => { res.json({ ok: true }); });
   module.exports = router;
   ```
2. Mount it in `src/server.js`:
   ```js
   const myRouter = require('./routes/myfeature');
   app.use('/api/v1/myfeature', myRouter);
   ```

---

## Testing the MCP Server

Start the server and send a request using curl:

```sh
# 1. Initialize (get a session ID)
SESSION=$(curl -si -X POST http://localhost:3001/mcp \
  -H "Authorization: Bearer YOUR_MCP_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}' \
  | grep -i 'mcp-session-id' | awk '{print $2}' | tr -d '\r')

echo "Session: $SESSION"

# 2. List tools
curl -s -X POST http://localhost:3001/mcp \
  -H "Authorization: Bearer YOUR_MCP_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Mcp-Session-Id: $SESSION" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' | python3 -m json.tool

# 3. List subnets
curl -s -X POST http://localhost:3001/mcp \
  -H "Authorization: Bearer YOUR_MCP_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Mcp-Session-Id: $SESSION" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"list_subnets","arguments":{}}}' | python3 -m json.tool
```

---

## Project Conventions

- **CommonJS** throughout — `require`/`module.exports`, no `import`/`export`
- **Synchronous SQLite** — `better-sqlite3` is sync, no `await` needed for DB calls
- **Prepared statements** — prepared at module load time (top of file), not inside handlers
- **No TypeScript** — plain `.js` only
- **No build step** — static files served as-is from `src/public/`
- **2-space indentation**, **single quotes**

---

## Database Schema Reference

See `src/db/schema.js` for the full CREATE TABLE statements.

Tables: `settings`, `users`, `subnets`, `hosts`, `audit_log`.

Key constraints:
- `hosts.ip` is `UNIQUE` — enforced at DB level
- `hosts.subnet_id` has `ON DELETE CASCADE` — deleting a subnet removes all its hosts
- `hosts.last_status` is `CHECK IN ('online', 'offline', 'unknown')`
- `users.role` is `CHECK IN ('admin', 'editor', 'viewer')`
