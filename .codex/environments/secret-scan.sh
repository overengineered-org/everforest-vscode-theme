#!/usr/bin/env bash
set -euo pipefail

local_environment_directory="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
project_worktree_root="$(git rev-parse --show-toplevel)"
cd "$project_worktree_root"

readonly maximum_untracked_file_bytes=$((1024 * 1024))
readonly maximum_untracked_stdin_bytes=$((5 * 1024 * 1024))

gitleaks git . --no-banner --redact --log-level error
git diff --no-ext-diff | gitleaks stdin --no-banner --redact --log-level error
git diff --cached --no-ext-diff | gitleaks stdin --no-banner --redact --log-level error

untracked_project_file_paths=()
while IFS= read -r -d '' untracked_project_file_path; do
  if [[ ! -L "$untracked_project_file_path" && -f "$untracked_project_file_path" ]]; then
    untracked_project_file_paths+=("$untracked_project_file_path")
  fi
done < <(git ls-files --others --exclude-standard -z)

if [[ "${#untracked_project_file_paths[@]}" -gt 0 ]]; then
  temporary_untracked_scan_input="$(mktemp)"
  trap 'rm -f -- "$temporary_untracked_scan_input"' EXIT
  untracked_stdin_bytes=0

  for untracked_project_file_path in "${untracked_project_file_paths[@]}"; do
    if [[ -L "$untracked_project_file_path" || ! -f "$untracked_project_file_path" ]]; then
      continue
    fi

    untracked_file_byte_count="$(wc -c < "$untracked_project_file_path")"
    if ((untracked_file_byte_count > maximum_untracked_file_bytes)); then
      printf 'secret-scan: refusing untracked file %s: %d bytes exceeds the per-file limit of %d bytes\n' \
        "$untracked_project_file_path" \
        "$untracked_file_byte_count" \
        "$maximum_untracked_file_bytes" >&2
      exit 1
    fi

    untracked_file_header_bytes="$(printf '\nFILE:%s\n' "$untracked_project_file_path" | wc -c)"
    untracked_file_scan_bytes=$((untracked_file_header_bytes + untracked_file_byte_count))
    if ((untracked_stdin_bytes + untracked_file_scan_bytes > maximum_untracked_stdin_bytes)); then
      printf 'secret-scan: refusing untracked scan: aggregate input would exceed the limit of %d bytes at %s (current %d bytes, next %d bytes)\n' \
        "$maximum_untracked_stdin_bytes" \
        "$untracked_project_file_path" \
        "$untracked_stdin_bytes" \
        "$untracked_file_scan_bytes" >&2
      exit 1
    fi

    printf '\nFILE:%s\n' "$untracked_project_file_path" >> "$temporary_untracked_scan_input"
    cat -- "$untracked_project_file_path" >> "$temporary_untracked_scan_input"
    if [[ -L "$untracked_project_file_path" || ! -f "$untracked_project_file_path" ]]; then
      printf 'secret-scan: untracked file changed while scanning: %s\n' "$untracked_project_file_path" >&2
      exit 1
    fi
    untracked_post_scan_file_byte_count="$(wc -c < "$untracked_project_file_path")"
    if ((untracked_post_scan_file_byte_count != untracked_file_byte_count)); then
      printf 'secret-scan: untracked file changed while scanning: %s\n' "$untracked_project_file_path" >&2
      exit 1
    fi
    untracked_stdin_bytes=$((untracked_stdin_bytes + untracked_file_scan_bytes))
  done

  if [[ "$(wc -c < "$temporary_untracked_scan_input")" -ne "$untracked_stdin_bytes" ]]; then
    printf 'secret-scan: staged untracked scan input size changed unexpectedly\n' >&2
    exit 1
  fi
  gitleaks stdin --no-banner --redact --log-level error < "$temporary_untracked_scan_input"
fi

gitleaks dir "$local_environment_directory" \
  --no-banner \
  --redact \
  --log-level error \
  --max-target-megabytes 5
