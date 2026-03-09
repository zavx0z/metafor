# Module Structure

This rule defines the expected file roles inside a module.

## Purpose

Keep module structure predictable by assigning one clear responsibility to each file role.

## When to apply

Apply this rule when creating or restructuring module files.

## Requirements

File roles:

- `index.ts` — external runtime API surface;
- `index.t.ts` — external type API surface when needed;
- one or more focused preparation modules when the module owns a preparation stage;
- `{name}.ts` — orchestrator;
- branch-specific modules such as `cpu.ts`, `gpu.ts`, `server.ts`, or `client.ts` — post-branch implementation entry points when relevant;
- `{name}.helper.ts` or focused helper files — pure/local helper logic;
- `{name}.t.ts` — local types and interfaces;
- `store.ts` and `store.t.ts` — local store files only when the module truly owns that store.

Keep these roles separate.

Practical guidance:

- Keep `index.ts` and `index.t.ts` thin and focused on external API exposure.
- Keep preparation logic in one or more focused preparation modules when stage boundaries exist.
- Keep one clear orchestrator as the coordination center for module behavior.
- Keep branch-specific materialization in branch modules rather than mixing all branches into generic helper files.
- Keep helpers narrow and composable instead of spreading orchestration across many helper files.
- Keep module types in `*.t.ts` rather than scattering them across runtime files.

## Forbidden

Do not:

- put core orchestration logic into `index.ts`;
- mix external API export concerns with helper internals in one file role;
- scatter one module responsibility across multiple files without a clear orchestrator center;
- create local store files when the module does not own persistent store state.

## Checklist

- [ ] `index.ts` and `index.t.ts` are used as external API surfaces
- [ ] Orchestrator, helper, and type roles are separated
- [ ] Local store files exist only for true module-owned store state
