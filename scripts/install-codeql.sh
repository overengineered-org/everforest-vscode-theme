#!/usr/bin/env bash
set -euo pipefail

readonly codeql_bundle_version="2.26.4"
readonly codeql_release_tag="codeql-bundle-v${codeql_bundle_version}"
readonly codeql_bundle_name="codeql-bundle-linux64.tar.gz"
readonly codeql_bundle_sha256="48e1ab8b874d57bd6fd7c90fefee75addc5a45e9bd063982df9beb45a62dd5d3"
readonly codeql_release_url="https://github.com/github/codeql-action/releases/download/${codeql_release_tag}"
readonly configured_codeql_installation_root="${CODEQL_INSTALLATION_ROOT:?CODEQL_INSTALLATION_ROOT is required}"
script_directory="${BASH_SOURCE[0]%/*}"
if [[ "$script_directory" == "${BASH_SOURCE[0]}" ]]; then
  script_directory="."
fi
readonly script_directory
readonly project_worktree_root="$(cd -- "$script_directory/.." && pwd -P)"
readonly codeql_install_lock_wait_seconds=120
canonical_codeql_installation_root_result=""
temporary_installation_directory=""

reject_unsafe_codeql_installation_root() {
  echo "Unsafe CodeQL installation root; expected a dedicated absolute canonical non-symlink directory: $configured_codeql_installation_root" >&2
  exit 64
}

canonicalize_codeql_installation_root() {
  local configured_root="$1"
  local configured_root_parent="${configured_root%/*}"
  local configured_root_leaf="${configured_root##*/}"
  local canonical_root_parent=""
  local canonical_root=""

  if [[ "$configured_root" != /* || "$configured_root" == "/" || \
    -z "$configured_root_leaf" || "$configured_root_leaf" == "." || "$configured_root_leaf" == ".." ]]; then
    reject_unsafe_codeql_installation_root
  fi
  if [[ -L "$configured_root" ]]; then
    reject_unsafe_codeql_installation_root
  fi
  if [[ -z "$configured_root_parent" ]]; then
    configured_root_parent="/"
  fi
  if [[ ! -d "$configured_root_parent" ]]; then
    echo "Unsafe CodeQL installation root; parent does not exist: $configured_root_parent" >&2
    exit 64
  fi

  canonical_root_parent="$(cd -- "$configured_root_parent" && pwd -P)"
  if [[ "$canonical_root_parent" == "/" ]]; then
    canonical_root="/${configured_root_leaf}"
  else
    canonical_root="${canonical_root_parent}/${configured_root_leaf}"
  fi
  if [[ "$canonical_root" != "$configured_root" || -L "$canonical_root" ]]; then
    reject_unsafe_codeql_installation_root
  fi
  if [[ -e "$canonical_root" && ! -d "$canonical_root" ]]; then
    echo "Unsafe CodeQL installation root; existing target is not a directory: $configured_root" >&2
    exit 64
  fi
  if [[ "$canonical_root" == "$project_worktree_root" || "$project_worktree_root" == "$canonical_root"/* ]]; then
    echo "Unsafe CodeQL installation root; repository root or ancestor: $configured_root" >&2
    exit 64
  fi

  canonical_codeql_installation_root_result="$canonical_root"
}

canonicalize_codeql_installation_root "$configured_codeql_installation_root"
readonly codeql_installation_root="$canonical_codeql_installation_root_result"
readonly versioned_codeql_directory="${codeql_installation_root}/${codeql_bundle_version}"
readonly codeql_binary_path="${versioned_codeql_directory}/codeql"
readonly codeql_install_lock_file="${codeql_installation_root}/.${codeql_bundle_version}.install.lock"

if ! command -v flock >/dev/null 2>&1; then
  echo "CodeQL installation requires Linux flock (util-linux); command not found." >&2
  exit 69
fi

cleanup_codeql_installation() {
  if [[ -n "$temporary_installation_directory" ]]; then
    if [[ -L "$temporary_installation_directory" ]]; then
      echo "Unsafe CodeQL staging path; symlink targets are rejected: $temporary_installation_directory" >&2
      return 0
    fi
    if [[ -e "$temporary_installation_directory" && ! -d "$temporary_installation_directory" ]]; then
      echo "Unsafe CodeQL staging path; refusing cleanup: $temporary_installation_directory" >&2
      return 0
    fi
    rm -rf -- "$temporary_installation_directory"
  fi
}

assert_codeql_installation_root_is_safe() {
  local existing_root_canonical_path=""

  if [[ -L "$codeql_installation_root" || ! -d "$codeql_installation_root" ]]; then
    echo "Unsafe CodeQL installation root; target changed or is not a directory: $codeql_installation_root" >&2
    exit 1
  fi
  existing_root_canonical_path="$(cd -- "$codeql_installation_root" && pwd -P)"
  if [[ "$existing_root_canonical_path" != "$codeql_installation_root" ]]; then
    echo "Unsafe CodeQL installation root; target changed to a symlink: $codeql_installation_root" >&2
    exit 1
  fi
}

assert_codeql_lock_target_is_safe() {
  if [[ -L "$codeql_install_lock_file" ]]; then
    echo "Unsafe CodeQL lock path; symlink targets are rejected: $codeql_install_lock_file" >&2
    exit 1
  fi
  if [[ -e "$codeql_install_lock_file" && ! -f "$codeql_install_lock_file" ]]; then
    echo "Unsafe CodeQL lock path; existing target is not a regular file: $codeql_install_lock_file" >&2
    exit 1
  fi
}

remove_orphaned_codeql_staging_directories() {
  local orphaned_staging_directory=""
  local orphaned_staging_directory_name=""

  for orphaned_staging_directory in "${codeql_installation_root}/install-${codeql_bundle_version}."*; do
    if [[ ! -e "$orphaned_staging_directory" && ! -L "$orphaned_staging_directory" ]]; then
      continue
    fi
    orphaned_staging_directory_name="${orphaned_staging_directory##*/}"
    case "$orphaned_staging_directory_name" in
      "install-${codeql_bundle_version}."?*) ;;
      *)
        echo "Unsafe CodeQL orphan staging path; refusing cleanup: $orphaned_staging_directory" >&2
        exit 1
        ;;
    esac
    if [[ -L "$orphaned_staging_directory" ]]; then
      echo "Unsafe CodeQL orphan staging path; symlink targets are rejected: $orphaned_staging_directory" >&2
      exit 1
    fi
    if [[ ! -d "$orphaned_staging_directory" ]]; then
      echo "Unsafe CodeQL orphan staging path; refusing cleanup: $orphaned_staging_directory" >&2
      exit 1
    fi
    rm -rf -- "$orphaned_staging_directory"
  done
}

acquire_codeql_install_lock() {
  assert_codeql_installation_root_is_safe
  assert_codeql_lock_target_is_safe
  if ! exec 9>>"$codeql_install_lock_file"; then
    echo "Unable to open the CodeQL installation lock: $codeql_install_lock_file" >&2
    exit 74
  fi
  if ! flock --exclusive --wait "$codeql_install_lock_wait_seconds" 9; then
    echo "Timed out waiting for the CodeQL installation lock after ${codeql_install_lock_wait_seconds}s: $codeql_install_lock_file" >&2
    exit 75
  fi
}

trap cleanup_codeql_installation EXIT

if [[ -L "$versioned_codeql_directory" || -L "$codeql_binary_path" ]]; then
  echo "Unsafe CodeQL cached target; symlink targets are rejected: $versioned_codeql_directory" >&2
  exit 1
fi
if [[ -e "$codeql_binary_path" && ! -f "$codeql_binary_path" ]]; then
  echo "Unsafe CodeQL cached target; expected a regular binary: $codeql_binary_path" >&2
  exit 1
fi

if [[ ! -x "$codeql_binary_path" ]]; then
  mkdir -p -- "$codeql_installation_root"
  assert_codeql_installation_root_is_safe
  acquire_codeql_install_lock

  if [[ ! -x "$codeql_binary_path" ]]; then
    if [[ -e "$versioned_codeql_directory" || -L "$versioned_codeql_directory" ]]; then
      echo "CodeQL installation directory exists without a usable binary; refusing to replace it: $versioned_codeql_directory" >&2
      exit 1
    fi
    remove_orphaned_codeql_staging_directories
    temporary_installation_directory="$(mktemp -d "${codeql_installation_root}/install-${codeql_bundle_version}.XXXXXX")"

    curl --fail --location --retry 4 --retry-all-errors \
      --output "${temporary_installation_directory}/${codeql_bundle_name}" \
      "${codeql_release_url}/${codeql_bundle_name}"
    (
      cd "$temporary_installation_directory"
      printf '%s  %s\n' "$codeql_bundle_sha256" "$codeql_bundle_name" | sha256sum --check
      tar --extract --gzip --file "$codeql_bundle_name"
    )
    if [[ -L "${temporary_installation_directory}/codeql" || ! -d "${temporary_installation_directory}/codeql" ]]; then
      echo "Unsafe CodeQL archive; expected a non-symlink codeql directory: ${temporary_installation_directory}/codeql" >&2
      exit 1
    fi
    mv "${temporary_installation_directory}/codeql" "$versioned_codeql_directory"
  fi
fi

"$codeql_binary_path" version
if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  echo "binary_path=$codeql_binary_path" >> "$GITHUB_OUTPUT"
else
  echo "$codeql_binary_path"
fi
