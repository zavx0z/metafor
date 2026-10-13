---
name: metafor-dev
description: Develop, document, and verify MetaFor locally through one persistent visible iTerm session and one Cosmos startup-owned Bun process tree. Browser diagnostics are an explicitly requested separate mode. Use for MetaFor or Cosmos implementation, documentation ownership and TSDoc, server lifecycle, browser functional checks, console inspection, visual verification, WebGPU profiling, or GPU capture. Preserve user-started processes and never use the retired multi-port runtime:universe or launchd contour.
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
ordinary `bun run dev` with `NODE_ENV=development` from `cosmos/`, and preserves
the window after the startup-owned process tree stops. Server startup launches
one exact release child; only that child owns `Bun.serve`. Normal and debug
server lifecycle leave browsers untouched. Browser launch is not part of
development startup, installation, or distribution acceptance.

Only when the user explicitly requests managed Chrome diagnostics, use
`start-browser` or `restart-browser`. That separate mode owns one Chrome CDP
process on port 9222 with a stable profile.

## Lifecycle

1. Resolve the exact canonical checkout and preserve its branch and unrelated
   changes.
2. Run `scripts/metafor-dev.sh status <checkout>` before lifecycle actions.
3. If Cosmos already runs outside the marked iTerm session, preserve it
   and report the exact PIDs. Never start a duplicate or silently adopt it.
4. Use `start` to create or reuse the visible iTerm window and wait for Cosmos.
   The explicitly requested `start-browser` mode additionally ensures the
   singleton CDP Chrome and creates or reuses its browser target.
   Before entering a command in an existing session, the dispatcher cancels
   any unfinished command line so user input cannot prefix the launch command.
   The managed browser mode clears accidental virtual viewport overrides and enables
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

`start-server` / `restart-server` remain aliases for normal server lifecycle.
If the user explicitly authorizes an existing personal Chrome for diagnostics,
attach separately only to that authorized Chrome. Approval-only Chrome exposes
its browser WebSocket through its profile's `DevToolsActivePort`, requires its
own user approval, and may not provide `/json/*` discovery. Reuse one MetaFor
target through `Target` CDP commands; do not alter unrelated targets. In this
mode `status` reports only the dedicated managed Chrome, so report the external
browser identity separately. Managed-only `clear-site-data` and `sizes` remain
unavailable until their exact browser ownership requirements are met.

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

Take the stable Cosmos origin from dispatcher output. For explicitly requested
managed browser diagnostics, retain its CDP target and reuse that target during
the task. Ordinary development and installation checks use server and artifact
evidence without starting or attaching a browser. Do not present these checks
as live visual acceptance.

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

Use direct CDP over the managed target's WebSocket for browser diagnostics,
input and screenshots. Preserve the native viewport by default. If a check
intentionally emulates a viewport, restore native metrics before handoff.
Running `start-browser` or `restart-browser` performs the native reset mechanically.
Use `Debugger` and `Input` for an owner-visible breakpoint demonstration;
keep fixture evaluation and diagnostics outside production source and bundles.

For a visual or performance proof, read `references/workflow.md`. For connecting an existing external
Inspector only, read `references/setup.md`. Keep all
Inspector instrumentation external to MetaFor source and runtime bundles.

## Handoff

Report the exact checkout, Cosmos state, iTerm TTY, checks performed, and
whether the visible contour remains running. Include CDP PID/profile/target
only when browser diagnostics were explicitly requested. Do not call
an isolated automated check owner-visible acceptance.
