# Module Structure

This rule defines the expected structure and responsibilities of a module.

## Purpose

A module should expose a clear external API while keeping internal coordination explicit.

## When to apply

Apply this rule when creating or restructuring a module.

## Requirements

Preferred file roles:

- `index.ts` — external runtime API only, usually re-exports;
- `index.t.ts` — external type API only, when needed;
- `{name}.ts` — module orchestrator;
- `{name}.t.ts` — types and interfaces;
- `store.ts` / `store.t.ts` — local store pair when the module owns persistent state;
- `{name}.spec.ts` — tests when needed.

Keep responsibilities separate:

- `index*` files expose the public surface;
- orchestrators coordinate internal parts and effects;
- helper files hold pure transformations;
- type files hold types only.

## Forbidden

Do not:

- place core logic in `index.ts`;
- mix public re-exports with private helper code;
- scatter one module responsibility across unrelated files without a clear center;
- create a store without a clear ownership boundary.

## Checklist

- [ ] Public API is exposed through `index.ts`
- [ ] The orchestrator is the coordination point
- [ ] Types live in `*.t.ts`
- [ ] Helpers stay focused
- [ ] Store files exist only when the module owns state
