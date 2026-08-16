#!/usr/bin/env bash
set -u
export LC_ALL=C LANG=C

repo=${1:?usage: terminal-runner.sh checkout}
hamiltonian="$repo/hamiltonian"

cd "$hamiltonian" || exit 1
printf '\033]0;%s\007' "MetaFor Dev - Hamiltonian"
printf 'MetaFor Dev\ncheckout: %s\ncommand: bun run dev\n\n' "$repo"

exit_code=0
bun run dev || exit_code=$?

printf '\nHamiltonian stopped with exit code %s\n' "$exit_code"
printf 'This iTerm session stays open for metafor-dev restart and log inspection.\n'
exec /bin/zsh -l
