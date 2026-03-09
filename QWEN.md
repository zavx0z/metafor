# QWEN Guide

Entry map for agents that start from `QWEN.md`.

## Session start

Read first:

- `rules/governance/session.md`
- `rules/governance/rules.edit.md`

## Trigger map

| Trigger                                                                 | Rule                                |
| ----------------------------------------------------------------------- | ----------------------------------- |
| Working with session history or prior discussion                        | `rules/governance/session.md`       |
| Creating a new rule                                                     | `rules/governance/rules.md`         |
| Updating an existing rule                                               | `rules/governance/rules.edit.md`    |
| Using or defining tools/skills                                          | `rules/governance/tools.md`         |
| Writing or editing Markdown                                             | `rules/engineering/markdown.md`     |
| Writing or editing TSDoc                                                | `rules/engineering/tsdoc.md`        |
| Writing, moving, or reviewing tests                                     | `rules/engineering/testing.md`      |
| Test placement or monorepo test imports                                 | `rules/engineering/testing.md`      |
| Writing pure functions or handling mutation boundaries                  | `rules/engineering/fp.md`           |
| Structuring a module                                                    | `rules/architecture/modules.md`     |
| Package ownership, orchestration ownership, or cross-package boundaries | `rules/architecture/packages.md`    |
| Designing symmetric backend APIs                                        | `rules/architecture/backends.md`    |
| Building dependency or type graphs                                      | `rules/architecture/graphs.md`      |
| Working with package/domain store decisions or `$` store semantics      | `rules/project/stores.md`           |
| Working with CPU/GPU, server/client, adapters, or runtime classes       | `rules/project/runtime.adapters.md` |
| Naming decisions for stores or backend-local technical state            | `rules/project/naming.md`           |
| Working with MetaFor DSL or `meta.ts`                                   | `rules/project/metafor.md`          |

If multiple triggers apply, read all matched rules before implementation.
