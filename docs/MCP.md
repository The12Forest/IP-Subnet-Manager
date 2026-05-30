# MCP Integration Guide

Subnet Manager includes a built-in **Model Context Protocol (MCP)** server on port **3001**. Connect it to Claude to query and manage your network directly from conversations.

## Transport

Uses **Streamable HTTP** transport (MCP spec 2025-03-26). SSE-only transport is not supported — Streamable HTTP is the current recommended standard.

Endpoints:
- `POST /mcp` — send JSON-RPC requests, receive JSON or SSE stream
- `GET /mcp` — SSE stream for server-initiated notifications
- `DELETE /mcp` — terminate a session

## Authentication

All requests require a Bearer token in the `Authorization` header:

```
Authorization: Bearer YOUR_MCP_TOKEN
```

Find your token in **Settings → About** in the web UI, or in the server logs on first startup (if `MCP_TOKEN` env var is not set).

## Connecting Claude Desktop

Add this to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "subnet-manager": {
      "url": "http://localhost:3001/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_MCP_TOKEN"
      }
    }
  }
}
```

Replace `YOUR_MCP_TOKEN` with your actual token. If running on a remote server, replace `localhost` with the server IP or hostname.

---

## Available Tools

### `list_subnets`
List all configured subnets.

```json
{ "name": "list_subnets", "arguments": {} }
```

Returns an array of subnet objects with `id`, `name`, `network`, `cidr`, `description`, `color`, `hosts_count`.

---

### `list_hosts`
List hosts, optionally filtered by subnet.

```json
{ "name": "list_hosts", "arguments": { "subnet_id": 1 } }
```

Omit `subnet_id` to list all hosts. Returns array of host objects.

---

### `get_host`
Get a single host by IP address.

```json
{ "name": "get_host", "arguments": { "ip": "192.168.1.100" } }
```

---

### `add_host`
Add a new host to a subnet.

```json
{
  "name": "add_host",
  "arguments": {
    "subnet_id": 1,
    "ip": "192.168.1.50",
    "name": "nginx-proxy",
    "description": "Reverse proxy container",
    "check_port": 80
  }
}
```

`check_port` is optional. Without it, ICMP ping is used for status checks.

---

### `update_host`
Update a host's details by IP.

```json
{
  "name": "update_host",
  "arguments": {
    "ip": "192.168.1.50",
    "name": "nginx-lb",
    "check_port": 443,
    "notes": "## nginx-lb\nLoad balancer for web traffic."
  }
}
```

All fields are optional — only specified fields are updated.

---

### `remove_host`
Remove a host by IP.

```json
{ "name": "remove_host", "arguments": { "ip": "192.168.1.50" } }
```

---

### `check_status`
Trigger a status check. Provide `ip` for a single host, or omit for all hosts.

```json
{ "name": "check_status", "arguments": { "ip": "192.168.1.50" } }
```
```json
{ "name": "check_status", "arguments": {} }
```

---

### `add_subnet`
Create a new subnet.

```json
{
  "name": "add_subnet",
  "arguments": {
    "name": "Storage VLAN",
    "network": "10.10.5.0",
    "cidr": 24,
    "description": "NAS and backup servers",
    "color": "#f59e0b"
  }
}
```

---

### `update_subnet`
Update a subnet by ID.

```json
{
  "name": "update_subnet",
  "arguments": {
    "id": 2,
    "description": "Updated description",
    "color": "#22c55e"
  }
}
```

---

### `remove_subnet`
Remove a subnet and all its hosts by ID.

```json
{ "name": "remove_subnet", "arguments": { "id": 2 } }
```

---

### `get_settings`
Retrieve all application settings.

```json
{ "name": "get_settings", "arguments": {} }
```

---

### `update_setting`
Update a single setting value.

```json
{
  "name": "update_setting",
  "arguments": { "key": "app_name", "value": "My Homelab" }
}
```

---

### `search`
Search hosts by IP, name, or description.

```json
{ "name": "search", "arguments": { "query": "nginx" } }
```

Returns matching hosts with their subnet name.

---

### `get_audit_log`
Get recent audit log entries.

```json
{ "name": "get_audit_log", "arguments": { "limit": 20 } }
```

`limit` defaults to 20, maximum 100. Returns entries ordered by most recent first.

---

## Example Session (curl)

```sh
# Initialize
RESP=$(curl -si -X POST http://localhost:3001/mcp \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"curl","version":"1.0"}}}')

SESSION=$(echo "$RESP" | grep -i 'mcp-session-id' | awk '{print $2}' | tr -d '\r')

# List subnets
curl -s -X POST http://localhost:3001/mcp \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Mcp-Session-Id: $SESSION" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"list_subnets","arguments":{}}}'
```
