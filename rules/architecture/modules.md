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
- `{name}.ts` — orchestrator;
- `{name}.helper.ts` or focused helper files — pure/local helper logic;
- `{name}.t.ts` — local types and interfaces;
- `store.ts` and `store.t.ts` — local store files only when the module truly owns that store.

Keep these roles separate.

Practical guidance:

- Keep `index.ts` and `index.t.ts` thin and focused on external API exposure.
- Keep one clear orchestrator as the coordination center for module behavior.
- Keep helpers narrow and composable instead of spreading orchestration across many helper files.
- Keep module types in `*.t.ts` rather than scattering them across runtime files.

## Forbidden

Do not:

- put core orchestration logic into `index.ts`;
- mix external API export concerns with helper internals in one file role;
- create local store files when the module does not own persistent store state.

## Checklist

- [ ] `index.ts` and `index.t.ts` are used as external API surfaces
- [ ] Orchestrator, helper, and type roles are separated
- [ ] Local store files exist only for true module-owned store state
