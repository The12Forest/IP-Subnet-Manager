# Setup Guide

This guide provides detailed instructions for setting up and running the Subnet Manager.

## Docker Deployment (Recommended)

The easiest way to run the application is with Docker. You have two options:

### Option 1: Pull from GitHub Container Registry (Production)

This method uses the pre-built image from `ghcr.io`.

1.  Copy `docker-compose.yml` and `.env.example` to a directory on your server.
2.  Rename `.env.example` to `.env`.
3.  **Crucially, set `JWT_SECRET` in the `.env` file to a long, random string.**
4.  In `docker-compose.yml`, replace `YOUR_GITHUB_USERNAME` with the appropriate GitHub username where the image is hosted.
5.  Run `docker compose up -d`.
6.  The application will be available at `http://localhost:3000`.

### Option 2: Build from Source (Development/Custom)

This method builds the Docker image locally from the source code.

1.  Clone the repository.
2.  Ensure you have Node.js and Docker installed.
3.  Copy `.env.example` to `.env` and set the `JWT_SECRET`.
4.  Run `docker compose -f docker-compose.build.yml up -d`.
5.  The application will be available at `http://localhost:3000`.

## HTTPS Setup

The application can be run in one of three HTTPS modes, configured via the `HTTPS_MODE` environment variable.

-   `off` (default): Runs in plain HTTP. Recommended if you are running the application behind a reverse proxy (like Nginx, Traefik, or Caddy) that handles SSL termination.
-   `self-signed`: On first startup, the server will generate a self-signed SSL certificate and save it to the `Certs/` volume. This is useful for quick local testing over HTTPS.
-   `custom`: The server will use a custom SSL certificate that you provide. You must mount the certificate files and set the `SSL_CERT_PATH` and `SSL_KEY_PATH` environment variables to their paths inside the container (e.g., `/app/Certs/mycert.pem`).

## Environment Variables

| Variable          | Description                                           | Default                             |
| ----------------- | ----------------------------------------------------- | ----------------------------------- |
| `PORT`            | Web UI port                                           | `3000`                              |
| `MCP_PORT`        | MCP server port                                       | `3001`                              |
| `LOG_LEVEL`       | Logging verbosity                                     | `info`                              |
| `JWT_SECRET`      | **Required.** Long random string for signing tokens.    | `(none)`                            |
| `JWT_EXPIRY`      | JWT token lifetime                                    | `7d`                                |
| `MCP_TOKEN`       | Optional. If not set, a secure token is auto-generated. | `(auto-generated)`                  |
| `HTTPS_MODE`      | `off`, `self-signed`, or `custom`                     | `off`                               |
| `SSL_CERT_PATH`   | Path to custom SSL certificate file                   | `/app/Certs/server.cert`            |
| `SSL_KEY_PATH`    | Path to custom SSL key file                           | `/app/Certs/server.key`             |
| `HOSTNAME`        | Common Name for self-signed cert                      | `localhost`                         |
| `CHECK_INTERVAL`  | Seconds between automatic host status checks          | `60`                                |
| `CHECK_TIMEOUT`   | Timeout in ms for a single host check                 | `2000`                              |
| `CHECK_ENABLED`   | Set to `false` to disable all background checks       | `true`                              |
| `SETUP_WIZARD`    | `auto`, `force`, or `skip`                            | `auto`                              |
| `MAX_USERS`       | Max user accounts allowed (`0` for unlimited)         | `0`                                 |
| `SESSION_TIMEOUT` | Idle session timeout in seconds                       | `3600`                              |
