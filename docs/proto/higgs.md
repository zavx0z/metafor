[README](../../README.md) | [Protocol](../PROTOCOL.md) | **English** | [Русский](./higgs.ru.md)

# Higgs

`higgs.md` expands the protocol reading of topology-field change in MetaFor.
The general distinction between force, `Boson`, channel subtype, and `Impulse` is defined in the [root protocol](../PROTOCOL.md).

## Higgs fields and the change channel

In MetaFor, topology-fields are read as Higgs fields.
Their change is carried through `Higgs boson`.

This channel differs from the others:

- `Photon` transports `State`,
- `Gluon` changes ordinary `Field`,
- `Higgs boson` changes topology-fields,
- `Graviton` holds the relation and localization frame in which topology change receives place.

Topology-fields are defined by type nature:

- `enum` always gives branch selection,
- `array` always gives branch multiplicity and branch expansion.

Neither `enum` nor `array` belongs to the ordinary field-update regime.
Neither should be read as an ordinary value field.
Both change only as topology change through `Higgs boson`, not as ordinary value mutation.

This distinction is primary relative to AST.
AST only unfolds topology semantics into a concrete contract.

## Reading by domain

### Dark

- hidden topology as part of the hidden world,
- observation of global topology reconfiguration,
- retention of topology/gravity continuity,
- reading structural consequences of `Higgs boson` without turning `Dark` into a runtime orchestrator.

### Boundary

- canonical fixation of topology selection,
- canonical fixation of branch multiplicity,
- distinction between topology-field change and ordinary field update,
- prohibition of external reactive mutation of `array`.

### Bulk

- manifested structural reconfiguration,
- unfolding of branches,
- reading the atom as multiplicity after unfolding,
- observable topology shift rather than simple value change inside the current branch.

## Semantics of topology-fields

### `enum`

`enum` always expresses branch selection.
It is not a generic bounded literal field, but a topology selector:

- which branch of the world is admissible,
- which path of manifestation is active,
- which structural configuration must exist.

### `array`

`array` always expresses branch multiplicity.
It is not a generic mutable collection, but branch expansion:

- how many branches should exist,
- how an atom unfolds into multiplicity,
- how one structural point becomes a composition of branches.

When `array` unfolds, the atom becomes multiplicity.
This prevents reading an array as a simple value-box inside unchanged topology.

## Restrictions on topology-fields

- `enum` is not patched as an ordinary value and changes only as topology selection,
- `array` is not patched as an ordinary value and changes only as topology multiplicity,
- `array` does not participate in entanglement,
- `array` is not mutated by external reactions,
- `array` may change only through the internal process of the atom itself,
- that change must pass through a change of `State`,
- the outer world may observe the result of topology change, but must not directly interfere in topology unfolding.

These restrictions prevent uncontrolled topology coupling.

## Global observability

Topology-field change has globally observable structural consequences:

- `Higgs boson` changes topology,
- `Photon` continues to transport `State`,
- `Graviton` holds the relation and localization frame in which topology change receives place,
- `Dark` observes the structural consequences of changes arriving through `Electromagnetism`, Higgs-field change, and `Gravity`.

This does not make `Dark` a runtime execution center.
`Dark` remains the hidden holder of topology continuity together with the hidden observer of its global coherence.
