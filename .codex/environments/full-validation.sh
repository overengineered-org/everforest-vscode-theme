#!/usr/bin/env bash
set -euo pipefail

local_environment_directory="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
project_worktree_root="$(git rev-parse --show-toplevel)"
cd "$project_worktree_root"

bash "$local_environment_directory/run-with-node-24.sh" npm test
bash "$local_environment_directory/run-with-node-24.sh" npm run audit:production
bash "$local_environment_directory/run-with-node-24.sh" npm audit
bash "$local_environment_directory/secret-scan.sh"
