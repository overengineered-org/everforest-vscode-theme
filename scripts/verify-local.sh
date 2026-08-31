#!/usr/bin/env bash
set -euo pipefail

readonly project_worktree_root="$(git rev-parse --show-toplevel)"
cd "$project_worktree_root"
readonly local_validation_context="Local validation"
readonly report_status_argument="--report-status"
# One lock per canonical Git common directory serializes linked worktrees and shared ACT/CodeQL state.
readonly validation_lock_parent_directory="${TMPDIR:-/tmp}/everforest-local-validation"
readonly git_common_directory="$(git rev-parse --git-common-dir)"
readonly canonical_git_common_directory="$(cd -- "$git_common_directory" && pwd -P)"
readonly common_repository_lock_fingerprint="$(printf '%s' "$canonical_git_common_directory" | shasum -a 256 | awk '{print $1}')"
readonly validation_lock_directory="${validation_lock_parent_directory}/${common_repository_lock_fingerprint}.lock"
readonly validation_lock_metadata_file="${validation_lock_directory}/owner"
readonly validation_lock_reservation_file_prefix="${validation_lock_parent_directory}/.owner.reserve.${common_repository_lock_fingerprint}."
readonly validation_lock_reservation_name_prefix=".owner.reserve.${common_repository_lock_fingerprint}."
readonly validation_lock_metadata_temp_name_prefix=".owner.tmp."
readonly validation_lock_initialization_grace_seconds=5
readonly validated_vsix_path="${project_worktree_root}/dist/everforest-complete.vsix"
readonly validated_vsix_checksum_path="${validated_vsix_path}.sha256"
report_status=false
validation_lock_owned=false
validation_lock_directory_open=false
validation_lock_original_working_directory=""
validation_lock_owner_pid=""
validation_lock_owner_common_directory=""
validation_lock_owner_worktree=""
validation_lock_metadata_state="unknown"
validation_lock_initialization_reservation_file=""

if [[ "$#" -gt 1 ]]; then
  echo "Usage: ./scripts/verify-local.sh [${report_status_argument}]" >&2
  exit 64
fi
if [[ "$#" -eq 1 ]]; then
  if [[ "$1" != "$report_status_argument" ]]; then
    echo "Unknown argument: $1" >&2
    exit 64
  fi
  report_status=true
fi

readonly pinned_act_runner_image="$(sed -n 's/^--platform=ubuntu-latest=//p' .actrc)"
if [[ -z "$pinned_act_runner_image" ]]; then
  echo "The pinned ACT runner image is missing from .actrc." >&2
  exit 1
fi

for required_command in act cmp docker git gitleaks node npm shasum; do
  if ! command -v "$required_command" >/dev/null 2>&1; then
    echo "Required command not found: $required_command" >&2
    exit 1
  fi
done

release_validation_lock() {
  if [[ "$validation_lock_owned" != true ]]; then
    return
  fi
  if ! enter_validation_lock_directory_safely; then
    echo "Validation lock path is symlinked or changed; refusing cleanup: $validation_lock_directory" >&2
    validation_lock_owned=false
    return
  fi
  rm -f -- \
    ./owner \
    "./${validation_lock_metadata_temp_name_prefix}$$" \
    "./${validation_lock_reservation_name_prefix}$$"
  leave_validation_lock_directory_safely || true
  rm -f -- "$validation_lock_initialization_reservation_file"
  rmdir -- "$validation_lock_directory" 2>/dev/null || true
  validation_lock_owned=false
}

enter_validation_lock_directory_safely() {
  local lock_parent_directory="${validation_lock_directory%/*}"
  local lock_leaf_name="${validation_lock_directory##*/}"
  local canonical_lock_parent_directory=""
  local canonical_lock_directory=""
  local current_lock_directory=""

  validation_lock_directory_open=false
  validation_lock_original_working_directory="$PWD"
  if [[ -L "$validation_lock_directory" ]] || [[ ! -d "$validation_lock_directory" ]]; then
    return 75
  fi
  canonical_lock_parent_directory="$(cd -- "$lock_parent_directory" && pwd -P)" || return 75
  canonical_lock_directory="${canonical_lock_parent_directory}/${lock_leaf_name}"
  if ! cd -- "$validation_lock_directory"; then
    return 75
  fi
  current_lock_directory="$(pwd -P)"
  if [[ "$current_lock_directory" != "$canonical_lock_directory" ]]; then
    cd -- "$validation_lock_original_working_directory" || true
    return 75
  fi
  validation_lock_directory_open=true
}

leave_validation_lock_directory_safely() {
  if [[ "$validation_lock_directory_open" != true ]]; then
    return
  fi
  validation_lock_directory_open=false
  cd -- "$validation_lock_original_working_directory"
}

read_validation_lock_metadata_safely() {
  validation_lock_owner_pid=""
  validation_lock_owner_common_directory=""
  validation_lock_owner_worktree=""
  validation_lock_metadata_state="unknown"
  if ! enter_validation_lock_directory_safely; then
    return 75
  fi
  if [[ -L ./owner ]]; then
    leave_validation_lock_directory_safely || true
    return 75
  fi
  if [[ ! -f ./owner ]]; then
    validation_lock_metadata_state="initializing"
    leave_validation_lock_directory_safely
    return 76
  fi
  local lock_owner_metadata_record=""
  local lock_owner_metadata_field_count=""
  lock_owner_metadata_record="$(< ./owner)"
  if [[ "$lock_owner_metadata_record" == *$'\n'* ]]; then
    validation_lock_metadata_state="initializing"
    leave_validation_lock_directory_safely
    return 76
  fi
  IFS=$'\t' read -r validation_lock_owner_pid validation_lock_owner_common_directory validation_lock_owner_worktree <<< "$lock_owner_metadata_record"
  lock_owner_metadata_field_count="$(awk -F '\t' '{ print NF; exit }' ./owner)"
  if [[ "$lock_owner_metadata_field_count" != 3 ]] || \
    [[ -z "$validation_lock_owner_pid" || -z "$validation_lock_owner_common_directory" || -z "$validation_lock_owner_worktree" ]]; then
    validation_lock_metadata_state="initializing"
    leave_validation_lock_directory_safely
    return 76
  fi
  if ! cmp -s ./owner <(
    printf '%s\t%s\t%s\n' \
      "$validation_lock_owner_pid" \
      "$validation_lock_owner_common_directory" \
      "$validation_lock_owner_worktree"
  ); then
    validation_lock_metadata_state="initializing"
    leave_validation_lock_directory_safely
    return 76
  fi
  for lock_metadata_file in ./.owner.tmp.* ./.owner.reserve.*; do
    if [[ -L "$lock_metadata_file" ]]; then
      leave_validation_lock_directory_safely || true
      return 75
    fi
  done
  validation_lock_metadata_state="ready"
  leave_validation_lock_directory_safely
}

validation_lock_directory_identity_safely() {
  local lock_parent_directory="${validation_lock_directory%/*}"
  local lock_leaf_name="${validation_lock_directory##*/}"
  local canonical_lock_parent_directory=""
  local canonical_lock_directory=""
  local current_lock_directory=""

  if [[ -L "$validation_lock_directory" ]] || [[ ! -d "$validation_lock_directory" ]]; then
    return 75
  fi
  canonical_lock_parent_directory="$(cd -- "$lock_parent_directory" && pwd -P)" || return 75
  canonical_lock_directory="${canonical_lock_parent_directory}/${lock_leaf_name}"
  if ! cd -- "$validation_lock_directory"; then
    return 75
  fi
  current_lock_directory="$(pwd -P)"
  if [[ "$current_lock_directory" != "$canonical_lock_directory" ]]; then
    return 75
  fi
  if stat -c '%d:%i:%Y' . 2>/dev/null; then
    return
  fi
  stat -f '%d:%i:%m' .
}

validation_lock_initialization_owner_is_alive() {
  local reservation_file_path=""
  local reservation_file_name=""
  local reservation_process_id=""

  if ! enter_validation_lock_directory_safely; then
    return 75
  fi
  for reservation_file_path in ./.owner.tmp.* ./.owner.reserve.*; do
    if [[ ! -e "$reservation_file_path" && ! -L "$reservation_file_path" ]]; then
      continue
    fi
    if [[ -L "$reservation_file_path" ]]; then
      leave_validation_lock_directory_safely || true
      return 75
    fi
    reservation_file_name="${reservation_file_path##*/}"
    reservation_process_id="${reservation_file_name##*.}"
    if [[ ! "$reservation_process_id" =~ ^[1-9][0-9]*$ ]]; then
      leave_validation_lock_directory_safely || true
      return 75
    fi
    if kill -0 "$reservation_process_id" 2>/dev/null; then
      leave_validation_lock_directory_safely || true
      return 0
    fi
  done
  leave_validation_lock_directory_safely

  for reservation_file_path in "${validation_lock_reservation_file_prefix}"*; do
    if [[ ! -e "$reservation_file_path" && ! -L "$reservation_file_path" ]]; then
      continue
    fi
    if [[ -L "$reservation_file_path" ]]; then
      return 75
    fi
    reservation_file_name="${reservation_file_path##*/}"
    reservation_process_id="${reservation_file_name##*.}"
    if [[ ! "$reservation_process_id" =~ ^[1-9][0-9]*$ ]]; then
      return 75
    fi
    if kill -0 "$reservation_process_id" 2>/dev/null; then
      return 0
    fi
  done
  return 1
}

reclaim_validation_lock_safely() {
  local temporary_metadata_file_path=""
  local temporary_metadata_file_name=""
  local temporary_metadata_process_id=""
  local reservation_file_path=""
  local reservation_file_name=""
  local reservation_process_id=""

  if [[ "${validation_lock_metadata_state}" == "ready" ]]; then
    :
  elif [[ "${validation_lock_metadata_state}" == "initializing" ]]; then
    :
  else
    return 75
  fi
  local initialization_owner_check_status=0
  if validation_lock_initialization_owner_is_alive; then
    initialization_owner_check_status=0
  else
    initialization_owner_check_status="$?"
  fi
  if [[ "$initialization_owner_check_status" == 75 ]]; then
    return 75
  fi
  if [[ "$initialization_owner_check_status" == 0 ]]; then
    return 75
  fi
  if ! enter_validation_lock_directory_safely; then
    return 75
  fi
  if [[ -L ./owner ]]; then
    leave_validation_lock_directory_safely || true
    return 75
  fi
  for temporary_metadata_file_path in ./.owner.tmp.* ./.owner.reserve.*; do
    if [[ ! -e "$temporary_metadata_file_path" && ! -L "$temporary_metadata_file_path" ]]; then
      continue
    fi
    if [[ -L "$temporary_metadata_file_path" ]]; then
      leave_validation_lock_directory_safely || true
      return 75
    fi
    temporary_metadata_file_name="${temporary_metadata_file_path##*/}"
    temporary_metadata_process_id="${temporary_metadata_file_name##*.}"
    if [[ ! "$temporary_metadata_process_id" =~ ^[1-9][0-9]*$ ]]; then
      leave_validation_lock_directory_safely || true
      return 75
    fi
    if kill -0 "$temporary_metadata_process_id" 2>/dev/null; then
      leave_validation_lock_directory_safely || true
      return 75
    fi
    rm -f -- "$temporary_metadata_file_path"
  done
  if [[ "${validation_lock_metadata_state}" == "initializing" && -e ./owner ]]; then
    leave_validation_lock_directory_safely || true
    return 75
  fi
  if [[ "${validation_lock_metadata_state}" == "ready" ]] && \
    ! cmp -s ./owner <(
      printf '%s\t%s\t%s\n' \
        "$validation_lock_owner_pid" \
        "$validation_lock_owner_common_directory" \
        "$validation_lock_owner_worktree"
    ); then
    leave_validation_lock_directory_safely || true
    return 75
  fi
  rm -f -- ./owner
  leave_validation_lock_directory_safely

  for reservation_file_path in "${validation_lock_reservation_file_prefix}"*; do
    if [[ ! -e "$reservation_file_path" && ! -L "$reservation_file_path" ]]; then
      continue
    fi
    if [[ -L "$reservation_file_path" ]]; then
      return 75
    fi
    reservation_file_name="${reservation_file_path##*/}"
    reservation_process_id="${reservation_file_name##*.}"
    if [[ ! "$reservation_process_id" =~ ^[1-9][0-9]*$ ]]; then
      return 75
    fi
    if kill -0 "$reservation_process_id" 2>/dev/null; then
      return 75
    fi
    rm -f -- "$reservation_file_path"
  done
  if ! rmdir -- "$validation_lock_directory" 2>/dev/null; then
    return 75
  fi
}

wait_for_validation_lock_initialization() {
  local initial_lock_directory_identity=""
  local current_lock_directory_identity=""
  local elapsed_wait_seconds=0
  local initialization_owner_check_status=0

  initial_lock_directory_identity="$(validation_lock_directory_identity_safely)" || return 75
  while (( elapsed_wait_seconds < validation_lock_initialization_grace_seconds )); do
    sleep 1
    ((elapsed_wait_seconds += 1))
    if read_validation_lock_metadata_safely; then
      return 0
    fi
    if [[ "$validation_lock_metadata_state" != "initializing" ]]; then
      return 75
    fi
  done
  current_lock_directory_identity="$(validation_lock_directory_identity_safely)" || return 75
  if [[ "$current_lock_directory_identity" != "$initial_lock_directory_identity" ]]; then
    return 75
  fi
  if validation_lock_initialization_owner_is_alive; then
    return 75
  else
    initialization_owner_check_status="$?"
    if [[ "$initialization_owner_check_status" == 75 ]]; then
      return 75
    fi
  fi
  return 76
}

acquire_validation_lock() {
  local validation_lock_initialization_status=0

  mkdir -p -- "$validation_lock_parent_directory"
  validation_lock_initialization_reservation_file="${validation_lock_reservation_file_prefix}$$"
  if ! (set -C; : > "$validation_lock_initialization_reservation_file"); then
    echo "Unable to reserve validation lock initialization safely: $validation_lock_initialization_reservation_file" >&2
    exit 75
  fi
  if mkdir -- "$validation_lock_directory" 2>/dev/null; then
    validation_lock_owned=true
    trap release_validation_lock EXIT
    trap 'release_validation_lock; exit 130' INT
    trap 'release_validation_lock; exit 143' TERM
    if ! enter_validation_lock_directory_safely; then
      echo "Validation lock path is symlinked or changed; refusing ownership: $validation_lock_directory" >&2
      exit 75
    fi
    if ! mv -- "$validation_lock_initialization_reservation_file" \
      "./${validation_lock_reservation_name_prefix}$$"; then
      leave_validation_lock_directory_safely || true
      echo "Unable to publish validation lock initialization safely: $validation_lock_directory" >&2
      exit 75
    fi
    validation_lock_initialization_reservation_file=""
    if ! (
      set -C
      printf '%s\t%s\t%s\n' \
        "$$" \
        "$canonical_git_common_directory" \
        "$project_worktree_root" > "./${validation_lock_metadata_temp_name_prefix}$$"
      mv -- "./${validation_lock_metadata_temp_name_prefix}$$" ./owner
    ); then
      leave_validation_lock_directory_safely || true
      echo "Unable to publish validation lock metadata safely: $validation_lock_directory" >&2
      exit 75
    fi
    rm -f -- "./${validation_lock_reservation_name_prefix}$$"
    leave_validation_lock_directory_safely
    return
  fi

  rm -f -- "$validation_lock_initialization_reservation_file"
  validation_lock_initialization_reservation_file=""
  if read_validation_lock_metadata_safely; then
    :
  else
    validation_lock_initialization_status="$?"
    if [[ "$validation_lock_initialization_status" == 76 && "$validation_lock_metadata_state" == "initializing" ]]; then
      if wait_for_validation_lock_initialization; then
        if ! read_validation_lock_metadata_safely; then
          echo "Validation lock initialization remained incomplete: $validation_lock_directory" >&2
          exit 75
        fi
      else
        validation_lock_initialization_status="$?"
        if [[ "$validation_lock_initialization_status" == 76 ]]; then
          reclaim_validation_lock_safely || true
          if [[ ! -d "$validation_lock_directory" ]]; then
            acquire_validation_lock
            return
          fi
        fi
        echo "Validation lock initialization is active or unsafe; refusing inspection or removal: $validation_lock_directory" >&2
        exit 75
      fi
    else
      echo "Validation lock path is symlinked or changed; refusing inspection or removal: $validation_lock_directory" >&2
      exit 75
    fi
  fi
  if [[ "$validation_lock_owner_common_directory" != "$canonical_git_common_directory" ]]; then
    echo "Validation lock metadata is missing or belongs to another Git repository: $validation_lock_directory" >&2
    exit 75
  fi
  if [[ -z "$validation_lock_owner_worktree" ]]; then
    echo "Validation lock metadata is missing its owning worktree: $validation_lock_directory" >&2
    exit 75
  fi
  if [[ "$validation_lock_owner_pid" =~ ^[1-9][0-9]*$ ]] && kill -0 "$validation_lock_owner_pid" 2>/dev/null; then
    echo "Local validation already running for this Git repository via $validation_lock_owner_worktree (PID $validation_lock_owner_pid)." >&2
    exit 75
  fi
  if [[ ! "$validation_lock_owner_pid" =~ ^[1-9][0-9]*$ ]]; then
    echo "Validation lock owner is unknown; refusing to remove it: $validation_lock_directory" >&2
    exit 75
  fi

  validation_lock_metadata_state="ready"
  if ! reclaim_validation_lock_safely; then
    echo "Validation lock changed while recovering stale state: $validation_lock_directory" >&2
    exit 75
  fi
  acquire_validation_lock
}

validate_exact_vsix_checksum() {
  local validation_stage="$1"
  if [[ ! -f "$validated_vsix_path" || ! -f "$validated_vsix_checksum_path" ]]; then
    echo "ACT VSIX/checksum missing after ${validation_stage}: $validated_vsix_path" >&2
    exit 1
  fi

  local actual_vsix_sha256=""
  actual_vsix_sha256="$(shasum -a 256 "$validated_vsix_path" | awk '{print $1}')"
  if ! cmp -s "$validated_vsix_checksum_path" <(
    printf '%s  %s\n' "$actual_vsix_sha256" "$(basename "$validated_vsix_path")"
  ); then
    echo "ACT VSIX bytes changed or checksum record is not exact after ${validation_stage}." >&2
    echo "Expected exact checksum record for: $(basename "$validated_vsix_path")" >&2
    exit 1
  fi
  echo "Verified ACT VSIX checksum after ${validation_stage}: $actual_vsix_sha256"
}

acquire_validation_lock

if ! docker image inspect "$pinned_act_runner_image" >/dev/null 2>&1; then
  docker pull "$pinned_act_runner_image"
fi

local_node_environment="${project_worktree_root}/.codex/environments/run-with-node-24.sh"
# Install native Darwin optional dependencies before --bind exposes this worktree to ACT.
bash "$local_node_environment" npm ci
act \
  --container-options="-v=everforest-codeql-cache:/opt/codeql-cache -v=/github/workspace/node_modules" \
  workflow_dispatch --job linux-validation

validate_exact_vsix_checksum "ACT package build"
bash "$local_node_environment" npm run package:verify
validate_exact_vsix_checksum "native package verification"
bash "$local_node_environment" npm run test:integration:vsix
validate_exact_vsix_checksum "native macOS integration"
bash "${project_worktree_root}/.codex/environments/secret-scan.sh"
bash "$local_node_environment" npx --no-install release-it patch \
  --release-version \
  --no-git.requireBranch \
  --no-git.requireCleanWorkingDir \
  --no-git.push \
  --no-github.release
validate_exact_vsix_checksum "release policy dry-run"

if [[ "$report_status" == true ]]; then
  for required_reporting_command in gh awk; do
    if ! command -v "$required_reporting_command" >/dev/null 2>&1; then
      echo "Required reporting command not found: $required_reporting_command" >&2
      exit 1
    fi
  done

  if [[ -n "$(git status --porcelain=v1 --untracked-files=all)" ]]; then
    echo "Commit all changes before reporting local validation." >&2
    exit 1
  fi

  readonly current_branch_name="$(git branch --show-current)"
  readonly validated_commit_sha="$(git rev-parse HEAD)"
  readonly remote_branch_commit_sha="$(
    git ls-remote --heads origin "refs/heads/${current_branch_name}" | awk '{print $1}'
  )"
  if [[ "$remote_branch_commit_sha" != "$validated_commit_sha" ]]; then
    echo "Push exact commit $validated_commit_sha before reporting local validation." >&2
    exit 1
  fi

  readonly repository_slug="$(gh repo view --json nameWithOwner --jq .nameWithOwner)"
  readonly pull_request_title="$(gh pr view "$current_branch_name" --json title --jq .title)"
  readonly pull_request_url="$(gh pr view "$current_branch_name" --json url --jq .url)"
  PULL_REQUEST_TITLE="$pull_request_title" node scripts/validate-pull-request-title.mjs

  gh api --method POST "repos/${repository_slug}/statuses/${validated_commit_sha}" \
    --field state=success \
    --field context="$local_validation_context" \
    --field description="ACT Linux, CodeQL, macOS, audits, and release policy passed" \
    --field target_url="$pull_request_url" >/dev/null
  echo "Reported ${local_validation_context} success for ${validated_commit_sha}."
fi
