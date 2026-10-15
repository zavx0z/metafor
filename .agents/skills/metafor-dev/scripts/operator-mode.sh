#!/usr/bin/env bash

# Installed copy исполняет тот же dispatcher с неизменным checkout marker.
if [[ -n ${METAFOR_OPERATOR_ROOT:-} ]]; then
  export PATH=/opt/local/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin
  [[ $script_dir == "$METAFOR_OPERATOR_ROOT/scripts" ]] || { printf 'Operator script binding differs\n' >&2; exit 1; }
  [[ ${METAFOR_OPERATOR_INSTANCE:-} == /* && ${METAFOR_OPERATOR_INSTANCE_SHA256:-} =~ ^[a-f0-9]{64}$ ]] || exit 1
  [[ $(shasum -a 256 "$METAFOR_OPERATOR_INSTANCE" | cut -d ' ' -f1) == "$METAFOR_OPERATOR_INSTANCE_SHA256" ]] || exit 1
  [[ $(cat "$METAFOR_OPERATOR_ROOT/INSTANCE.sha256") == "$METAFOR_OPERATOR_INSTANCE_SHA256" ]] || exit 1
  [[ $(shasum -a 256 "$METAFOR_OPERATOR_ROOT/SHA256SUMS" | cut -d ' ' -f1) == "${METAFOR_OPERATOR_ROOT##*/}" ]] || exit 1
  (cd "$METAFOR_OPERATOR_ROOT" && shasum -a 256 -c SHA256SUMS >/dev/null) || exit 1
  operator_checkout=$(jq -er '.checkout' "$METAFOR_OPERATOR_INSTANCE") || exit 1
  operator_port=$(jq -er '.port' "$METAFOR_OPERATOR_INSTANCE") || exit 1
  operator_bun=$(jq -er '.bunExecutable' "$METAFOR_OPERATOR_INSTANCE") || exit 1
  [[ $operator_checkout == /* && $operator_bun == /* && -x $operator_bun && $operator_port =~ ^[0-9]+$ ]] || exit 1
  # Пустой immutable cwd исключает исходные .env/bunfig/package scripts.
  unset BUN_OPTIONS NODE_OPTIONS BUN_CONFIG_PRELOAD
  export METAFOR_OPERATOR_BUN="$operator_bun"
  bun() {
    if [[ ${1:-} == run ]]; then "$operator_bun" "$@"
    else "$operator_bun" --no-env-file --config="$METAFOR_OPERATOR_ROOT/bunfig.toml" "$@"; fi
  }
fi
