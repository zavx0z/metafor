[README](../README.md) | **English** | [Русский](./PROTOCOL.ru.md)

# Protocol

This document is the root entry point into the protocol layer of MetaFor.
It gives the common order of forces, channels, and the transportable content of change.
Detailed readings of separate forces and the topology-field channel are expanded in [Gravity](./proto/gravity.md), [Electromagnetism](./proto/electromagnetism.md), [Strong](./proto/strong.md), [Weak](./proto/weak.md), and [Higgs](./proto/higgs.md).

## Purpose

[Ontology](./ONTOLOGY.md) defines what exists in the system.
[Architecture](./ARCHITECTURE.md) defines how that ontology is projected into code.
Protocol defines how force acts through a channel and how change receives a transportable form.

This layer deepens ontology and architecture without redistributing their responsibilities.
Canonicalization, deduplication, interning, and compaction remain the responsibility of `Boundary × Strong`.
The distinction between ordinary data-fields and topology-fields remains primary and is not retroactively created by protocol.

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

In the serializable architectural projection, `Impulse` may be expressed as `JSON Patch`.
That does not turn it into the carrier itself.

The protocol relation is therefore:

- force defines the character of transformation,
- `Boson` defines the general type of channel,
- a bosonic subtype defines the concrete force-channel,
- `Impulse` defines the content of change.

## Field types

Protocol distinguishes:

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

The formal topology model, typed topology addressing, and topology-level entanglement addressing live in [Topology](./TOPOLOGY.md) so protocol does not replace the hidden-world assembly model.

## Global symmetry

MetaFor protocol symmetry is:

- `Gravity -> Graviton`
- `Electromagnetism -> Photon`
- `Strong -> Gluon`
- `Higgs field change -> Higgs boson`
- `Weak -> W boson / Z boson`

This mapping should be read consistently across ontology, architecture, and protocol.

## Force interactions

### Gravity

`Gravity` is responsible for relation, localization invariants, addressability, and structural organization.
Its `Dark` projection appears as hidden connectivity and inner geometry, its `Boundary` projection as flattening geometry and index space, and its `Bulk` projection as manifested arrangement and spatial localization.
Its channel is `Graviton`, which belongs to the internal structural protocol rather than to the observable signal layer.

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
