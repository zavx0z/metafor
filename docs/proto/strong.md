[README](../../README.md) | [Force](../FORCE.md) | **English** | [Русский](./strong.ru.md)

# Strong

`strong.md` expands the force reading of `Strong`.
The general distinction between force, `Boson`, channel subtype, and `Impulse` is defined in the [root Force](../FORCE.md).

## Force and channel

`Strong` is responsible for retention, cohesion, connectivity, compaction, and form stability.
`Gluon` is the `Boson` subtype and channel of `Strong`.
It changes ordinary `Field` values without destroying the connectivity of form.

`Gluon` describes the force-mechanism of that change, but it does not replace the architectural responsibilities of `Boundary × Strong`.
Canonicalization, deduplication, interning, and compaction remain boundary responsibilities.

## Reading by domain

### Dark

- retention of hidden continuity,
- coherence of schemas,
- historical connectivity of fixed states,
- change of ordinary `Field` values inside retained structure.

### Boundary

- canonical change of ordinary `Field` values,
- connectivity of compact form,
- preparation of stable representation on the boundary,
- retention of the canonical structural frame.

### Bulk

- applied change of ordinary `Field` values,
- stability of composite manifested structure,
- cohesion of process-bearing configurations,
- retention of binding and cohesion in execution.

## The action boundary of `Gluon`

`Strong` works only with ordinary data-fields.
It is not the channel of topology change.

This means:

- `string`, `number`, and `boolean` are ordinary data-fields,
- `enum` and `array` are not ordinary data-fields,
- `enum` and `array` belong to topology-fields by type nature,
- topology-fields are served not by `Gluon`, but by `Higgs boson`.

That distinction is primary relative to AST.
AST may unfold `enum` and `array` in concrete contracts, but it does not turn them into ordinary fields.

## Ordinary Field Force

In MetaFor, ordinary `Field` is the bearer of value.
If an ordinary value changes, that change is carried through `Gluon`.

In other words:

- `Field` is the bearer of ordinary value,
- `Value` is the current content of the ordinary field,
- `Gluon` is the carrier of change for that value,
- `Strong` is the force that holds the change and prevents it from destroying form.

## Canonical correspondence

The agreed mapping for ordinary data-fields is:

| Gluon class | Gluon state      | `Field` kind | Semantic role       |
| ----------- | ---------------- | ------------ | ------------------- |
| Colored     | `red-antigreen`  | `string`     | free text scalar    |
| Colored     | `blue-antired`   | `number`     | free numeric scalar |
| Colored     | `green-antiblue` | `boolean`    | free boolean scalar |

## Why `enum` and `array` are outside `Strong`

Historically, `enum` and `array` could be read as special value forms.
The current ontological distinction is stricter:

- `enum` always gives branch selection and is not a generic bounded literal field,
- `array` always gives branch multiplicity and branch expansion and is not a generic mutable collection,
- neither `enum` nor `array` belongs to the ordinary field-update regime,
- topology branch is not an ordinary value,
- topology change must not be mixed with value change inside an already existing branch.

That is why:

- `Photon` does not replace `Gluon`,
- `Gluon` does not replace `Higgs boson`,
- ordinary field update and topology-field change are different events.

## Examples of ordinary updates

Example 1. String update:

```js
update({ title: "MetaFor" })
```

The change goes through `red-antigreen gluon` because an ordinary `string` changes.

Example 2. Numeric update:

```js
update({ priority: 3 })
```

The change goes through `blue-antired gluon` because an ordinary `number` changes.

Example 3. Boolean update:

```js
update({ visible: true })
```

The change goes through `green-antiblue gluon` because an ordinary `boolean` changes.

## Force distinctions

- `Strong` does not transport `State`; `Photon` does that.
- `Strong` does not change topology-fields; `Higgs boson` does that.
- `Strong` does not hold hidden geometry and addressability; `Graviton` does that.
- `Strong` holds the ordinary determinacy of value inside already existing structure.
