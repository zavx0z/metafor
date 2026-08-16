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
scripts/metafor-dev.sh clear-site-data <checkout>
scripts/metafor-dev.sh stop <checkout>
```

The dispatcher owns one iTerm session marked for the exact checkout, runs
`bun run dev` from `hamiltonian/`, and preserves the window after the process
stops. It also owns one Chrome CDP process on port 9222 with a stable profile.

## Lifecycle

1. Resolve the exact canonical checkout and preserve its branch and unrelated
   changes.
2. Run `scripts/metafor-dev.sh status <checkout>` before lifecycle actions.
3. If Hamiltonian already runs outside the marked iTerm session, preserve it
   and report the exact PIDs. Never start a duplicate or silently adopt it.
4. Use `start` to create or reuse the visible iTerm window, ensure the singleton
   CDP Chrome, wait for Hamiltonian, and create or reuse its browser target.
   Before entering a command in an existing session, the dispatcher cancels
   any unfinished command line so user input cannot prefix the launch command.
   The dispatcher clears accidental virtual viewport overrides and enables
   Verbose messages in an already open DevTools Console. It does not change
   the DevTools docking chosen by the owner.
5. Use `logs` to read the same visible terminal contents. Use `focus` when the
   owner needs the window brought forward.
6. Use `restart` or `stop` only when required by the requested work. Leave the
   iTerm window and CDP Chrome running between Codex tasks.

Do not use `runtime:universe`, ports 4000-4005, `launchd`, HMR, another Chrome
profile, or a second CDP port for this contour.

## Browser module development

Before changing a Hamiltonian package that contributes client code, read and follow the Russian
[development guide](references/development.md). Keep that reference aligned
with every accepted change to the local development, code-delivery, or
module-update mechanism.

## Browser verification

Take the stable Hamiltonian origin and CDP target from dispatcher output. Reuse
that target during the task. Verify functional state through CDP and server
evidence; do not search ordinary Chrome windows on every operation.

For a clean startup/release check, run `clear-site-data`. It performs the
origin-scoped equivalent of DevTools `Clear site data`, clears the HTTP browser
cache, reloads the same managed target, and waits for the new document. This is
the permitted direct-CDP path owned by this skill and does not require the
general-purpose `@meta/chrome` REST service. Do not reproduce its CDP calls by
hand.

Never attach Puppeteer to this persistent Chrome without
`defaultViewport: null`: Puppeteer's default `800×600` viewport survives on the
target and leaves gray space around the application. For an intentional
emulated viewport, restore native metrics before handoff. Running `start` or
`restart` performs the native reset mechanically.

For a visual or performance proof, read `references/workflow.md`. For first
Inspector installation or repair only, read `references/setup.md`. Keep all
Inspector instrumentation external to MetaFor source and runtime bundles.

## Handoff

Report the exact checkout, Hamiltonian state, iTerm TTY, CDP PID/profile/target,
checks performed, and whether the visible contour remains running. Do not call
an isolated automated check owner-visible acceptance.
