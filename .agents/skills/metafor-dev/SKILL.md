---
name: metafor-dev
description: Develop, document, and verify MetaFor locally through one persistent visible iTerm session, one Cosmos startup-owned process tree, and one dedicated CDP Chrome. Use for MetaFor or Cosmos implementation, documentation ownership and TSDoc, server lifecycle, browser functional checks, console inspection, visual verification, WebGPU profiling, or GPU capture. Preserve user-started processes and never use the retired multi-port runtime:universe or launchd contour.
---

# MetaFor development

Keep one owner-visible development contour. Use the bundled dispatcher instead
of starting Cosmos, iTerm, or CDP Chrome directly:

```bash
scripts/metafor-dev.sh status <checkout>
scripts/metafor-dev.sh start <checkout>
scripts/metafor-dev.sh start-debug <checkout>
scripts/metafor-dev.sh focus <checkout>
scripts/metafor-dev.sh logs <checkout>
scripts/metafor-dev.sh restart <checkout>
scripts/metafor-dev.sh restart-debug <checkout>
scripts/metafor-dev.sh clear-site-data <checkout>
scripts/metafor-dev.sh sizes <checkout>
scripts/metafor-dev.sh stop <checkout>
```

The dispatcher owns one iTerm session marked for the exact checkout, runs
`bun run dev` from `cosmos/`, and preserves the window after the startup-owned
process tree stops. Server startup launches one exact release child; only that
child owns `Bun.serve`. The dispatcher also owns one Chrome CDP process on port
9222 with a stable profile.

## Lifecycle

1. Resolve the exact canonical checkout and preserve its branch and unrelated
   changes.
2. Run `scripts/metafor-dev.sh status <checkout>` before lifecycle actions.
3. If Cosmos already runs outside the marked iTerm session, preserve it
   and report the exact PIDs. Never start a duplicate or silently adopt it.
4. Use `start` to create or reuse the visible iTerm window, ensure the singleton
   CDP Chrome, wait for Cosmos, and create or reuse its browser target.
   Before entering a command in an existing session, the dispatcher cancels
   any unfinished command line so user input cannot prefix the launch command.
   The dispatcher clears accidental virtual viewport overrides and enables
   Verbose messages in an already open DevTools Console. It does not change
   the DevTools docking chosen by the owner.
5. Use `logs` to read the same visible terminal contents. Use `focus` when the
   owner needs the window brought forward.
6. Use `restart` or `stop` only when required by the requested work. Leave the
   iTerm window and CDP Chrome running between Codex tasks.

`start-debug` and `restart-debug` preserve the same process tree and browser
target, but startup launches the exact release child with Bun Inspector on
`127.0.0.1:6499` by default. Select another loopback port for a new debug tree
with `METAFOR_DEV_BUN_INSPECT_PORT=<port>`. A reused debug tree must have the
same actual release-child address or requires `restart-debug`. `status` derives
the actual address from that exact child and reports ready only when the sole
listener PID is the same child. Attach through the `debug.bun.sh` URL printed
in the visible terminal. Normal `start`/`restart` and package `dev`/`start`
commands remove inherited Inspector configuration. Do not mix normal and debug
parents or start a second Cosmos to obtain a debugger.

Do not use `runtime:universe`, ports 4000-4005, `launchd`, HMR, another Chrome
profile, or a second CDP port for this contour.

## Документация

Перед изменением документов-владельцев, package README, карты документации или
public TSDoc полностью прочитать
[правила документации MetaFor](references/documentation.md). Они определяют
иерархию владельцев, содержание смысловых документов, внутрикодовую техническую
документацию, терминологию, контекстные ссылки и проверки. Не создавать рядом
отдельный documentation skill для одного package или контура.

## Browser module development

Before changing a Cosmos package that contributes client code, read and follow the Russian
[development guide](references/development.md). Keep that reference aligned
with every accepted change to the local development, code-delivery, or
module-update mechanism.

## Browser verification

Take the stable Cosmos origin and CDP target from dispatcher output. Reuse
that target during the task. Verify functional state through CDP and server
evidence; do not search ordinary Chrome windows on every operation.

For a clean startup/release check, run `clear-site-data`. It performs the
origin-scoped equivalent of DevTools `Clear site data`, clears the HTTP browser
cache, reloads the same managed target, and waits for the new document. This is
the permitted direct-CDP path owned by this skill and does not require the
general-purpose `@meta/chrome` REST service. Do not reproduce its CDP calls by
hand.

Use `sizes` for package and storage diagnostics. It reports decoded package
identity bytes, negotiated wire bytes, external source maps, every Cache
Storage entry, and browser quota usage. The diagnostic uses Bun `fetch`, so
Brotli support does not depend on the system `curl` build.

Never attach Puppeteer to this persistent Chrome without
`defaultViewport: null`: Puppeteer's default `800×600` viewport survives on the
target and leaves gray space around the application. For an intentional
emulated viewport, restore native metrics before handoff. Running `start` or
`restart` performs the native reset mechanically.

For a visual or performance proof, read `references/workflow.md`. For first
Inspector installation or repair only, read `references/setup.md`. Keep all
Inspector instrumentation external to MetaFor source and runtime bundles.

## Handoff

Report the exact checkout, Cosmos state, iTerm TTY, CDP PID/profile/target,
checks performed, and whether the visible contour remains running. Do not call
an isolated automated check owner-visible acceptance.
