#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ ! -f "${SCRIPT_DIR}/deploy/ubuntu24/aws_update.sh" ]]; then
  echo "ERROR: missing deploy script: ${SCRIPT_DIR}/deploy/ubuntu24/aws_update.sh"
  exit 1
fi

bash "${SCRIPT_DIR}/deploy/ubuntu24/aws_update.sh" "${1:-main}"
