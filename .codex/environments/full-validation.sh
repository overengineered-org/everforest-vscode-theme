#!/usr/bin/env bash
set -euo pipefail

project_worktree_root="$(git rev-parse --show-toplevel)"
exec "${project_worktree_root}/scripts/verify-local.sh" "$@"
