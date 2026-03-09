# Project Agent Guide

This file is the single entry point for any AI agent working in this project.

## Core rule

```text
Do not act from memory when a rule exists.
Read the relevant rule first, then act.
```

## Workflow

1. Identify the task trigger.
2. Read only the rule files required for that trigger.
3. Apply the rule.
4. Verify the result against the rule checklist.
5. Reply.

## Read at session start

Read these first:

- `rules/governance/session.md`
- `rules/governance/rules.edit.md`

## Trigger map

| Trigger | Rule |
| --- | --- |
| Working with session history or prior discussion | `rules/governance/session.md` |
| Creating a new rule | `rules/governance/rules.md` |
| Updating an existing rule | `rules/governance/rules.edit.md` |
| Using or defining tools/skills | `rules/governance/tools.md` |
| Writing or editing Markdown | `rules/engineering/markdown.md` |
| Writing or editing TSDoc | `rules/engineering/tsdoc.md` |
| Writing pure functions or handling mutation boundaries | `rules/engineering/fp.md` |
| Structuring a module | `rules/architecture/modules.md` |
| Structuring packages or placing stores | `rules/architecture/packages.md` |
| Building dependency or type graphs | `rules/architecture/graphs.md` |
| Working with MetaFor DSL or `meta.ts` | `rules/project/metafor.md` |

If a user reports an error after a rule was applied, reread that rule before changing anything.

## Context discipline

- Keep only this guide and currently relevant rules in working context.
- Do not preload all rules.
- Follow cross-links only when the current rule requires them.
- Prefer the smallest sufficient context.

## Response discipline

Unless the user requests otherwise:

- keep answers concise;
- state decisions clearly;
- avoid filler;
- follow the active rule rather than habit.

## Priority

Apply instruction sources in this order:

1. Direct user request
2. This file
3. The relevant file in `rules/`
4. Optional project-specific rule files

If two rules seem to conflict, reread the narrower rule first.
