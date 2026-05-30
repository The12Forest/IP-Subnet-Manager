#!/usr/bin/env bash
set -euo pipefail

git pull

REGISTRY="ghcr.io"

# ── Check if already logged in to ghcr.io ────────────────────────────────────
DOCKER_CONFIG="${DOCKER_CONFIG:-${HOME}/.docker}"
ALREADY_LOGGED_IN=false
GITHUB_USER=""
AUTH_B64=""
CREDS_STORE=""

if [ -f "${DOCKER_CONFIG}/config.json" ]; then
  if grep -q '"ghcr.io"' "${DOCKER_CONFIG}/config.json" 2>/dev/null; then
    AUTH_B64=$(grep -A2 '"ghcr.io"' "${DOCKER_CONFIG}/config.json" | grep '"auth"' | sed 's/.*"auth"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/' 2>/dev/null || true)
    if [ -n "${AUTH_B64}" ]; then
      GITHUB_USER=$(echo "${AUTH_B64}" | base64 -d 2>/dev/null | cut -d: -f1 || true)
    fi
    if [ -n "${GITHUB_USER}" ]; then
      ALREADY_LOGGED_IN=true
      echo "✓ Already logged in to ${REGISTRY} as ${GITHUB_USER}"
    fi
  fi

  if [ "${ALREADY_LOGGED_IN}" = false ]; then
    CREDS_STORE=$(grep '"credsStore"' "${DOCKER_CONFIG}/config.json" 2>/dev/null | sed 's/.*"credsStore"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/' || true)
    if [ -z "${CREDS_STORE}" ]; then
      CREDS_STORE=$(sed -n '/"credHelpers"/,/}/p' "${DOCKER_CONFIG}/config.json" 2>/dev/null | grep '"ghcr.io"' | sed 's/.*"ghcr.io"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/' || true)
    fi
    if [ -n "${CREDS_STORE}" ] && command -v "docker-credential-${CREDS_STORE}" &>/dev/null; then
      STORED_USER=$(echo "ghcr.io" | "docker-credential-${CREDS_STORE}" get 2>/dev/null | grep -o '"Username"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"Username"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/' || true)
      if [ -n "${STORED_USER}" ]; then
        GITHUB_USER="${STORED_USER}"
        ALREADY_LOGGED_IN=true
        echo "✓ Already logged in to ${REGISTRY} as ${GITHUB_USER}"
      fi
    fi
  fi
fi

# ── Prompt for credentials if not logged in ───────────────────────────────────
if [ "${ALREADY_LOGGED_IN}" = false ]; then
  read -rp "GitHub username: " GITHUB_USER
  read -rsp "GitHub Personal Access Token (write:packages scope): " CR_PAT
  echo ""
  if [ -z "${GITHUB_USER}" ] || [ -z "${CR_PAT}" ]; then
    echo "ERROR: username and token are required."
    exit 1
  fi
fi

GITHUB_USER_LOWER=$(echo "${GITHUB_USER}" | tr '[:upper:]' '[:lower:]')

# ── Fetch latest published version from GHCR ─────────────────────────────────
get_latest_version() {
  local image_path="$1"
  local token=""

  if [ -n "${CR_PAT:-}" ]; then
    token="${CR_PAT}"
  elif [ -n "${AUTH_B64:-}" ]; then
    token=$(echo "${AUTH_B64}" | base64 -d 2>/dev/null | cut -d: -f2 || true)
  elif [ -n "${CREDS_STORE:-}" ] && command -v "docker-credential-${CREDS_STORE}" &>/dev/null; then
    token=$(echo "ghcr.io" | "docker-credential-${CREDS_STORE}" get 2>/dev/null \
      | grep -o '"Secret"[[:space:]]*:[[:space:]]*"[^"]*"' \
      | sed 's/.*"Secret"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/' || true)
  fi

  if [ -z "${token}" ]; then echo ""; return 0; fi

  local bearer
  bearer=$(curl -sf -u "${GITHUB_USER}:${token}" \
    "https://ghcr.io/token?scope=repository:${image_path}:pull" 2>/dev/null \
    | grep -o '"token":"[^"]*"' | sed 's/"token":"//;s/"//' || true)

  if [ -z "${bearer}" ]; then echo ""; return 0; fi

  local tags
  tags=$(curl -sf -H "Authorization: Bearer ${bearer}" \
    "https://ghcr.io/v2/${image_path}/tags/list" 2>/dev/null || true)

  local latest
  latest=$(echo "${tags}" \
    | grep -oE '"[0-9]+(\.[0-9]+)+"' \
    | tr -d '"' \
    | sort -t. -k1,1n -k2,2n -k3,3n -k4,4n \
    | tail -1 || true)

  echo "${latest}"
  return 0
}

LATEST_VERSION=$(get_latest_version "${GITHUB_USER_LOWER}/subnet-manager" || true)

if [ -n "${LATEST_VERSION}" ]; then
  echo ""
  echo "  Latest published version: ${LATEST_VERSION}"
  read -rp "  New image version: " VERSION
else
  read -rp "Image version (e.g. 1.0.0): " VERSION
fi

if [ -z "${VERSION}" ]; then
  echo "ERROR: version is required."
  exit 1
fi

# ── Login if needed ───────────────────────────────────────────────────────────
if [ "${ALREADY_LOGGED_IN}" = false ]; then
  echo "→ Logging in to ${REGISTRY} as ${GITHUB_USER}…"
  if ! echo "${CR_PAT}" | docker login "${REGISTRY}" -u "${GITHUB_USER}" --password-stdin; then
    echo ""
    echo "ERROR: Login failed. Common causes:"
    echo "  1. Use a classic PAT (not fine-grained):"
    echo "     https://github.com/settings/tokens/new?scopes=write:packages,read:packages,delete:packages"
    echo "  2. Required scopes: write:packages, read:packages, repo (for private repos)"
    echo "  3. Token expired or copied incorrectly — regenerate it."
    exit 1
  fi
fi

# ── Install dependencies ──────────────────────────────────────────────────────
echo "→ Running npm ci…"
npm ci --omit=dev

# ── Build image ───────────────────────────────────────────────────────────────
IMAGE_LOCAL="subnet-manager"
IMAGE_GHCR="${REGISTRY}/${GITHUB_USER_LOWER}/subnet-manager"

echo "→ Building ${IMAGE_GHCR}:${VERSION}…"
docker build \
  --tag "${IMAGE_LOCAL}:${VERSION}" \
  --tag "${IMAGE_LOCAL}:latest" \
  --tag "${IMAGE_GHCR}:${VERSION}" \
  --tag "${IMAGE_GHCR}:latest" \
  .

# ── Push to GHCR ─────────────────────────────────────────────────────────────
echo "→ Pushing ${IMAGE_GHCR}:${VERSION}…"
docker push "${IMAGE_GHCR}:${VERSION}"

echo "→ Pushing ${IMAGE_GHCR}:latest…"
docker push "${IMAGE_GHCR}:latest"

echo ""
echo "✓ Done! Published:"
echo "    ${IMAGE_GHCR}:${VERSION}"
echo "    ${IMAGE_GHCR}:latest"
echo ""
echo "To run with the local build:"
echo "  docker compose -f docker-compose.build.yml up -d"
echo ""
echo "To run with the published image:"
echo "  # Edit docker-compose.yml and replace GITHUB_USERNAME with: ${GITHUB_USER_LOWER}"
echo "  docker compose up -d"
