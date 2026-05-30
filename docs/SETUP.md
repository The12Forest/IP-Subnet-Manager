# Setup Guide

## Quick Start

### 1. Clone and configure

```sh
git clone https://github.com/YOUR_USERNAME/subnet-manager
cd subnet-manager
cp .env.example .env
```

Edit `.env` and set at minimum:

```
JWT_SECRET=<long random string>
```

Generate a secret: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`

### 2. Start with Docker

**Option A — Pull from GitHub Container Registry (recommended for production):**

```sh
# Edit docker-compose.yml and replace GITHUB_USERNAME with your GitHub username
docker compose up -d
```

**Option B — Build locally:**

```sh
docker compose -f docker-compose.build.yml up -d
```

### 3. Complete the setup wizard

Open http://localhost:3000 and follow the wizard to configure your first subnet and admin account.

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `JWT_SECRET` | *(required)* | Long random string for signing JWT tokens |
| `JWT_EXPIRY` | `7d` | JWT token lifetime (e.g. `1d`, `12h`, `7d`) |
| `MCP_TOKEN` | *(auto-generated)* | Bearer token for MCP server. Auto-generated if not set (check logs). Set to a fixed value for persistence. |
| `PORT` | `3000` | Web UI port |
| `MCP_PORT` | `3001` | MCP server port |
| `NODE_ENV` | `production` | Node environment |
| `LOG_LEVEL` | `info` | Log verbosity: `error`, `warn`, `info`, `debug` |
| `HTTPS_MODE` | `off` | TLS mode: `off`, `self-signed`, `custom` |
| `SSL_CERT_PATH` | `/app/data/certs/cert.pem` | Path to TLS certificate (when `HTTPS_MODE=custom`) |
| `SSL_KEY_PATH` | `/app/data/certs/key.pem` | Path to TLS private key (when `HTTPS_MODE=custom`) |
| `HOSTNAME` | `localhost` | Hostname for self-signed certificate CN |
| `CHECK_INTERVAL` | `60` | Seconds between background status checks |
| `CHECK_TIMEOUT` | `2000` | TCP/ping timeout in milliseconds |
| `CHECK_ENABLED` | `true` | Set to `false` to disable all background checks |
| `SETUP_WIZARD` | `auto` | Wizard behaviour: `auto`, `force`, `skip` |
| `MAX_USERS` | `0` | Max user accounts (0 = unlimited) |
| `SESSION_TIMEOUT` | `3600` | Idle session timeout in seconds |
| `DATA_DIR` | `./data` | Directory for SQLite DB and generated certs |

Settings configured via the web UI are stored in the `settings` table. **Environment variables always take priority** — a locked indicator is shown next to settings that cannot be changed via the UI.

---

## HTTPS Setup

### Option A: Reverse Proxy (Recommended for Production)

Keep `HTTPS_MODE=off` (default) and put Subnet Manager behind Nginx, Traefik, or Caddy. The reverse proxy handles TLS termination.

#### Nginx

```nginx
server {
    listen 443 ssl;
    server_name subnet.example.com;

    ssl_certificate     /etc/letsencrypt/live/subnet.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/subnet.example.com/privkey.pem;

    location / {
        proxy_pass         http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection keep-alive;
        proxy_set_header   Host $host;
        proxy_cache_bypass $http_upgrade;
        # Required for SSE (status updates)
        proxy_buffering    off;
        proxy_read_timeout 3600s;
    }
}
```

#### Traefik (docker-compose label)

```yaml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.subnet.rule=Host(`subnet.example.com`)"
  - "traefik.http.routers.subnet.tls.certresolver=letsencrypt"
  - "traefik.http.services.subnet.loadbalancer.server.port=3000"
```

#### Caddy

```
subnet.example.com {
    reverse_proxy localhost:3000 {
        flush_interval -1
    }
}
```

The `flush_interval -1` is important for SSE to work through Caddy.

---

### Option B: Self-Signed Certificate

Set in `.env`:

```
HTTPS_MODE=self-signed
HOSTNAME=my-server.local   # used as the certificate CN
```

A certificate is generated on first startup and saved to `data/certs/cert.pem` and `data/certs/key.pem`. It persists between container restarts via the volume mount.

**Note:** Browsers will show a security warning for self-signed certificates. You'll need to accept the exception.

---

### Option C: Custom Certificate

Set in `.env`:

```
HTTPS_MODE=custom
SSL_CERT_PATH=/app/data/certs/server.crt
SSL_KEY_PATH=/app/data/certs/server.key
```

Place your certificate files in the `data/certs/` directory (which is volume-mounted). The server exits with an error if the files are missing at startup.

Works with Let's Encrypt (Certbot), Step-CA, or any other CA.

---

## ICMP Ping in Docker

The status checker uses raw sockets for ICMP ping. This requires extra Linux capabilities:

```yaml
# Already included in docker-compose.yml
cap_add:
  - NET_ADMIN
  - NET_RAW
```

If you're running on a system where this isn't allowed, hosts without a `check_port` will show `unknown` status (not `offline`). To avoid false negatives, set a `check_port` on hosts that support TCP connections.

---

## Publishing to GitHub Container Registry

The included GitHub Actions workflow (`.github/workflows/docker-publish.yml`) automatically builds and pushes the Docker image to GHCR on every push to `main` or version tag (`v*`).

### Setup

1. Fork the repository
2. The workflow uses `secrets.GITHUB_TOKEN` (automatically available — no setup needed)
3. Push to `main` — the image will be published at `ghcr.io/YOUR_USERNAME/subnet-manager:latest`
4. Make the package public: GitHub → Packages → subnet-manager → Package settings → Change visibility → Public

### Pulling the published image

After publishing, update `docker-compose.yml`:

```yaml
image: ghcr.io/YOUR_USERNAME/subnet-manager:latest
```

Then run:

```sh
docker compose pull
docker compose up -d
```

### Manual build and push

Use `build.sh`:

```sh
GITHUB_USERNAME=your-username ./build.sh
```

The script checks for existing GHCR credentials, fetches the latest published version for reference, prompts for the new version, builds, tags, and pushes.
