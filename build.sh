#!/bin/bash
git pull


set -euo pipefail

REGISTRY="ghcr.io"

# ── Check if already logged in to ghcr.io ────────────────────────────────────
DOCKER_CONFIG="${DOCKER_CONFIG:-${HOME}/.docker}"
ALREADY_LOGGED_IN=false
GITHUB_USER=""

if [ -f "${DOCKER_CONFIG}/config.json" ]; then
  # Check for ghcr.io entry in auths (works without jq)
  if grep -q '"ghcr.io"' "${DOCKER_CONFIG}/config.json" 2>/dev/null; then
    # Try to extract username from the base64 auth field (format: user:token)
    AUTH_B64=$(grep -A2 '"ghcr.io"' "${DOCKER_CONFIG}/config.json" | grep '"auth"' | sed 's/.*"auth"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/' 2>/dev/null || true)
    if [ -n "${AUTH_B64}" ]; then
      GITHUB_USER=$(echo "${AUTH_B64}" | base64 -d 2>/dev/null | cut -d: -f1 || true)
    fi
    # If username found, we're logged in
    if [ -n "${GITHUB_USER}" ]; then
      ALREADY_LOGGED_IN=true
      echo "✓ Already logged in to ${REGISTRY} as ${GITHUB_USER}"
    fi
  fi
  
  # Fallback: check credential helpers (credsStore / credHelpers)
  if [ "${ALREADY_LOGGED_IN}" = false ]; then
    CREDS_STORE=$(grep '"credsStore"' "${DOCKER_CONFIG}/config.json" 2>/dev/null | sed 's/.*"credsStore"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/' || true)
    if [ -z "${CREDS_STORE}" ]; then
      # Check credHelpers for ghcr.io specifically
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

# ── Prompt for inputs ─────────────────────────────────────────────────────────
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

  # Get auth token — try multiple sources
  if [ -n "${CR_PAT:-}" ]; then
    # 1. Freshly provided PAT (new login flow)
    token="${CR_PAT}"
  elif [ -n "${AUTH_B64:-}" ]; then
    # 2. Base64 auth from Docker config.json
    token=$(echo "${AUTH_B64}" | base64 -d 2>/dev/null | cut -d: -f2 || true)
  elif [ -n "${CREDS_STORE:-}" ] && command -v "docker-credential-${CREDS_STORE}" &>/dev/null; then
    # 3. Credential helper (e.g. docker-credential-pass, secretservice, etc.)
    token=$(echo "ghcr.io" | "docker-credential-${CREDS_STORE}" get 2>/dev/null \
      | grep -o '"Secret"[[:space:]]*:[[:space:]]*"[^"]*"' \
      | sed 's/.*"Secret"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/' || true)
  fi

  if [ -z "${token}" ]; then
    echo ""
    return 0
  fi

  # Exchange for a registry bearer token
  local bearer
  bearer=$(curl -sf -u "${GITHUB_USER}:${token}" \
    "https://ghcr.io/token?scope=repository:${image_path}:pull" 2>/dev/null \
    | grep -o '"token":"[^"]*"' | sed 's/"token":"//;s/"//' || true)

  if [ -z "${bearer}" ]; then
    echo ""
    return 0
  fi

  # List tags from the OCI registry
  local tags
  tags=$(curl -sf -H "Authorization: Bearer ${bearer}" \
    "https://ghcr.io/v2/${image_path}/tags/list" 2>/dev/null || true)

  # Extract version tags (any dot-separated numbers, skip "latest"), sort, return newest
  # The "|| true" prevents grep exit code 1 from killing the script under pipefail
  local latest
  latest=$(echo "${tags}" \
    | grep -oE '"[0-9]+(\.[0-9]+)+"' \
    | tr -d '"' \
    | sort -t. -k1,1n -k2,2n -k3,3n -k4,4n \
    | tail -1 || true)

  echo "${latest}"
  return 0
}

LATEST_VERSION=$(get_latest_version "${GITHUB_USER_LOWER}/hostlymail-backend" || true)

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

# ── Login to GitHub Container Registry (only if needed) ──────────────────────
if [ "${ALREADY_LOGGED_IN}" = false ]; then
  echo "→ Logging in to ${REGISTRY} as ${GITHUB_USER}..."
  if ! echo "${CR_PAT}" | docker login "${REGISTRY}" -u "${GITHUB_USER}" --password-stdin; then
    echo ""
    echo "ERROR: Login to ${REGISTRY} failed. Common causes:"
    echo ""
    echo "  1. Wrong token type — use a classic PAT (not fine-grained):"
    echo "     https://github.com/settings/tokens/new?scopes=write:packages,read:packages,delete:packages"
    echo ""
    echo "  2. Missing scopes — the token must have:"
    echo "     ✓ write:packages"
    echo "     ✓ read:packages"
    echo "     ✓ repo  (required for private repos)"
    echo ""
    echo "  3. Token expired or copied incorrectly — regenerate it."
    exit 1
  fi
fi

# ── Define Images ─────────────────────────────────────────────────────────────
BACKEND_IMAGE="${REGISTRY}/${GITHUB_USER_LOWER}/hostlymail-backend"
FRONTEND_IMAGE="${REGISTRY}/${GITHUB_USER_LOWER}/hostlymail-frontend"

# ── Build Backend ─────────────────────────────────────────────────────────────
echo "→ Building ${BACKEND_IMAGE}:${VERSION} (also tagging as latest)..."
docker build \
  --file "./backend/Dockerfile" \
  --tag "${BACKEND_IMAGE}:${VERSION}" \
  --tag "${BACKEND_IMAGE}:latest" \
  ./backend

# ── Build Frontend ────────────────────────────────────────────────────────────
echo "→ Building ${FRONTEND_IMAGE}:${VERSION} (also tagging as latest)..."
docker build \
  --file "./frontend/Dockerfile" \
  --tag "${FRONTEND_IMAGE}:${VERSION}" \
  --tag "${FRONTEND_IMAGE}:latest" \
  ./frontend

# ── Push Backend ──────────────────────────────────────────────────────────────
echo "→ Pushing ${BACKEND_IMAGE}:${VERSION}..."
docker push "${BACKEND_IMAGE}:${VERSION}"

echo "→ Pushing ${BACKEND_IMAGE}:latest..."
docker push "${BACKEND_IMAGE}:latest"

# ── Push Frontend ─────────────────────────────────────────────────────────────
echo "→ Pushing ${FRONTEND_IMAGE}:${VERSION}..."
docker push "${FRONTEND_IMAGE}:${VERSION}"

echo "→ Pushing ${FRONTEND_IMAGE}:latest..."
docker push "${FRONTEND_IMAGE}:latest"

echo ""
echo "✓ Done! Published:"
echo "    ${BACKEND_IMAGE}:${VERSION}"
echo "    ${FRONTEND_IMAGE}:${VERSION}"