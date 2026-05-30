# Architecture Overview

This document provides a high-level overview of the Subnet Manager's technical architecture.

## Components

-   **Frontend**: A pure vanilla JavaScript single-page application. It contains no frameworks, libraries, or build tools. It is served statically by the backend.
-   **Backend**: A Node.js application using the Express framework. It serves the frontend, provides the REST API, and handles all business logic.
-   **Database**: A single-file SQLite database, accessed via the `sqlite3` npm package.
-   **MCP Server**: A secondary Express server running in the same Node.js process on a separate port (`3001`). It exposes application logic as "tools" for programmatic use.

## Text Diagram

```
+-----------------------------------------------------------------+
| Docker Container                                                |
|                                                                 |
|  +---------------------------+      +-------------------------+ |
|  |       Node.js Process     |      |      File System        | |
|  |                           |      |                         | |
|  | +-----------------------+ |      |  +-------------------+  | |
|  | |      Backend          | |      |  | Frontend/         |  | |
|  | | (Express, port 3000)  | <------> | (index.html, etc) |  | |
|  | |                       | | serves |  +-------------------+  | |
|  | | - REST API (/api/v1)  | | static |                         | |
|  | | - SSE Events (/events)| |        |  +-------------------+  | |
|  | | - Auth Middleware     | |      |  | Backend/data/     |  | |
|  | +-------+---------------+ |      |  |  - subnet.db      |  | |
|  |         |                 |      |  +-------------------+  | |
|  |         | DB queries      |      |                         | |
|  |         v                 |      +-------------------------+ |
|  | +-----------------------+ |                                  |
|  | |      MCP Server       | |                                  |
|  | | (Express, port 3001)  | |                                  |
|  | +-----------------------+ |                                  |
|  |                           |                                  |
|  +---------------------------+                                  |
|                                                                 |
+-----------------------------------------------------------------+
       ^                 ^
       | HTTP/S          | HTTP/S
       | (port 3000)     | (port 3001)
       |                 |
+------|-----------------|------+
| User Browser / Claude.ai      |
+-------------------------------+
```
