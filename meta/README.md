# @metafor/meta

[← Back to root](../README.md) | **English** | [Русский](README.ru.md)

## Purpose

- The `MetaFor()` factory describes an actor declaratively: context → states → core → processes → reactions → view.
- The output is a pure `Meta` schema that can be consumed by `@metafor/atom`, no-code tools, or autonomous agents.
- README captures the rules; precise signatures live in Typedoc (`meta/docs/typedoc/index.html`).

## `MetaFor()` chain

```ts
const component = MetaFor("user-profile", { desc: "User card" })
  .context(/* 1 */)
  .states(/* 2 */)
  .core(/* 3 */)
  .processes(/* 4 */)
  .reactions(/* 5 */)
  .view(/* 6 */)
```

Each call returns the next stage without mutating previous ones, so the resulting schema stays immutable.

### Photon semantics

The schema tells the runtime how a photon will encode data:

- `context` defines which values can be written into the impulse payload (`value`).
- `states` act as detectors that decide whether the photon collapses the superposition.
- `processes` control intensity (how many patches) and phase (execution order).
- `reactions` provide polarisation filters via `filter` → `path/op/value`.

Without the schema a photon would be meaningless; with it, every change is encoded in measurable properties exactly like in the physical analogy.

### 1. `context(types => schema)`

- Allowed value types: `string | number | boolean | enum | array`.
- `optional` fields default to `null`.
- Metadata is appended via `({ label: "..." })`.
- The `types` helper comes from `@zavx0z/context`.

### 2. `states(superposition)`

- Describes the finite-state machine and its guard conditions.
- Operators match the reaction DSL (`eq`, `gt`, `between`, `pattern`, `includes`, `isEmpty`, etc.).
- `validateNoUnconditionalCycles` guarantees there is an exit from each loop.

### 3. `core(initializer?)`

- Holds heavy objects, services, DOM refs (`ref()` is for DOM only).
- Accepts either a function or a plain object; the result is stored inside the schema.

### 4. `processes(builder)`

- The process name mirrors the state name (except `process.destroy()`).
- `action` may be async; `success`/`error` are always sync.
- `process.destroy({ label }).before(fn)` describes teardown logic.

### 5. `reactions(builder)`

- Filters (`reaction().filter(({ self, context }) => conditions)`) operate on `SelfInfo` (no `destroy`).
- `equal` handlers receive the full `Self`, `update`, `context`, `core`, `patch`, `timestamp`.
- Each entry in the returned array is `[states[], reaction]` — list states explicitly (never `["*"]`).

### 6. `view({ render, style })`

- `render` uses `html` from `@zavx0z/template` and receives `{ context, state, core, update, html }`.
- `style` defines scoped CSS via `{ css }`.
- Child atoms consume data via `context={...}` / `core={...}` attributes.

## Helper types

| Type                  | Description                                              |
| --------------------- | -------------------------------------------------------- |
| `MetaForConfig`       | Optional `desc`/`dev` flags for the schema               |
| `Meta<C, S, I>`       | Final structure interpreted by `@metafor/atom`           |
| `ViewDefinitionParams`| Arguments passed to `render` (`context`, `state`, etc.)  |
| `Superposition`       | Type that describes state transitions                    |
| `ProcessesDeclaration`| Builder for processes (`process`, `process.destroy`)     |
| `ReactionsDeclaration`| Builder for reactions with declarative filters           |

Typedoc documents every field in detail.

## Scripts

| Command             | Purpose                                           |
| ------------------- | ------------------------------------------------- |
| `bun run build`     | Production + dev builds                           |
| `bun run build:watch` | Dev build with watch mode                      |
| `bun run typegen`   | `dist/index.d.ts` via dts-bundle-generator        |
| `bun run docs`      | Typedoc (`meta/docs/typedoc/index.html`)          |
| `bun run clear`     | Remove `dist` and `node_modules`                  |

## Docs & tests

- **Typedoc** — run `bun run docs`; it’s the single source of truth for API signatures.
- **Tests** — `bun test --filter meta` (Happy DOM, a single `expect()` with a short Russian description, clean temp files).
- **Publish** — `bun run build && bun run typegen && bun publish --access public`.

Behavioural examples live in `meta/*.spec.ts` / `meta/*.t.ts`. Field-level principles are documented in `../.cursor/rules/metafor.mdc`.

