[README](../README.md) | **English** | [Русский](./FORCE.ru.md)

# Force

This document is the root entry point into the force layer of MetaFor.
It gives the common order of forces, channels, and the transportable content of change.
Detailed readings of separate forces and the topology-field channel are expanded in [Gravity](./proto/gravity.md), [Electromagnetism](./proto/electromagnetism.md), [Strong](./proto/strong.md), [Weak](./proto/weak.md), and [Higgs](./proto/higgs.md).

## Purpose

[Ontology](./ONTOLOGY.md) defines what exists in the system.
[Architecture](./ARCHITECTURE.md) defines how that ontology is projected into code.
The Force layer defines how force acts through a channel and how change receives a transportable form.

This layer deepens ontology and architecture without redistributing their responsibilities.
Canonicalization, deduplication, interning, and compaction remain the responsibility of `Boundary × Strong`.
The distinction between ordinary data-fields and topology-fields remains primary and is not retroactively created by force.

## Central distinctions

### Force

Force defines the character of transformation.
It is not the transportable unit and it is not identical to the content of change.

### Boson

`Boson` is the common type of force-channel and transport unit.
It is not itself a force.

The bosonic subtypes in MetaFor are:

- `Graviton`,
- `Photon`,
- `Gluon`,
- `Higgs boson`,
- `W boson`,
- `Z boson`.

Each subtype belongs to its own force or to the dedicated topology-field channel and must not collapse into the others.

### Impulse

`Impulse` is the content of change.
It is not a force, not a `Boson`, and not a channel.

In the serializable architectural projection, `Impulse` may be expressed through `ParticleOperation` and payload fields.
That does not turn it into the carrier itself.

The force relation is therefore:

- force defines the character of transformation,
- `Boson` defines the general type of channel,
- a bosonic subtype defines the concrete force-channel,
- `Impulse` defines the content of change.

## Transport and `part`

MetaFor uses one physical transport channel: `METAFOR_FORCE_CHANNEL`.
Runtime force must not create separate physical channels for `gravity`, `gluon`, `higgs`, `weak`, and so on.

Each `Particle` carries its semantic channel in the `part` field.
One `Particle` represents exactly one force part:

```ts
{ part: "graviton", op: "add", path: "zavx0z/git" }
{ part: "graviton", op: "add", path: "wimp", value: "zavx0z/git" }
{ part: "gluon", op: "replace", path: "/field/<uuid>", value: 42 }
{ part: "higgs", op: "replace", path: "/field/<uuid>", value: "branch" }
{ part: "photon", op: "replace", path: "/wimp/<uuid>", value: "ready" }
{ part: "w", op: "test", path: "/wimp/<uuid>/process/<uuid>", value: { kind: "result" } }
{ part: "+z", op: "test", path: "/wimp/<uuid>/process/<uuid>", value: { coordination: "claim" } }
{ part: "-z", op: "test", path: "/wimp/<uuid>/process/<uuid>", value: { coordination: "release" } }
```

In runtime force, root/source `path` is written as a direct source path without a leading `/`.
`part` carries the force carrier, while the domain signal type is written in `path`.
A WIMP signal does not encode `/wimp/...`: it is written as `{ part: "graviton", op: "add", path: "wimp", value: src }`.
Here `value` is not the WIMP payload, only the source id; receivers read the full declaration from Store by that `src`.

A `parts` batch may contain different `part` values, but routing is always read from the Particle itself, not from the envelope.
The envelope must not duplicate `part`, `channel`, `source`, or `boson`.

The transport layer does not build custom queues on top of `BroadcastChannel`.
If ordering, deduplication, replay, or integrity is required, it belongs to the store transaction, revision/domain tick, or runtime owner rather than to a subscriber-side Promise queue.

## Store commit and domain signals

`Store` holds the full canonical form of the world.
A lightweight Force `Particle` with `uuid`, `part`, and revision is not a payload
for rebuilding another `Store`; it only tells domains that an already committed
part of the world changed and should be read from `Store`.

In a distributed system, multiple physical `Store` replicas may exist: server
SQLite databases, browser IndexedDB replicas, or other runtime nodes.
If another `Store` must receive a change, the unit of transfer is the same
causal commit, not a separate independent sync channel.

Correct order:

```text
domain full change
  -> local Store transaction
  -> commit(txId / revision / parents)
  -> commit envelope:
       writes  - data for Store replicas that need to apply the change
       signals - lightweight force parts for domain reaction
```

On the receiving side, delivery to domains is ordered in reverse:

```text
receive commit envelope
  -> apply writes into local Store transaction
  -> commit local Store
  -> deliver signals to Dark / Boundary / Bulk subscribers
```

`store-sync` and domain force must not be split into two independent streams,
because then `Boundary` or `Bulk` may receive a signal before the local `Store`
replica contains the data that the signal points to.
If replication is not needed, the commit envelope may carry no external
`writes`, but the domain Force part must still be born only after the local commit.

Consequence: sending the domain Force part belongs to the `Store`/commit layer,
not to the caller that has already written the data.
The force transport module lives in `store/force`; subscriptions and direct
low-level channels import it from there, not from the project root.
The current startup surface for emitting a domain signal after a Store write is
embedded into ORM write methods: `actor.create`, `topology.create`,
`wimp.states.add`, `wimp.processes.add`, `wimp.matter.*`, and related sub-ORM
methods create the force signal after the SQL write. This surface should later
collapse into the full commit envelope, but callers must no longer create their
own `BroadcastChannel` or manually send a second Force part.
A domain, agent, UI, or any other participant in the environment must not perform
two manual actions:

```text
write Store
send Force part separately
```

An environment participant should have one semantic entrypoint: change a field
value, state, or context. Inside that entrypoint, the environment performs the
store transaction, creates the commit envelope, and delivers `signals` as
force parts only after commit.

If an API requires a participant to both mutate the database and manually send a
Force part, the runtime contract is not finished yet: Force part sending must be moved into
the store/commit path.

## Field types

Force distinguishes:

- ordinary data-fields,
- topology-fields.

`enum` and `array` belong to topology-fields by their type nature.
This is a primary model category, not an after-the-fact conclusion from contract shape.
The contract only unfolds topology semantics that already exists.

Topology-fields in MetaFor are read as Higgs fields:

- `enum` always expresses topology selection,
- `array` always expresses topology multiplicity or branch expansion.

Neither `enum` nor `array` should be read as an ordinary value field.
Neither belongs to the ordinary field-update regime.
Both change only as topology change through `Higgs boson`, not as ordinary value mutation.

The restrictions for topology-fields are:

- `enum` is not a generic bounded literal field,
- `enum` changes as topology selection rather than ordinary value mutation,
- `array` is not a generic mutable collection,
- `array` changes as topology multiplicity rather than ordinary value mutation,
- `array` does not participate in entanglement,
- `array` is not mutated by external reactions,
- `array` may change only through the atom's internal process and only by passing through a change of `State`.

The formal topology model, typed topology addressing, and topology-level entanglement addressing live in [Topology](./TOPOLOGY.md) so force does not replace the hidden-world assembly model.

## Global symmetry

MetaFor force symmetry is:

- `Gravity -> Graviton`
- `Electromagnetism -> Photon`
- `Strong -> Gluon`
- `Higgs field change -> Higgs boson`
- `Weak -> W boson / Z boson`

This mapping should be read consistently across ontology, architecture, and force.

## Force interactions

### Gravity

`Gravity` is responsible for relation, localization invariants, addressability, and structural organization.
Its `Dark` projection appears as hidden connectivity and inner geometry, its `Boundary` projection as flattening geometry and index space, and its `Bulk` projection as manifested arrangement and spatial localization.
Its channel is `Graviton`, which belongs to the internal structural force rather than to the observable signal layer.

See [Gravity](./proto/gravity.md).

### Electromagnetism

`Electromagnetism` is responsible for observable propagation and the transport of `State`.
Its channel is `Photon`, which brings state into a signaled, boundary-visible, and manifested form.

See [Electromagnetism](./proto/electromagnetism.md).

### Strong

`Strong` is responsible for retention, cohesion, connectivity, compaction, and form stability.
Its channel is `Gluon`, through which ordinary `Field` values change.

`Gluon` does not replace the architectural role of `Boundary × Strong`.
Canonicalization, deduplication, interning, and compaction remain boundary responsibilities.

See [Strong](./proto/strong.md).

### Higgs

`Higgs` in MetaFor names topology-field change.
Its channel is `Higgs boson`, which changes topology-fields as Higgs fields.

The distinction is:

- `Photon` transports `State`,
- `Gluon` changes ordinary `Field`,
- `Higgs boson` changes topology-fields,
- `Graviton` holds the relation and localization frame in which those changes receive place.

See [Higgs](./proto/higgs.md).

### Weak

`Weak` is responsible for transition, passage, mutation, and mediation of state.
Its channels are `W boson` and `Z boson`.

`W boson` belongs to active transition.
`Z boson` belongs to neutral mediation and the inner coupling of transitional states.

See [Weak](./proto/weak.md).

## Detailed documents

- [Gravity](./proto/gravity.md) covers relation, localization invariants, addressability, and structural organization across domains.
- [Electromagnetism](./proto/electromagnetism.md) covers observable propagation, signal, and the transport of `State`.
- [Strong](./proto/strong.md) covers ordinary `Field` updates, retention of form, and the action boundary of `Gluon`.
- [Higgs](./proto/higgs.md) covers topology-fields as Higgs fields, branch selection, branch multiplicity, and `Higgs boson`.
- [Weak](./proto/weak.md) covers active transition, neutral mediation, and the distinction between `W boson` and `Z boson`.
