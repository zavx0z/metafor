#!/usr/bin/env bash

resolve_inspector_port() {
  local port=${1:-6499}
  [[ $port =~ ^[0-9]+$ ]] || return 1
  ((10#$port >= 1 && 10#$port <= 65535)) || return 1
  printf '%d\n' "$((10#$port))"
}

inspector_address_for_port() {
  local port
  port=$(resolve_inspector_port "${1:-}") || return 1
  printf '127.0.0.1:%s\n' "$port"
}

inspector_port_from_address() {
  local address=$1
  [[ $address =~ ^127\.0\.0\.1:([0-9]+)$ ]] || return 1
  resolve_inspector_port "${BASH_REMATCH[1]}"
}

configure_terminal_inspector_environment() {
  local mode=$1 address=${2:-}
  case "$mode" in
    normal) unset COSMOS_RELEASE_INSPECT ;;
    debug)
      inspector_port_from_address "$address" >/dev/null || {
        printf 'Invalid MetaFor release Inspector address: %s\n' "$address" >&2
        return 1
      }
      export COSMOS_RELEASE_INSPECT=$address
      ;;
    *)
      printf 'Unknown MetaFor development mode: %s\n' "$mode" >&2
      return 1
      ;;
  esac
}

is_project_version() {
  [[ $1 =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]
}

is_exact_release_artifact_token() {
  local token=$1 release_root=$2 relative version
  relative=${token#"$release_root/dist/versions/"}
  [[ $relative != "$token" && $relative == */server.js ]] || return 1
  version=${relative%/server.js}
  [[ $version != */* ]] && is_project_version "$version"
}

is_exact_release_command() {
  local command=$1 release_root=$2 token artifacts=0
  for token in $command; do
    is_exact_release_artifact_token "$token" "$release_root" || continue
    artifacts=$((artifacts + 1))
  done
  [[ $artifacts == 1 ]]
}

exact_release_descendants() {
  local descendants=$1 release_root=$2 pid tty_value command
  while IFS=$'\t' read -r pid tty_value command; do
    [[ -n $pid ]] || continue
    is_exact_release_command "$command" "$release_root" || continue
    printf '%s\t%s\t%s\n' "$pid" "$tty_value" "$command"
  done <<<"$descendants"
}

release_inspector_state() {
  local descendants=$1 release_root=$2 exact count line pid tty_value command
  local token address= inspect_arguments=0
  exact=$(exact_release_descendants "$descendants" "$release_root")
  count=$(awk 'NF { count += 1 } END { print count + 0 }' <<<"$exact")
  if [[ $count == 0 ]]; then
    printf 'absent\t0\n'
    return
  fi
  if [[ $count != 1 ]]; then
    printf 'multiple\t%s\n' "$count"
    return
  fi

  line=${exact%%$'\n'*}
  IFS=$'\t' read -r pid tty_value command <<<"$line"
  for token in $command; do
    is_exact_release_artifact_token "$token" "$release_root" && break
    case "$token" in
      --inspect=*)
        address=${token#--inspect=}
        inspect_arguments=$((inspect_arguments + 1))
        ;;
    esac
  done
  if [[ $inspect_arguments == 0 ]]; then
    printf 'normal\t%s\n' "$pid"
  elif [[ $inspect_arguments != 1 ]] || ! inspector_port_from_address "$address" >/dev/null; then
    printf 'invalid\t%s\n' "$pid"
  else
    printf 'debug\t%s\t%s\n' "$pid" "$address"
  fi
}

inspector_listener_ownership() {
  local release_pid=$1 listeners=$2 normalized count listener
  normalized=$(awk 'NF && !seen[$1]++ { print $1 }' <<<"$listeners")
  count=$(awk 'NF { count += 1 } END { print count + 0 }' <<<"$normalized")
  if [[ $count == 0 ]]; then
    printf 'missing\n'
    return
  fi
  if [[ $count != 1 ]]; then
    printf 'multiple\t%s\n' "$count"
    return
  fi
  listener=${normalized%%$'\n'*}
  if [[ $listener == "$release_pid" ]]; then
    printf 'managed\t%s\n' "$listener"
  else
    printf 'foreign\t%s\n' "$listener"
  fi
}

require_managed_release_mode() {
  local mode=$1 requested_address=$2 descendants=$3 release_root=$4 listeners=${5:-}
  local state kind release_pid actual_address ownership ownership_kind listener_pid
  state=$(release_inspector_state "$descendants" "$release_root")
  IFS=$'\t' read -r kind release_pid actual_address <<<"$state"
  case "$mode" in
    normal)
      if [[ $kind == normal ]]; then
        printf 'normal\t%s\n' "$release_pid"
        return
      fi
      printf 'Expected one normal exact release child without --inspect, got %s\n' "$kind"
      return 1
      ;;
    debug)
      inspector_port_from_address "$requested_address" >/dev/null || {
        printf 'Invalid requested Bun Inspector address: %s\n' "$requested_address"
        return 1
      }
      if [[ $kind != debug ]]; then
        printf 'Expected one debug exact release child on %s, got %s\n' \
          "$requested_address" "$kind"
        return 1
      fi
      if [[ $actual_address != "$requested_address" ]]; then
        printf 'Cosmos release child uses Bun Inspector %s, requested %s; use restart-debug\n' \
          "$actual_address" "$requested_address"
        return 1
      fi
      ownership=$(inspector_listener_ownership "$release_pid" "$listeners")
      IFS=$'\t' read -r ownership_kind listener_pid <<<"$ownership"
      if [[ $ownership_kind == managed ]]; then
        printf 'debug\t%s\t%s\n' "$release_pid" "$actual_address"
        return
      fi
      printf 'Expected sole Bun Inspector listener to be exact release child %s, got %s%s\n' \
        "$release_pid" "$ownership_kind" "${listener_pid:+ $listener_pid}"
      return 1
      ;;
    *)
      printf 'Unknown MetaFor development mode: %s\n' "$mode"
      return 1
      ;;
  esac
}
