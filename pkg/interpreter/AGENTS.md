# Interpreter Package Rules

This file defines local development rules for `pkg/interpreter`. Follow it for every change inside this package.

## Product Model

`@metafor/interpreter` is a live interpreter for MetaFor Bun modules. It is not a WebStorm/Chrome debugger wrapper and UI text must not describe the product as a debugger or inspector.

The product concept is: a human and AI share one live runtime/source context, can inspect execution, set breakpoints, step, evaluate expressions, and change code while the module is running.

Protocol names such as `Debugger.paused`, `Debugger.scriptParsed`, `Runtime.getProperties`, and Bun's protocol flags are internal implementation details. They can remain in protocol adapters, tests, and low-level event streams, but user-facing labels, package docs, logs intended for people, and UI controls should use interpreter/module/runtime language.

## Display Model

The interpreter UI uses one WebGPU `Space` and one browser canvas, but every launched module is rendered into its own equal `UIDisplay`.

Treat every module `UIDisplay` as a separate physical device:

- no default display;
- no primary/main display;
- no default session;
- no shared selected module;
- no global "active interpreter" that affects another display;
- no UI panel toggle that opens/closes the same panel on multiple displays;
- no focus stealing between displays;
- no logic that assumes the left display is special;
- no cross-display terminal, events, breakpoint, source, frame, scope, or toolbar state.

If two modules are running, the expected mental model is two independent interpreter devices placed in one 3D `Space`. Browser layout is only the current host. Future XR hosts must be able to embed the same displays as independent devices.

Every display-specific object must be keyed by `moduleId` or owned by `ModuleDisplayController`:

- toolbar state;
- source state;
- stack/frame state;
- scopes state;
- terminal buffer and terminal input state;
- events/verbose visibility and scroll state;
- breakpoint markers and pending breakpoint lines;
- active command state;
- focus and caret restoration.

Do not introduce package-level mutable UI state unless it is truly global host state. Locale is global. WebSocket connection to the interpreter host is global. Module/display UI state is not global.

## Module Scoping

All runtime actions are module-scoped:

- REST paths use `/modules/:id/...`;
- WebSocket commands must include `moduleId`;
- source loading is module-scoped;
- breakpoints are stored and applied per module;
- command replies update only the display for the command's module;
- protocol events with `moduleId` go only to that module display.

The API surface intentionally has no global `/breakpoint`, no global `/source`, no global `/command`, and no implicit current module.

## Interpreter REST API

The interpreter exposes a shared REST API for user, agent, voice, and host control of the interpreter environment. Use it instead of clicking the UI when the user asks to move between interpreter displays or to show/dock the host terminal HUD.

Default base URL:

```text
http://127.0.0.1:6500
```

Before acting, read current state:

```sh
curl -s http://127.0.0.1:6500/displays
curl -s http://127.0.0.1:6500/hud/terminal
```

Display API:

- `GET /displays` returns `mode`, `activeDisplayId`, and `displays[]`.
- Each display includes `displayId`, `kind`, `moduleId`, `label`, `order`, `screenCenter`, `screenRect`, `visible`, `active`, and `hovered`. SQLite displays have `kind:"sqlite"` and `moduleId:null`.
- `POST /displays/focus` focuses one display.
- `POST /displays/frame` returns the overview of all displays.

Interpreter workspace API:

- `GET /interpreters` returns each module interpreter workspace: display geometry, runtime status, current UI source/frame context, terminal input state with `textTail`, and supported actions.
- `POST /interpreters/resolve` resolves one interpreter from the same selector shape as display focus and returns its workspace payload.
- `POST /interpreters/focus` focuses one interpreter display and returns that interpreter workspace payload.
- `POST /interpreters/action` runs a display-scoped action in one interpreter. Body shape: `{"selector":{...},"action":"pause|resume|step|evaluate|source.open|source.openSelection|restart|stop|showExecutionPoint","params":{...}}`.
- `evaluate` accepts `{"expr":"...","frame":0}` and writes the agent expression/result into the module terminal so the human sees the shared action. Agent terminal entries are replayed after UI reload for the same target run.
- `source.open` accepts `{"sourceUrl":"..."}` or `{"specifier":"./file.ts"}` and opens that source in the interpreter display. If the resolved path ends with `.sqlite`, it opens the database as a separate SQLite display instead of treating it as a runnable module.
- `source.openSelection` resolves the current selected import/path from the interpreter context and opens it in the same display.
- `step` accepts `{"kind":"over"|"into"|"out"}`.

SQLite display API:

- Startup CLI args ending with `.sqlite` are display inputs, not runnable modules: `bun --hot run pkg/interpreter/interpreter.ts dark/server.spec.ts -timeout=2147483647 boundary/server.spec.ts dark/tmp/boundary.sqlite`. The display can be created before the file exists; UI waits and retries until the runtime creates the database.
- `GET /sqlite?path=<file.sqlite>&table=<name>` returns tables, schema, and rows for a database.
- `POST /sqlite/open` with `{"path":"dark/tmp/boundary.sqlite"}` opens a SQLite database as a separate display.
- `POST /sqlite/cell` with `{"path","table","rowid","column","value"}` edits one table cell by SQLite `rowid`. Views are read-only.

Display selectors accepted by `/displays/focus`:

```json
{"selector":{"side":"left"}}
{"selector":{"side":"right"}}
{"selector":{"displayId":"module:dark-server.spec.ts"}}
{"selector":{"moduleId":"dark-server.spec.ts"}}
{"selector":{"label":"dark/server.spec.ts"}}
{"selector":{"order":0}}
```

Focusing a display must not change the host terminal HUD unless the user explicitly asks for that. Do not dock, hide, show, or toggle the terminal while answering a display-only request such as "open the left display". If the terminal should be docked as part of a focus request, the API requires explicit intent:

```sh
curl -sS -X POST http://127.0.0.1:6500/displays/focus \
  -H 'content-type: application/json' \
  -d '{"selector":{"side":"left"},"dockHostTerminal":true}'
```

For normal display focus, omit `dockHostTerminal`:

```sh
curl -sS -X POST http://127.0.0.1:6500/displays/focus \
  -H 'content-type: application/json' \
  -d '{"selector":{"side":"left"}}'
```

For collaboration on a concrete interpreter, use `/interpreters/*` instead of guessing the module id from screen position:

```sh
curl -sS http://127.0.0.1:6500/interpreters

curl -sS -X POST http://127.0.0.1:6500/interpreters/action \
  -H 'content-type: application/json' \
  -d '{"selector":{"side":"left"},"action":"evaluate","params":{"expr":"globalThis.location","frame":0}}'
```

Terminal HUD API:

- `GET /hud/terminal` returns `docked`, `sessionId`, `status`, `statusLabel`, `rect`, and `dockPlacement`.
- `POST /hud/terminal/show` opens the host terminal HUD.
- `POST /hud/terminal/dock` docks/hides the host terminal HUD.
- `POST /hud/terminal/toggle` switches between those states.

Use terminal endpoints only for terminal requests. If the user says "show terminal", call `/hud/terminal/show`. If the user says "hide/dock terminal", call `/hud/terminal/dock`. If the user asks for a display transition, call only `/displays/*`.

## UI Architecture

`web/main.ts` is the browser host/controller layer. It creates `UiRuntime`, maps modules to `UIDisplay`, and wires module-scoped snapshots to panes.

Pane classes under `web/*-pane.ts` must stay reusable and display-local. A pane must not read or write another module display's state.

Generic panes under `ui/panes` must not learn interpreter-specific concepts. For example, `TerminalPane` may know about terminal buffers, ANSI, keyboard input, focus, and caret behavior, but it must not know about module state, breakpoints, Bun, protocol commands, or interpreter snapshots. Interpreter-specific terminal behavior belongs in `pkg/interpreter/web/main.ts` or a package-local helper.

The browser page is only a host for one WebGPU canvas. Do not add hidden/default runtime surfaces for interpreter content. Interpreter panels must be attached to module `UIDisplay` instances.

## Terminal Input

The module terminal is both module output and expression input.

Interpreter expression input must live in the terminal, not in a separate Eval panel. The user-facing language is "expression"; internal command names may remain `eval` where they map directly to protocol behavior.

Terminal input is available only for the owning module when that module:

- is connected;
- is paused;
- has a current dump/frame context;
- has not exited or failed;
- is not already running another command.

Terminal focus/caret behavior is display-local. Clicking or focusing one module terminal must not focus or enable input in another module terminal. Restoring focus after reload must restore only the previously focused module terminal, never the first/left display.

Focused input caret blinking is allowed. Do not add render loops or timer repaint work outside focused input caret behavior.

## Rendering Rules

The MetaFor UI engine is request-render based. Do not add continuous render loops, periodic repaint timers, or repeated diagnostic repaints. Repaint only from state changes, input events, WebSocket/module events, resize/layout changes, or focused input caret blink.

After a browser reload or hot reload, a grey canvas in an immediate screenshot may simply mean WebGPU has not presented yet. Wait before concluding the UI is blank. Do not add permanent repaint logic just to satisfy an early screenshot.

When testing with screenshots, wait for the UI to settle before capture. For Chrome automation use the local Chrome service and target the exact browser window/tab.

## CLI And Launching

The root package script is the supported entrypoint:

```sh
bun run interpreter
```

Launching modules directly through the interpreter supports relative and absolute paths:

```sh
bun run interpreter ./module.ts
bun run interpreter ./module.spec.ts -timeout=2147483647
bun run interpreter dark/server.spec.ts -timeout=2147483647 pkg/interpreter/src/syntax.test.ts
```

CLI parsing rules:

- module paths are passed without `--module`;
- parameters begin with `-`;
- parameters between two module paths belong to the preceding module;
- `-param=value` is valid;
- params before the first module path are invalid;
- module id/label comes from the launched module path unless explicitly supplied through REST.

Default startup modules use pause-on-start so the user can set breakpoints before execution continues.

## Naming

Use interpreter terminology in user-visible names:

- interpreter;
- module;
- runtime;
- expression;
- execution point;
- breakpoint;
- event stream;
- terminal/output.

Avoid user-facing names:

- debugger;
- inspector;
- session default;
- default display;
- main display;
- attach to WebStorm.

Internal protocol references may use exact protocol names when necessary.

## State And Persistence

Interpreter state is written under `.metafor/interpreter/`. Per-module state belongs under module-specific ids/paths.

LocalStorage keys in the UI must be scoped by module id when they affect one display. Shared LocalStorage keys are allowed only for truly global preferences such as locale.

Never use `default` as a module/session/display identifier.

## Breakpoints

Breakpoints are module-scoped and must be matched against the owning module's source identity.

Editor gutter clicks in one display may only set/remove breakpoints for that display's module. Badge counts and marker rendering must use the same module-scoped matching logic.

Prefer logical source matching helpers from `web/breakpoint-matching.ts` and source map helpers from `src/source-map.ts`; do not reintroduce ad hoc global breakpoint matching.

## Events

Verbose/event panels are per display. Toggling events on one display must not show/hide cards on any other display.

Interpreter-level events without a `moduleId` may be appended to all displays only when they are genuinely host-level. Module protocol and target events must route by `moduleId`.

Event copy/clear controls operate only on the display where the user clicked.

## Tests And Verification

Run focused tests for the files touched, then the package checks when changing shared behavior:

```sh
bun run --filter @metafor/interpreter typecheck
bun run --filter @ui/panes typecheck
bun test pkg/interpreter/src/*.test.ts pkg/interpreter/web/*.test.ts ui/panes/**/*.test.ts
git diff --check
```

For UI changes, verify:

- one module display works alone;
- two module displays remain independent;
- clicking controls on one display does not affect another display;
- terminal focus/input/caret is per display;
- breakpoints set in one display do not appear in another unless they belong to that module's source;
- module completion disables only meaningless controls for that module;
- reload/hot reload restores displays without creating default/hidden displays.

## Documentation

Keep these files aligned when behavior changes:

- `README.md` for primary usage;
- `docs/architecture.md` for structure and invariants;
- `docs/api.md` for REST/WS contracts;
- `docs/workflow.md` for launch and live workflow;
- `docs/troubleshooting.md` for known failure modes;
- `docs/acceptance.md` for manual acceptance flow.

Remove obsolete debugger/inspector/WebStorm wording when it becomes user-facing documentation. Internal protocol references can remain when they describe Bun's protocol accurately.
