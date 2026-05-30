# MCP Server Guide

The Subnet Manager includes a built-in MCP (Managed Component Protocol) server to allow programmatic interaction from tools like Claude.ai.

## Connection

-   **Port**: `3001` (by default, configurable via `MCP_PORT`)
-   **Protocol**: HTTP or HTTPS, depending on the main server's `HTTPS_MODE`.

## Authentication

Authentication is done via a Bearer token in the `Authorization` header.

`Authorization: Bearer <your_mcp_token>`

If you do not provide an `MCP_TOKEN` in your environment variables, a secure one will be generated automatically and printed to the console on server startup.

## Tools

All tool calls are `POST` requests to `/tools/<tool_name>`. Arguments are passed in the JSON request body.

-   **`list_subnets()`**
    -   Description: Lists all configured subnets.
    -   Body: `{}`

-   **`list_hosts(subnet_id?)`**
    -   Description: Lists hosts. If `subnet_id` is provided, lists hosts for that subnet only.
    -   Body: `{"subnet_id": 1}`

-   **`add_subnet(name, network, cidr?)`**
    -   Description: Creates a new subnet.
    -   Body: `{"name": "New Subnet", "network": "10.10.100.0", "cidr": 24}`

-   **`get_audit_log(limit?)`**
    -   Description: Retrieves the most recent audit log entries.
    -   Body: `{"limit": 50}`

*(Note: Not all tools from the initial prompt have been implemented in this simplified MCP server.)*
