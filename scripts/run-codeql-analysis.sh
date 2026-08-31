#!/usr/bin/env bash
set -euo pipefail

readonly configured_project_worktree_root="${GITHUB_WORKSPACE:-$(git rev-parse --show-toplevel)}"
readonly codeql_binary_path="${CODEQL_BINARY_PATH:?CODEQL_BINARY_PATH is required}"
readonly codeql_analysis_directory="${CODEQL_ANALYSIS_DIRECTORY:?CODEQL_ANALYSIS_DIRECTORY is required}"
readonly codeql_results_directory="${CODEQL_RESULTS_DIRECTORY:?CODEQL_RESULTS_DIRECTORY is required}"
readonly default_codeql_thread_count=2
readonly maximum_codeql_thread_count=4
readonly codeql_threads="${CODEQL_THREADS:-$default_codeql_thread_count}"
canonical_codeql_directory_result=""

if [[ "$configured_project_worktree_root" != /* ]] || [[ ! -d "$configured_project_worktree_root" ]]; then
  echo "GITHUB_WORKSPACE must be an existing absolute directory: $configured_project_worktree_root" >&2
  exit 64
fi
readonly project_worktree_root="$(cd -- "$configured_project_worktree_root" && pwd -P)"

if [[ ! "$codeql_threads" =~ ^[1-9][0-9]*$ ]]; then
  echo "CODEQL_THREADS must be a positive integer from 1 to ${maximum_codeql_thread_count}: $codeql_threads" >&2
  exit 64
fi
if (( ${#codeql_threads} > ${#maximum_codeql_thread_count} )) || \
  { (( ${#codeql_threads} == ${#maximum_codeql_thread_count} )) && \
    [[ "$codeql_threads" > "$maximum_codeql_thread_count" ]]; }; then
  echo "CODEQL_THREADS must be a positive integer from 1 to ${maximum_codeql_thread_count}: $codeql_threads" >&2
  exit 64
fi

canonicalize_codeql_directory() {
  local directory_role="$1"
  local configured_directory="$2"
  local required_leaf_name="$3"
  local alternate_leaf_name="${4:-}"
  local configured_leaf_name="${configured_directory##*/}"
  local configured_parent_directory="${configured_directory%/*}"
  local canonical_parent_directory=""
  local canonical_directory=""

  if [[ "$configured_directory" != /* ]] || \
    { [[ "$configured_leaf_name" != "$required_leaf_name" ]] && [[ "$configured_leaf_name" != "$alternate_leaf_name" ]]; }; then
    if [[ -n "$alternate_leaf_name" ]]; then
      echo "Unsafe CodeQL ${directory_role} directory; expected an absolute path ending in ${required_leaf_name} or ${alternate_leaf_name}: ${configured_directory}" >&2
    else
      echo "Unsafe CodeQL ${directory_role} directory; expected an absolute path ending in ${required_leaf_name}: ${configured_directory}" >&2
    fi
    exit 64
  fi
  if [[ -L "$configured_directory" ]]; then
    echo "Unsafe CodeQL ${directory_role} directory; symlink targets are rejected: ${configured_directory}" >&2
    exit 64
  fi
  if [[ -z "$configured_parent_directory" ]]; then
    configured_parent_directory="/"
  fi
  if [[ ! -d "$configured_parent_directory" ]]; then
    echo "Unsafe CodeQL ${directory_role} directory; parent does not exist: ${configured_parent_directory}" >&2
    exit 64
  fi
  if [[ -L "$configured_parent_directory" ]]; then
    echo "Unsafe CodeQL ${directory_role} directory; symlinked parent is rejected: ${configured_parent_directory}" >&2
    exit 64
  fi

  canonical_parent_directory="$(cd -- "$configured_parent_directory" && pwd -P)"
  if [[ "$canonical_parent_directory" == "/" ]]; then
    canonical_directory="/${configured_leaf_name}"
  else
    canonical_directory="${canonical_parent_directory}/${configured_leaf_name}"
  fi
  if [[ "$canonical_directory" != "$configured_directory" ]]; then
    echo "Unsafe CodeQL ${directory_role} directory; expected an absolute canonical path: ${configured_directory}" >&2
    exit 64
  fi
  if [[ -L "$canonical_directory" ]]; then
    echo "Unsafe CodeQL ${directory_role} directory; symlink targets are rejected: ${canonical_directory}" >&2
    exit 64
  fi
  if [[ -e "$configured_directory" && ! -d "$configured_directory" ]]; then
    echo "Unsafe CodeQL ${directory_role} directory; existing target is not a directory: ${configured_directory}" >&2
    exit 64
  fi
  if [[ "$canonical_directory" == "$project_worktree_root" || "$project_worktree_root" == "$canonical_directory"/* ]]; then
    echo "Unsafe CodeQL ${directory_role} directory; repository root or ancestor: ${configured_directory}" >&2
    exit 64
  fi

  canonical_codeql_directory_result="$canonical_directory"
}

canonicalize_codeql_directory \
  "analysis" \
  "$codeql_analysis_directory" \
  "everforest-codeql-analysis"
readonly canonical_codeql_analysis_directory="$canonical_codeql_directory_result"
canonicalize_codeql_directory \
  "results" \
  "$codeql_results_directory" \
  "everforest-codeql-results" \
  ".codeql-results"
readonly canonical_codeql_results_directory="$canonical_codeql_directory_result"

if [[ "$canonical_codeql_analysis_directory" == "$canonical_codeql_results_directory" ]]; then
  echo "Unsafe CodeQL directories; analysis and results must be different: $canonical_codeql_analysis_directory" >&2
  exit 64
fi

rm -rf -- "$canonical_codeql_analysis_directory" "$canonical_codeql_results_directory"
mkdir -p -- "$canonical_codeql_analysis_directory" "$canonical_codeql_results_directory"

for codeql_language in actions javascript-typescript; do
  codeql_database_directory="${canonical_codeql_analysis_directory}/${codeql_language}-database"
  codeql_result_path="${canonical_codeql_results_directory}/${codeql_language}.sarif"

  "$codeql_binary_path" database create "$codeql_database_directory" \
    --language="$codeql_language" \
    --source-root="$project_worktree_root" \
    --threads="$codeql_threads"
  "$codeql_binary_path" database analyze "$codeql_database_directory" \
    --format=sarif-latest \
    --output="$codeql_result_path" \
    --sarif-category="everforest/${codeql_language}" \
    --threads="$codeql_threads"
done

node "${project_worktree_root}/scripts/assert-codeql-results.mjs" "$canonical_codeql_results_directory"
