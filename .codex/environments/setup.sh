#!/usr/bin/env bash
set -euo pipefail

project_worktree_root="$(git rev-parse --show-toplevel)"
cd "$project_worktree_root"

required_node_version="24.14.0"
active_node_version=""
if command -v node >/dev/null 2>&1; then
  active_node_version="$(node -p 'process.versions.node')"
fi

if [[ "$active_node_version" != "$required_node_version" ]]; then
  nvm_installation_directory="${NVM_DIR:-${HOME}/.nvm}"
  nvm_loader_path="$nvm_installation_directory/nvm.sh"

  if [[ ! -s "$nvm_loader_path" ]]; then
    echo "error: install Node $required_node_version or NVM at $nvm_loader_path" >&2
    exit 1
  fi

  # shellcheck source=/dev/null
  source "$nvm_loader_path"
  installed_node_version="$(nvm version "$required_node_version")"
  if [[ "$installed_node_version" != "v$required_node_version" ]]; then
    nvm install "$required_node_version" --no-progress
  fi

  node_24_binary_directory="$nvm_installation_directory/versions/node/v$required_node_version/bin"
  export PATH="$node_24_binary_directory:$PATH"
fi

if [[ "$(node -p 'process.versions.node')" != "$required_node_version" ]]; then
  echo "error: Node $required_node_version was not activated" >&2
  exit 1
fi

for required_workflow_tool in act cmp awk docker git gh gitleaks npm shasum; do
  if ! command -v "$required_workflow_tool" >/dev/null 2>&1; then
    echo "error: required tool missing: $required_workflow_tool" >&2
    exit 1
  fi
done

npm ci
npm run compile

printf 'Node %s | npm %s | Git %s | GitHub CLI %s | Gitleaks %s\n' \
  "$(node --version)" \
  "$(npm --version)" \
  "$(git --version | awk '{print $3}')" \
  "$(gh --version | awk 'NR == 1 {print $3}')" \
  "$(gitleaks version)"
