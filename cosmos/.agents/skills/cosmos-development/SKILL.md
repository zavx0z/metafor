---
name: cosmos-development
description: Design or document Cosmos architecture, package environments, artifact lifecycle, public contracts, or browser/Bun implementations. Use for owner docs, public types, TSDoc, build/release mechanics, and tests under cosmos; use metafor-dev additionally only when runtime or browser verification is required.
---

# Cosmos development

## Common contract before platform implementations

When browser and Bun perform the same responsibility with different technology,
define one public semantic interface and implement platform adapters behind it.
Describe the mechanism through that interface rather than as two unrelated
algorithms.

Keep genuinely different responsibilities separate. A shared interface must not
force browser Cache Storage policy, Bun filesystem publication, transport, or
cleanup into one contract merely because each touches package artifacts.

Use exact environment terminology from the public contract. In particular,
`service` is a Service Worker environment, `server` is a Bun process environment,
and `server-worker` is a Bun Worker environment.

## Documentation layers

The document owner stays short and semantic. It states:

- what the mechanism guarantees;
- why it exists;
- which component owns each decision;
- the smallest useful lifecycle or data-flow diagram;
- links to the public symbols that own the detailed mechanics.

Do not copy method lists, generic parameters, DTO fields, implementation steps,
or exhaustive error cases into the owner document.

Public interfaces, types, functions, and adapters carry complete TSDoc suitable
for TypeDoc. Explain there:

- responsibility and boundary of the symbol;
- type parameters and method contracts;
- lifecycle, state transitions, and invariants;
- browser and Bun adapter behavior;
- identity and byte-verification rules;
- fail-closed errors and unsupported cases;
- links to the tests proving important scenarios.

TypeDoc is the rendered view of source TSDoc. This repository currently has no
generated TypeDoc output. Until a real stable TypeDoc target exists, link owner
documents directly to the public source declaration containing the TSDoc; never
invent or preserve a broken TypeDoc URL. When generation is restored, replace
the source link with the stable symbol link instead of duplicating text.

Tests prove observable laws and failure paths. They do not replace the short
owner law or the detailed public contract.

## Before completing a change

Verify that the owner document, public symbols, adapters, and tests form one
consistent chain. Remove duplicated explanations and reject terminology that
collapses `env`, runtime technology, package namespace, and process identity.

Use `$metafor-dev` separately for Cosmos process lifecycle, browser state, or
live artifact verification; this skill does not own those operations.
