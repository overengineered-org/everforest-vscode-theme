#!/usr/bin/env bash
set -euo pipefail

readonly release_version="${1:?release version is required}"
readonly release_package_path="${2:?release package path is required}"
readonly release_package_name="everforest-complete-${release_version}.vsix"
readonly marketplace_readback_directory="$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/everforest-marketplace-readback.XXXXXX")"
readonly marketplace_poll_deadline_seconds="${MARKETPLACE_POLL_DEADLINE_SECONDS:-300}"
readonly marketplace_poll_initial_delay_seconds="${MARKETPLACE_POLL_INITIAL_DELAY_SECONDS:-5}"
readonly marketplace_poll_max_delay_seconds=30
readonly marketplace_curl_max_time_seconds=120
trap 'rm -rf -- "$marketplace_readback_directory"' EXIT

if [[ ! "$release_version" =~ ^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]]; then
  echo "Invalid release version: $release_version" >&2
  exit 1
fi
if [[ "$(basename -- "$release_package_path")" != "$release_package_name" ]]; then
  echo "Release package path does not match ${release_version}." >&2
  exit 1
fi
if [[ ! -f "$release_package_path" ]]; then
  echo "Release package is missing: $release_package_path" >&2
  exit 1
fi
if ! [[ "$marketplace_poll_deadline_seconds" =~ ^[1-9][0-9]*$ ]] || \
  ! [[ "$marketplace_poll_initial_delay_seconds" =~ ^[1-9][0-9]*$ ]]; then
  echo "Marketplace poll deadline and initial delay must be positive integers." >&2
  exit 1
fi

marketplace_endpoint_url="https://marketplace.visualstudio.com/_apis/public/gallery/publishers/overengineered-org/vsextensions/everforest-complete/${release_version}/vspackage"
marketplace_catalog_url="https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery"
marketplace_catalog_request_body='{"filters":[{"criteria":[{"filterType":7,"value":"overengineered-org.everforest-complete"}]}],"flags":402}'
marketplace_poll_deadline_epoch="$(( $(date +%s) + marketplace_poll_deadline_seconds ))"
marketplace_poll_attempt_count=0
marketplace_retry_delay_seconds="$marketplace_poll_initial_delay_seconds"
marketplace_endpoint_verification_status="pending"
marketplace_catalog_verification_status="pending"
marketplace_endpoint_error_path="${marketplace_readback_directory}/endpoint-error"
marketplace_catalog_error_path="${marketplace_readback_directory}/catalog-error"

while :; do
  marketplace_remaining_seconds="$(( marketplace_poll_deadline_epoch - $(date +%s) ))"
  if (( marketplace_remaining_seconds <= 0 )); then
    break
  fi
  marketplace_poll_attempt_count=$((marketplace_poll_attempt_count + 1))

  if [[ "$marketplace_endpoint_verification_status" != "verified" ]]; then
    marketplace_endpoint_path="${marketplace_readback_directory}/${release_package_name}.attempt-${marketplace_poll_attempt_count}"
    marketplace_endpoint_request_timeout_seconds="$marketplace_remaining_seconds"
    if (( marketplace_endpoint_request_timeout_seconds > marketplace_curl_max_time_seconds )); then
      marketplace_endpoint_request_timeout_seconds="$marketplace_curl_max_time_seconds"
    fi
    if curl --fail --location --silent --show-error --compressed \
      --connect-timeout 20 --max-time "$marketplace_endpoint_request_timeout_seconds" \
      --retry 2 --retry-all-errors \
      --output "$marketplace_endpoint_path" \
      "$marketplace_endpoint_url" 2>"$marketplace_endpoint_error_path"; then
      if cmp -- "$release_package_path" "$marketplace_endpoint_path"; then
        marketplace_endpoint_verification_status="verified"
      else
        marketplace_endpoint_verification_status="stale"
      fi
    else
      marketplace_endpoint_verification_status="unavailable"
    fi
  fi

  marketplace_remaining_seconds="$(( marketplace_poll_deadline_epoch - $(date +%s) ))"
  if (( marketplace_remaining_seconds > 0 )) && [[ "$marketplace_catalog_verification_status" != "verified" ]]; then
    marketplace_catalog_path="${marketplace_readback_directory}/catalog.attempt-${marketplace_poll_attempt_count}.json"
    marketplace_catalog_request_timeout_seconds="$marketplace_remaining_seconds"
    if (( marketplace_catalog_request_timeout_seconds > marketplace_curl_max_time_seconds )); then
      marketplace_catalog_request_timeout_seconds="$marketplace_curl_max_time_seconds"
    fi
    if curl --fail --location --silent --show-error --compressed \
      --connect-timeout 20 --max-time "$marketplace_catalog_request_timeout_seconds" \
      --retry 2 --retry-all-errors \
      --header 'Accept: application/json;api-version=7.1-preview.1' \
      --header 'Content-Type: application/json' \
      --data-raw "$marketplace_catalog_request_body" \
      --output "$marketplace_catalog_path" \
      "$marketplace_catalog_url" 2>"$marketplace_catalog_error_path"; then
      if catalog_version_count="$(jq --arg release_version "$release_version" '[.results[]?.extensions[]? | select(.publisher.publisherName == "overengineered-org" and .extensionName == "everforest-complete") | .versions[]?.version | select(. == $release_version)] | length' "$marketplace_catalog_path" 2>"$marketplace_catalog_error_path")" && [[ "$catalog_version_count" == 1 ]]; then
        marketplace_catalog_verification_status="verified"
      else
        marketplace_catalog_verification_status="stale"
      fi
    else
      marketplace_catalog_verification_status="unavailable"
    fi
  fi

  if [[ "$marketplace_endpoint_verification_status" == "verified" ]] && \
    [[ "$marketplace_catalog_verification_status" == "verified" ]]; then
    echo "Marketplace publication verified: ${release_package_name} and catalog ${release_version}."
    exit 0
  fi

  marketplace_remaining_seconds="$(( marketplace_poll_deadline_epoch - $(date +%s) ))"
  if (( marketplace_remaining_seconds <= 0 )); then
    break
  fi
  marketplace_sleep_seconds="$marketplace_retry_delay_seconds"
  if (( marketplace_sleep_seconds > marketplace_remaining_seconds )); then
    marketplace_sleep_seconds="$marketplace_remaining_seconds"
  fi
  sleep "$marketplace_sleep_seconds"
  if (( marketplace_retry_delay_seconds < marketplace_poll_max_delay_seconds )); then
    marketplace_retry_delay_seconds=$(( marketplace_retry_delay_seconds * 2 ))
    if (( marketplace_retry_delay_seconds > marketplace_poll_max_delay_seconds )); then
      marketplace_retry_delay_seconds="$marketplace_poll_max_delay_seconds"
    fi
  fi
done

echo "Marketplace publication timed out after ${marketplace_poll_deadline_seconds}s (attempts=${marketplace_poll_attempt_count}; endpoint=${marketplace_endpoint_verification_status}; catalog=${marketplace_catalog_verification_status})." >&2
if [[ "$marketplace_endpoint_verification_status" == "unavailable" ]] && [[ -s "$marketplace_endpoint_error_path" ]]; then
  echo "Last Marketplace endpoint error: $(tail -n 1 "$marketplace_endpoint_error_path")" >&2
fi
if [[ "$marketplace_catalog_verification_status" == "unavailable" ]] && [[ -s "$marketplace_catalog_error_path" ]]; then
  echo "Last Marketplace catalog error: $(tail -n 1 "$marketplace_catalog_error_path")" >&2
fi
exit 1
