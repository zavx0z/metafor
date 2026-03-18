[README](../README.md) | **English** | [Русский](./ARCHITECTURE.ru.md)

# Architecture

This document describes the architectural projection of MetaFor and fixes its invariants.
It translates ontology into domain responsibilities and repository projection.
Operational planning is outside the scope of this document.

## Rule of architectural reading

MetaFor architecture should be read as a projection of ontology:

`Domain × Force × Entity`

This means:

1. first determine the domain,
2. then the role of force inside that domain,
3. then the entity and its contract,
4. only after that speak about files and directories.

The architectural reading stands on three domains:

- `Dark` as the domain of hidden connectivity, particles and threads of connectivity, historical continuity, fixed states, structured changes, and model evolution,
- `Boundary` as the domain of fixation, flattening, and canonicalization,
- `Bulk` as the domain of manifestation, execution, and observable form.

`Dark` is not identical to runtime `Boundary`.
`Dark` is not identical to runtime `Bulk`.
`Dark` is not just a grouping of files.

## Domain isolation

Domain isolation is an architectural invariant.

This means:

1. `Dark`, `Boundary`, and `Bulk` must not be read as internal subpackages of one runtime module,
2. domains must not become direct production dependencies of each other,
3. domains should be thinkable as capable of living in different processes,
4. inter-domain communication must appear only through protocols,
5. the absence of a protocol does not justify direct cross-domain imports.

Therefore:

- production code must not directly import one domain into another,
- relative imports across domains are acceptable only in tests,
- temporary testing glue must not become architectural norm,
- no domain should export its internals as the production API of another domain.

The current temporary development mode is fixed in [Development](./DEVELOPMENT.md).

## Scheme of architectural reading

One of the basic architectural readings distinguishes four levels:

1. `DSL` gives the declarative description of an entity.
2. `AST` gives the serializable technical contract.
3. `Dark` gives the layer of hidden connectivity and structural continuity: particles and threads of connectivity, schema history, fixed states, structured changes, historical memory, and version organization.
4. `Boundary` and `Bulk` are parallel domain projections of that hidden basis.

This reading concerns architectural meaning, not a mandatory runtime stage order.

The distinction between ordinary data-fields and topology-fields is primary relative to AST:
`enum` and `array` belong to topology by nature, while AST only unfolds the distinction into a serializable contract.
They must not be treated as ordinary value fields.

The hidden connectivity layer of `Dark`, including particles, threads, and addressing, is formalized separately in [Topology](./TOPOLOGY.md).

Ontologically, `Boundary` and `Bulk` share the same source in `Dark`, but technically each domain loads its own `DSL/AST` contracts and retains its own data ownership at runtime.
Inter-domain interaction is distributed across force-channels and cannot be reduced to one `Electromagnetism` channel.

## Domains

### Dark

`Dark` is the domain of hidden connectivity, hierarchy, memory, fixed states, structured changes, and model evolution.

`Dark` must not:

1. be read as a synonym for runtime `Boundary`,
2. be read as a synonym for runtime `Bulk`,
3. collapse into a nameless storage layer with no ontological responsibility,
4. absorb boundary canonicalization or `Bulk` execution,
5. import `Boundary` or `Bulk` as runtime production dependencies.

`Dark` must:

1. hold the hidden structural frame,
2. hold schema history and historical continuity,
3. be the place of hidden model evolution,
4. provide the basis for parallel projection toward `Boundary` and `Bulk`,
5. remain an isolated domain rather than an internal helper layer of lower domains.

### Boundary

`Boundary` is the domain of fixation, canonicalization, indexing, and state computation.
It is the flattening boundary and the layer of imprint fixation:
here connectivity receives a fixable imprint as `Field` in a form fit for deterministic computation.

`Boundary` must not:

1. know the processes of `Bulk`,
2. execute application actions,
3. contain top-level semantic ownership,
4. import `Dark` or `Bulk` as direct runtime production dependencies.

`Boundary` must:

1. bring structure into canonical form,
2. hold a compact representation,
3. compute state transition,
4. provide addressable execution space,
5. remain the domain of fixation rather than the hidden origin of the world,
6. preserve its own data ownership even with a common ontological source in `Dark`.

### Bulk

`Bulk` is the domain of manifestation, composition, execution, and interaction delivery.
It is built as the volumetric manifestation of hidden `Dark` connectivity, but it is neither identical to `Dark` nor a second hidden ontology.

`Bulk` must not:

1. duplicate state computation of `Boundary`,
2. become a second source of truth for canonical domain storage,
3. replace `DSL` or `AST`,
4. import `Dark` or `Boundary` as direct runtime production dependencies.

`Bulk` must:

1. assemble the manifested set of actors,
2. connect them with manifested structural connectivity and binding,
3. interpret state change as execution,
4. unfold intention into process,
5. remain the domain of manifestation rather than hidden historical memory,
6. preserve its own runtime data and process ownership.

## Force projection by domain

### Dark × Gravity

Role:

1. hidden hierarchy,
2. the `Graviton` channel as the inner protocol of relation and localization in hidden organization,
3. schema organization,
4. deep structural localization of hidden structure,
5. geometry of hidden versions and their continuity.

Here belong:

1. organization of the hidden network of schema connectivity, fixed states, and versions,
2. latent hierarchy of the model,
3. `Graviton` as the carrier of the Dark projection of gravitational relations and localization invariants,
4. structural distinguishability that must not be confused with runtime index.

### Dark × Higgs

Role:

1. topology-fields as hidden Higgs fields,
2. branch selection through `enum`,
3. branch multiplicity and unfolding through `array`,
4. topology change as distinct from ordinary field mutation,
5. coordination of topology change with the Dark projection of gravity.

Here belong:

1. the rules of topology-fields in hidden structure,
2. the restrictions on `enum` as topology selection and on `array` as inner multiplicity of branches,
3. observation of global structural consequences of topology change,
4. reading an atom as multiplicity once branches are unfolded,
5. hidden retention of topology and its localization frame without turning `Dark` into a runtime orchestrator.

### Dark × Strong

Role:

1. persistence of structural memory,
2. coherence of schemas,
3. change of ordinary `Field` values through `Gluon` without connectivity break,
4. coherence of fixed states and historical continuity,
5. retention of the hidden structural frame,
6. hidden stability of identity.

### Dark × Weak

Role:

1. schema evolution,
2. active hidden transition through `W boson`,
3. neutral transitional mediation through `Z boson`,
4. mutation and transformation of hidden structure,
5. reconfiguration of hidden organization through structured changes,
6. change of the model before its projections into `Boundary` and `Bulk`.

### Dark × Electromagnetism

Role:

1. projection toward other domains,
2. transport of `State` in observable form through `Photon`,
3. signaling hidden change as a state signal,
4. propagation of state-born updates,
5. transport of domain state into projections,
6. exposure of `Impulse` as the content of state change.

### Boundary × Gravity

Role:

1. flattening,
2. geometry of the boundary,
3. index space,
4. addressability,
5. distribution of entities in execution space.

### Boundary × Strong

Role:

1. canonicalization,
2. change of ordinary `Field` values through `Gluon`,
3. deduplication,
4. interning,
5. compaction,
6. retention of coherent boundary form.

### Boundary × Higgs

Role:

1. canonical fixation of topology-fields,
2. topology selection through `enum`,
3. branch multiplicity through `array`,
4. rejection of the ordinary field-update regime for both `enum` and `array`,
5. prohibition of external reactive mutation of `array`,
6. distinction between topology change and ordinary field update.

Architecturally this layer fixes the contract of topology-fields on the boundary.
`Higgs boson` does not transport `State` and does not change ordinary `Field`; it determines which branch exists and how many branches must be manifested as topology change rather than ordinary value mutation.

### Boundary × Weak

Role:

1. computation of conditions,
2. transition logic,
3. active transition through `W boson`,
4. neutral mediation of transition logic through `Z boson`,
5. state evolution,
6. computation step.

### Boundary × Electromagnetism

Role:

1. transfer of `State` as `Photon`,
2. serialization,
3. fixation of `Impulse`,
4. synchronization contract,
5. signal transfer on the boundary.

### Bulk × Gravity

Role:

1. manifested structural organization,
2. geometry of actors,
3. manifested hierarchy,
4. relation between identity and index,
5. manifested mass, volume, and structural differences of actors.

### Bulk × Strong

Role:

1. stable binding,
2. change of ordinary `Field` values through `Gluon`,
3. projection of entanglement,
4. retention of coherence in composite manifested structure.

### Bulk × Higgs

Role:

1. manifested structural reconfiguration,
2. unfolding of branch multiplicity,
3. topology change through `Higgs boson`,
4. reading unfolded branches as the composition of the manifested world.

### Bulk × Weak

Role:

1. process execution,
2. active manifested transition through `W boson`,
3. inner coupling of transitional states through `Z boson`,
4. lifecycle after state change,
5. handling of intention,
6. completion of the tact after execution.

### Bulk × Electromagnetism

Role:

1. delivery of events,
2. signal propagation,
3. distributed interaction,
4. transport of changes between active parts of the system.

## Entities and their boundaries

In code projection an entity is first fixed at the domain level.
When there is an explicit `store.ts`, that store becomes the place where the entity is held.

This means:

1. domain storage is the holder of the entity,
2. force modules do not own the entity as the source of truth,
3. force modules read, connect, change, or execute what is held in domain storage,
4. `store.t.ts` gives the type contract of that entity at the domain level.

### Brane

`Brane` is the bearer of configuration, state, and connectivity.

1. In `Dark` it exists as a hidden structural unit and bearer of hidden continuity.
2. In `Boundary` it exists as a canonical structural unit.
3. In `Bulk` it exists as a manifested participant in volumetric structure and execution.

### Field

`Field` is the entity coupled to `Brane` that gives values, differences, and inner determination.

1. `Brane` and `Field` form a coupled pair of one structural unit.
2. `Field` must not be understood as a subordinate helper of `Brane`.
3. In `Dark`, `Field` expresses the inner determination of the hidden structural unit.
4. In `Boundary`, `Field` expresses the inner determination of the canonical unit and the imprint fixed after flattening.
5. In `Bulk`, `Field` expresses the inner determination of the manifested and executable unit.

Architecturally, `Field` splits into:

1. ordinary data-fields,
2. topology-fields.

`enum` and `array` are topology-fields by type nature.
`enum` gives topology selection and is not a generic bounded literal field.
`array` gives topology multiplicity and branch unfolding and is not a generic mutable collection.
Neither `enum` nor `array` is an ordinary value field.
Neither belongs to the ordinary field-update regime.
Both change as topology change through `Higgs boson`, not as ordinary value mutation.
`array` does not participate in entanglement, is not mutated by external reactions, and may change only through the atom's internal process by way of state change.

### State

1. In `Dark`, `State` means hidden continuity of form between versions rather than the current runtime state.
2. In `Boundary`, `State` is computed and canonicalized.
3. In `Bulk`, `State` is interpreted and executed without ceasing to be part of the domain entity.

### Transition

1. In `Dark`, `Transition` means the historical shift of structure between versions rather than executable action.
2. In `Boundary`, `Transition` is computed.
3. In `Bulk`, `Transition` unfolds as execution.

### Process

`Process` belongs first of all to `Bulk × Weak`.
At the same time, the three-domain reading distinguishes hidden and manifested sides of process.

1. In `Dark`, `Process` is read only as the historical line of model change.
2. `Boundary` knows only the form of process needed to compute the state contract.
3. `Bulk` unfolds process as action.

### Boson

`Boson` is the common architectural type of force-channel and transport unit.
It is not a force and does not coincide with `Impulse`.

1. `Gravity` uses `Graviton`.
2. `Electromagnetism` uses `Photon`.
3. `Strong` uses `Gluon`.
4. topology-field change uses `Higgs boson`.
5. `Weak` uses `W boson` and `Z boson`.
6. `Boson` subtypes belong to different forces or to the topology-field channel and do not collapse into one another.

### Photon

`Photon` is the subtype of `Boson` that belongs to `Electromagnetism`.

1. `State` is transported through `Photon`.
2. Between `Boundary` and `Bulk`, observable state transfer is read as `Photon`.
3. In `Boundary`, `Photon` is fixed as the arrival signal of state.
4. In `Bulk`, `Photon` unfolds delivered state into event or action.

### Graviton

`Graviton` is the subtype of `Boson` that belongs to `Gravity`.

1. `Graviton` is not identical to the force `Gravity`.
2. It belongs to the structural protocol of relation, localization, and organization.
3. In the architectural reading of `Dark`, hidden organization and addressability are one domain projection of `Graviton`, not the whole meaning of `Gravity`.
4. Its consequences may be manifested, but it is not an observable event of the level of `Photon`.

### Gluon

`Gluon` is the subtype of `Boson` that belongs to `Strong`.

1. `Gluon` is not identical to the force `Strong`.
2. Ordinary `Field` values change through `Gluon`.
3. In `Boundary`, `Gluon` fixes the canonical change of ordinary value.
4. In `Bulk`, `Gluon` unfolds the applied change of ordinary value.
5. `Gluon` does not change topology-fields and does not replace `Higgs boson`.

### Higgs boson

`Higgs boson` is the subtype of `Boson` that belongs to topology-field change.

1. Topology-fields change through `Higgs boson`.
2. `Higgs boson` does not transport `State`.
3. `Higgs boson` does not change ordinary field values.
4. It changes branch selection and branch multiplicity.
5. In the architectural reading, `Dark` can observe the global structural consequences of this change together with `Electromagnetism` and `Gravity`, but it must not become a runtime orchestrator.

### W boson

`W boson` is the subtype of `Boson` that belongs to `Weak`.

1. `W boson` carries active transition between states.
2. In `Boundary`, it belongs to the computed step of state change.
3. In `Bulk`, it unfolds the transition as executable action.
4. It is not the channel of observable propagation on the level of `Photon`.

### Z boson

`Z boson` is the subtype of `Boson` that belongs to `Weak`.

1. `Z boson` holds neutral mediation of transition and the inner coupling of transitional states.
2. In `Boundary`, it belongs to coordination of transition conditions.
3. In `Bulk`, it accompanies transition as inner transitional coupling.
4. It does not replace `Photon` and does not turn `Weak` into a distributed signal channel.

### Impulse

`Impulse` is the content of change rather than the transport unit.
It is not a force and not a subtype of `Boson`.
In serializable architectural projection it may be expressed as `JSON Patch`.

It must remain:

1. structured,
2. comparable,
3. serializable,
4. applicable step by step,
5. distinct from the transfer mechanism itself.

At the same time:

1. in `Dark`, `Impulse` expresses the composition of hidden reconfiguration,
2. in `Boundary`, `Impulse` fixes the canonical form of change content on the boundary,
3. in `Bulk`, `Impulse` accompanies execution as the content of applied change,
4. `State` transport goes through `Photon`,
5. ordinary `Field` change goes through `Gluon`,
6. topology-field change goes through `Higgs boson`,
7. relation and localization are held through `Graviton`,
8. active transition goes through `W boson`,
9. neutral mediation goes through `Z boson`.

See [Protocol](./PROTOCOL.md), [Strong](./proto/strong.md), and [Higgs](./proto/higgs.md) for the detailed channel reading.

### Identity and Index

The architecture must strictly distinguish:

1. `UUID` as stable identity,
2. `Index` as a local runtime address of the current configuration.

They must not replace one another.
Both contracts are fixed at the domain level rather than spread across force-modules.
`UUID` expresses the stable identity of one and the same entity and keeps coherence between `Dark`, `Boundary`, and `Bulk`.
`Index` remains execution geometry in `Boundary` or `Bulk` and does not rise into the hidden domain without separate ontological grounds.

## Architectural contracts

### DSL

`DSL` is responsible only for declaration.

### AST

`AST` is responsible only for the serializable contract.

### Dark (architecturally)

`Dark` is responsible for hidden structural continuity.
Architecturally it includes schema history, hidden hierarchy, fixed states, structured changes, and model evolution.

This reading does not depend on the presence of a large explicit file projection of `Dark`.
If such a projection exists, it should stay minimal and must not become a new execution center.

### Projection of `Dark` into `Boundary` and `Bulk`

`Boundary` and `Bulk` are architecturally parallel because both are rooted in the same hidden structural world.
Ontologically their source is common, but technically their loading is independent.

This means:

1. `Dark` is not a supra-domain execution orchestrator,
2. `Boundary` is the fixation projection,
3. `Bulk` is the manifestation projection,
4. a common hidden basis does not cancel domain autonomy,
5. a common hidden basis does not permit direct runtime imports between domains,
6. until protocols exist, inter-domain coherence is proven only in tests.

At the same time `Dark` remains the hidden builder and holder of connectivity and of the Dark projection of gravitational relations and localization.
It may observe global structural effects arriving through `Photon`, `Higgs boson`, and `Graviton`, but must not become the common execution center.

### Bulk <-> Boundary

`Bulk` and `Boundary` are architecturally parallel.
One domain is not the loader or internal stage of the other.

The contract between them is:

1. `Bulk` consumes its own `DSL/AST` contract provided by `Dark`,
2. `Boundary` consumes its own structural contract provided by `Dark`,
3. common ontological source in `Dark` does not mean shared runtime data ownership,
4. `DSL` and `AST` are not passed from one lower domain to another as shared runtime ownership,
5. crossing the boundary between `Bulk` and `Boundary` happens only through the force-channel that matches the character of change,
6. `Photon` transports `State`, `Gluon` changes ordinary `Field`, `Higgs boson` changes topology-fields, `Graviton` carries relation and localization protocol, `W boson` carries active transition, `Z boson` holds neutral mediation, and `Impulse` gives the content of that transfer,
7. `Boundary` does not execute `Bulk` processes,
8. `Bulk` is not the source of truth for `Boundary` state,
9. direct production imports between them are forbidden,
10. until a protocol exists, relative imports between them are acceptable only in tests.

## TAKT as the quantum of system state and execution rhythm

`TAKT` is not a separate domain and not a separate force.

Architecturally, `TAKT` is read as:

1. the minimal quantum of the integral state of the system,
2. the unit of shared execution rhythm,
3. the completed cycle of passage from one coherent system state to the next.

Inside one `TAKT`:

1. the system starts from one coherent hidden continuity and its current domain projections,
2. `Boundary` computes the admissible transition,
3. inter-domain change is transferred through the corresponding force-channel,
4. `Bulk` unfolds execution of that transition,
5. the system reaches the next coherent state compatible with both hidden continuity and manifested execution.

## Lock

`Lock` is neither a separate domain nor a separate force.
It is a marker of the transitional boundary between state computation and further unfolding of execution.

Architecturally, only the following matters:

1. `Boundary` fixes the moment of the computed transition,
2. `Bulk` decides how execution continues after that transition,
3. `Lock` must not blur the boundary between computation and execution.

## Orchestrators

Orchestrators exist at the domain level in both `Bulk` and `Boundary`.
Each domain has its own orchestrator.

They:

1. do not create a new domain,
2. do not replace force,
3. do not move domain responsibility into an outer supra-domain center.

Their role is to gather the contracts of their domain into one executable path without destroying the reading through `Domain × Force × Entity`.

## File projection

The file system should strive to be read by role rather than by historical naming.
Ontology remains broader than the current repository tree.

The current repository projection is:

```text
metafor/dsl/      # declaration
metafor/ast/      # serializable contract

dark/             # Dark domain and ownership of hidden connectivity/store/path/address
  gravity/        # schema loading, path formation, preparation of connectivity structure
  strong/         # cohesion of connectivity, retention of relations, connected flat form
  weak/           # path of structural transformation, preparation of transition
  em/             # projection and export contracts

boundary/         # Boundary domain: flattening boundary and imprint fixation layer
  gravity/        # geometry, index space, arrangement, flattening
  strong/         # canonicalization, compaction, entanglement materialization
  weak/           # state transition, weak change
  em/             # transfer of change, serialization, signal

bulk/             # Bulk domain in code projection
  gravity/        # structural organization of actors, hierarchy, addressability
  strong/         # binding, projection of entanglement
  weak/           # process execution, continuation after transition
  em/             # event delivery, signal propagation
```

This projection should be read under the following rules:

1. `Dark` keeps architectural status even with a distributed file projection,
2. `dark/*` packages, when explicitly present, serve as structural anchors of `Dark` roles rather than functional duplicates of `Boundary` or `Bulk`,
3. boundary snapshot remains in `Boundary × Strong` while it describes canonical boundary form and restoration,
4. `Dark` does not absorb deduplication from `Boundary × Strong`,
5. `Dark` does not absorb execution from `Bulk`,
6. file proximity of domains inside one repository does not cancel process and architectural isolation,
7. production code must not use this file proximity as a replacement for protocol.
