#!/bin/bash
set -euo pipefail

echo "▶ Running 'npm ci' to install dependencies..."
npm ci --production

IMAGE_NAME="subnet-manager"
DATE_TAG=$(date +%Y%m%d)

echo "▶ Building Docker image..."
docker build -t "${IMAGE_NAME}:latest" -t "${IMAGE_NAME}:${DATE_TAG}" .

if [ -n "${REGISTRY-}" ]; then
    echo "▶ Pushing to general registry: ${REGISTRY}"
    docker tag "${IMAGE_NAME}:latest" "${REGISTRY}/${IMAGE_NAME}:latest"
    docker push "${REGISTRY}/${IMAGE_NAME}:latest"
fi

if [ -n "${GITHUB_USERNAME-}" ]; then
    echo "▶ Pushing to GitHub Container Registry: ghcr.io/${GITHUB_USERNAME}"
    GHCR_IMAGE="ghcr.io/${GITHUB_USERNAME}/${IMAGE_NAME}:latest"
    docker tag "${IMAGE_NAME}:latest" "${GHCR_IMAGE}"
    docker push "${GHCR_IMAGE}"
fi

echo ""
echo "✓ Build complete!"
echo ""
echo "--- Usage ---"
echo "To run with the local build:"
echo "  docker compose -f docker-compose.build.yml up -d"
echo ""
echo "To run with the production compose (pulls from GHCR):"
echo "  # Make sure to replace YOUR_GITHUB_USERNAME in docker-compose.yml"
echo "  docker compose up -d"
echo ""
echo "To manually push to GHCR:"
echo "  # Make sure you are logged in: docker login ghcr.io"
echo "  export GITHUB_USERNAME='your-gh-username'"
echo "  ./build.sh"
echo "-------------"
