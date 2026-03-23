[README](../README.md) | **English** | [Русский](./DEVELOPMENT.ru.md)

# Development

This document records the practical development mode of MetaFor before full inter-domain protocols exist.
It does not replace [Architecture](./ARCHITECTURE.md) and does not cancel the protocol layer described in [Protocol](./PROTOCOL.md).
Its role is to keep architectural invariants distinct from temporary development tactics.

## Fast Technical Entry

If you come to MetaFor as a developer first, keep this minimum model in view:

- read the system as `Domain × Force × Entity`,
- `Dark`, `Boundary`, and `Bulk` are parallel domains rather than runtime layers of one module,
- `Gravity`, `Electromagnetism`, `Strong`, and `Weak` are universal forces expressed in every domain,
- `gravity` is a relation and localization invariant across domains, not only hidden `Dark` connectivity,
- `Boundary` is the flattening boundary and `Field` is the imprint layer after flattening,
- `Dark` owns the domain ORM and the export of its object graph, `shared/orm` stays generic, and `shared/db` owns the flat DB-shaped shared data model,
- `enum` and `array` are topology-fields and must not be treated as ordinary value fields,
- `matter` is actor topology only: branch choice there may use only `state`, `enum`, and `array`, while HTML/text belong outside `matter`.

Recommended reading order for repository work:

1. [Ontology](./ONTOLOGY.md)
2. [Architecture](./ARCHITECTURE.md)
3. [Protocol](./PROTOCOL.md)
4. [Topology](./TOPOLOGY.md)
5. then return to this document for the current development mode.

## Purpose

MetaFor is built as a three-domain system:

- `Dark`,
- `Boundary`,
- `Bulk`.

These domains are architecturally isolated.
They must not be treated as internal layers of one runtime module.
In mature form they may live in different processes and communicate only through protocols.

Until the main functionality of the domains is proven, premature transport channels create more complexity than value.

The current development mode is therefore:

- domains remain isolated,
- production code gets no direct inter-domain imports,
- end-to-end checks happen only in tests,
- relative imports across domains are acceptable only in tests,
- stable protocols are designed after the core domain logic is proven.

## Architectural invariant

The system should be read as:

- `Dark` as the hidden domain,
- `Boundary` as the domain of fixation and canonicalization,
- `Bulk` as the domain of manifestation and execution.

These are not subpackages of one common runtime.
They are not stages of one linear pipeline.
They are not internal libraries for one another.

Therefore:

1. direct production imports from one domain into another are forbidden,
2. direct calls into another domain's internal API are forbidden in production code,
3. no domain should become a transport shortcut for another,
4. inter-domain communication must appear only as protocol channels,
5. until such channels exist, the domains are finished separately.

## Why it is simpler to avoid protocols before protocols

When core functionality is still unstable, a protocol fixes an external contract too early.
If that contract is fixed before the domains themselves are proven, the project risks:

- cementing the wrong exchange shape,
- making debugging harder by adding transport noise,
- hiding missing domain functionality behind an integration layer,
- fixing the channel instead of fixing the domain,
- introducing infrastructure complexity before the domain logic is defensible.

So the temporary order is:

1. bring `Dark`, `Boundary`, and `Bulk` to a minimally working state separately,
2. verify compatibility in tests,
3. only then formalize durable transport channels.

This does not reject protocols as an architectural goal.
It only says protocols must not outrun validated domain logic.

## Temporary integration mode

Before protocols exist, only one end-to-end verification path is allowed:

- integration tests,
- relative imports across domains only inside tests,
- explicit orchestration assembly for tests,
- no inter-domain imports in production code.

The repository currently uses `@github/zavx0z/git` as the shared place where such integration scenarios are exercised.

The following is acceptable:

- load `Dark` in a test,
- prepare a `Boundary` scenario in the same test,
- prepare a `Bulk` scenario in the same test,
- prove that the same logic stays coherent across all three domains.

The following is not acceptable:

- moving this temporary assembly into production code,
- turning test assembly into a permanent architectural rule,
- presenting direct imports as a normal communication path,
- hiding the absence of a protocol behind internal neighbor calls.

## Environment lifecycle and worker responsibility

Since MetaFor domains should be thought of as isolated environments that may live in separate workers or processes, a full lifecycle reset is not an internal responsibility of the domain itself.

This means:

- a domain store should not expose production-grade full reset operations,
- snapshot and restore should not become the main production API of a domain,
- domain restart should not be expressed as an internal runtime shortcut.

If a clean restart is needed, it should happen at the outer execution environment:

- destroy the worker,
- create a new worker,
- start the domain again in a clean environment.

Consequently, reset, clear, restore, and snapshot belong to test-only or harness-level infrastructure, not to the main production communication path.

## Practical rule

Until real channels exist, the order should stay:

1. a domain implements its own responsibility,
2. the domain is tested on its own level,
3. an integration test temporarily assembles the domains through relative imports,
4. once the core functionality stabilizes, the protocol is formalized,
5. the temporary assembly is removed or demoted to protocol verification.

## What this gives

This development mode helps:

- preserve hard architectural isolation,
- prevent temporary glue from becoming a permanent dependency,
- validate core functionality faster,
- localize errors more clearly,
- avoid premature protocol design,
- move to real channels only after the domain form becomes stable.

## The boundary of what is allowed

### Allowed

- relative imports across domains in tests,
- temporary orchestration glue in tests,
- verification of a shared scenario without a formal transport layer.

### Not allowed

- direct production imports across domains,
- exporting one domain's internals as another domain's API,
- production assembly without a protocol,
- turning the testing path into an architectural norm.

## When to move to protocols

Move to protocols only after:

1. the hidden functionality of `Dark` is stable,
2. the fixation and state-computation functionality of `Boundary` is stable,
3. the execution functionality of `Bulk` is stable,
4. the end-to-end path is already proven in tests,
5. the actual required channel is clear enough to formalize.

Only then does the transport layer stop being speculation and become the expression of a validated contract.
