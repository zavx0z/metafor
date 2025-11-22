# MetaFor

<div align="center">
  <img src="shared/img/metafor.gif" alt="metafor" width="444" />
</div>

**English** | [Русский](README.ru.md)

## Why MetaFor

MetaFor is a computational field for finite-state actors. Applications are decomposed into atoms that obey [Quantum Theory of Programming](atom/doc/qTp.md): topology governs every interaction instead of ad-hoc wiring. The framework gives humans and agents a common space where they can inspect processes, freeze time, and reason about branches without breaking actor isolation.

> ⚠️ Active development: authoritative API docs live in package Typedoc. This README captures the immutable rules.

## Field & forces

### Photon/impulse as an information carrier

- Each `Photon` in MetaFor mirrors a real photon: it transports event data across the field.
- Information is encoded in measurable properties:
  - **Intensity** → number of patches in `photon.impulses` (how “bright” the event is).
  - **Frequency / wavelength** → the `meta` + `atom` pair that identifies the source (the “colour” of the emitter).
  - **Polarisation** → JSON Patch `path` and `op`, describing the direction and type of mutation.
  - **Phase** → `timestamp` and the position inside the EM stack, defining relative timing.
  - **Superposition** → the target state of the receiving atom; reactions act as detectors deciding whether to resonate.
- This encoding lets any actor decode a photon without direct references to the sender—reading the impulse properties is enough.

### Positional paths

- Every atom gets an index path (`0/1/2`) from `Field`.
- The path is exposed via `self.path` and feeds reactions, inspectors, and history.
- When specifying a path manually (`Atom.fromSchema({ path })`), reserve it first (the helper factories handle that automatically).

### Reaction filters

- `reaction().filter(({ self, context }) => ...)` receives `SelfInfo` (no `destroy`) to keep filters pure.
- `equal` handlers get the full `Self` and may call `self.destroy()`.
- Conditions cover `meta`, `atom`, `path`, `op`, `value`, `timestamp` with the same operators you use in state transitions.

### Hierarchy

- `Fields` manages topology (parent, order, sequence) and maintains global impulse history (`Photon` chunks).
- `Atom.createSibling` / `Atom.append` wrap the low-level reservation API.
- Checkpoints allow rewinding the field to any timestamp.

## Actor architecture

### 1. Context — primitives only

```ts
.context((types) => ({
  name: types.string.required("Guest"),
  age: types.number.required(18),
  tags: types.array.required(["default"]),
  role: types.enum("user", "admin", "moderator").required("user"),
  isActive: types.boolean.required(true),
}))
```

- Allowed types: `string | number | boolean | enum | array`.
- `optional` defaults to `null`.
- Metadata is attached via `({ label: "..." })`.

### 2. Core — complex state

```ts
.core((ref) => ({
  users: new Map<number, User>(),
  cache: new LRUCache(),
  socket: null as WebSocket | null,
  formRef: ref(),
}))
```

- Stores heavy objects, services, DOM refs (`ref()` is for DOM only).
- Accessible in processes, reactions, and view hooks.

### 3. States — superposition

```ts
.states({
  idle: { loading: { userId: { gt: 0 } }, error: {} },
  loading: { success: { data: { notEq: null } }, error: {} },
  success: { idle: {}, editing: { mode: { eq: "edit" } } },
  error: { idle: {}, retry: { retryCount: { lt: 3 } } },
})
```

- Operators: `eq`, `gt`, `between`, `pattern`, `includes`, `isEmpty`, etc.
- `validateNoUnconditionalCycles` guarantees exits from every loop.

### 4. Processes — entering a state

```ts
.processes((process) => ({
  loading: process({ label: "Load" })
    .action(async ({ context }) => fetch(`/api/${context.userId}`))
    .success(({ update, data }) => update({ userName: data.name }))
    .error(({ update, error }) => update({ error: error.message })),
  destroy: process.destroy({ label: "Cleanup" }).before(({ core }) => core.socket?.close()),
}))
```

- Process name == state name (except `destroy`).
- `action` may be async; `success`/`error` remain sync.
- Use `process.destroy()` for teardown hooks.

### 5. Reactions — responding to foreign impulses

```ts
.reactions((reaction) => [
  [
    ["idle", "loading"],
    reaction({ label: "Message from child-user" })
      .filter(() => ({
        meta: "child-user",
        op: "replace",
        path: "/context",
        value: { userId: { gt: 0 } },
      }))
      .equal(({ update, patch, self }) => {
        update({ selectedUserId: patch.value.userId })
        if (patch.value.userId === 0) self.destroy()
      }),
  ],
])
```

- Always list explicit states (no `["*"]`).
- Keep filters declarative and side-effect free.

### 6. View — representation

```ts
.view({
  render: ({ context, state, html, update }) => html`
    <div class="component state-${state}">
      ${state === "idle"
        ? html`<button onclick=${() => update({ userId: 123 })}>Load</button>`
        : state === "loading"
        ? html`<div class="spinner">Loading…</div>`
        : html`<div>${context.userName}</div>`}
    </div>
  `,
  style: ({ css }) => css`.component { padding: 16px; }`,
})
```

- Pass context/core to child atoms via attributes.
- Move heavy allocations to core to keep renders cheap.

## Data transfer

```ts
render: ({ context, core, html }) => html`
  <meta-user-details context=${{ userId: context.selectedUserId }}></meta-user-details>
  <meta-messenger core=${{ socket: core.socket, apiService: core.apiService }}></meta-messenger>
`
```

- Context stays serializable.
- Core can expose shared resources when needed.

## Example actor

```ts
const userProfile = MetaFor("user-profile")
  .context((types) => ({
    userId: types.number.required(0),
    userName: types.string.required(""),
  }))
  .states({
    idle: { loading: { userId: { gt: 0 } } },
    loading: { success: {}, error: {} },
    success: { idle: {} },
    error: { idle: {} },
  })
  .core((ref) => ({ users: new Map(), formRef: ref() }))
  .processes((process) => ({
    loading: process()
      .action(async ({ context }) => fetch(`/api/users/${context.userId}`).then((r) => r.json()))
      .success(({ update, data }) => update({ userName: data.name })),
  }))
  .reactions(() => [])
  .view({
    render: ({ context, html }) => html`<div>${context.userName}</div>`,
  })
```

## Packages & documentation

| Package            | Purpose                                                        | Docs path                               |
| ------------------ | -------------------------------------------------------------- | --------------------------------------- |
| `@metafor/meta`    | Declarative schemas, `MetaFor()` chain                          | `meta/docs/typedoc/index.html`          |
| `@metafor/atom`    | Runtime, distributed state machine                              | `atom/docs/typedoc/index.html`          |
| `@metafor/inspect` | Impulse stack inspection, time control, logging                | `infra/inspect/docs/typedoc/index.html` |
| `@metafor/virtual` | Visualisation of the field and atom dependencies               | `infra/virtual/docs/typedoc/index.html` |

Always run `bun run docs` in each package before publishing: Typedoc is the source of truth for APIs.

## Workflow

1. **Describe** the actor via `MetaFor()` (context → states → core → processes → reactions → view).
2. **Materialise** it using `Atom.fromSchema`, `Atom.append`, or `Atom.createSibling`.
3. **Observe** impulses through `@metafor/inspect` / `@metafor/virtual`.
4. **Test** with Happy DOM (single `expect()` carrying a Russian message, remove temp files afterwards).
5. **Document** by regenerating Typedoc and syncing README with these rules.

## Project status

- Expect breaking changes while the framework evolves.
- Production usage is possible; lock package versions and track release notes.

