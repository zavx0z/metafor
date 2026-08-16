---
name: metafor-dev
description: Develop and verify MetaFor locally through one persistent visible iTerm session, one Hamiltonian process, and one dedicated CDP Chrome. Use for MetaFor or Hamiltonian implementation, server lifecycle, browser functional checks, console inspection, visual verification, WebGPU profiling, or GPU capture. Preserve user-started processes and never use the retired multi-port runtime:universe or launchd contour.
---

# MetaFor development

Keep one owner-visible development contour. Use the bundled dispatcher instead
of starting Hamiltonian, iTerm, or CDP Chrome directly:

```bash
scripts/metafor-dev.sh status <checkout>
scripts/metafor-dev.sh start <checkout>
scripts/metafor-dev.sh focus <checkout>
scripts/metafor-dev.sh logs <checkout>
scripts/metafor-dev.sh restart <checkout>
scripts/metafor-dev.sh stop <checkout>
```

The dispatcher owns one iTerm session marked for the exact checkout, runs
`bun run start` from `hamiltonian/`, and preserves the window after the process
stops. It also owns one Chrome CDP process on port 9222 with a stable profile.

## Lifecycle

1. Resolve the exact canonical checkout and preserve its branch and unrelated
   changes.
2. Run `scripts/metafor-dev.sh status <checkout>` before lifecycle actions.
3. If Hamiltonian already runs outside the marked iTerm session, preserve it
   and report the exact PIDs. Never start a duplicate or silently adopt it.
4. Use `start` to create or reuse the visible iTerm window, ensure the singleton
   CDP Chrome, wait for Hamiltonian, and create or reuse its browser target.
5. Use `logs` to read the same visible terminal contents. Use `focus` when the
   owner needs the window brought forward.
6. Use `restart` or `stop` only when required by the requested work. Leave the
   iTerm window and CDP Chrome running between Codex tasks.

Do not use `runtime:universe`, ports 4000-4005, `launchd`, HMR, another Chrome
profile, or a second CDP port for this contour.

## Browser verification

Take the stable Hamiltonian origin and CDP target from dispatcher output. Reuse
that target during the task. Verify functional state through CDP and server
evidence; do not search ordinary Chrome windows on every operation.

For a visual or performance proof, read `references/workflow.md`. For first
Inspector installation or repair only, read `references/setup.md`. Keep all
Inspector instrumentation external to MetaFor source and runtime bundles.

## Handoff

Report the exact checkout, Hamiltonian state, iTerm TTY, CDP PID/profile/target,
checks performed, and whether the visible contour remains running. Do not call
an isolated automated check owner-visible acceptance.
