# Gravity

`gravity.md` разворачивает силовое чтение `Gravity`.
Общие различения силы, `Boson`, подтипа канала и `Impulse` заданы в [корневом Force](../FORCE.md).

## Сила и канал

`Gravity` отвечает за отношение, инварианты локализации, структурную организацию и адресуемость.
`Graviton` является подтипом `Boson` и каналом `Gravity`.
Он не тождественен самой силе и не является наблюдаемым сигналом уровня `Photon`.

Через `Graviton` materialized сущности получают локальность, отношение,
связность и геометрическую различимость. В текущем междоменном protocol
Graviton испускает Boundary после commit current world.

Source/meta declaration переносится отдельно через `Inflaton`:

```text
Dark -> inflaton -> Force -> Boundary declaration/materialization
Boundary -> graviton + target create -> Force -> Matrix / Energy / Bulk
```

Inflaton и Graviton не являются двумя именами одного snapshot.

## Чтение по доменам

### Dark

- declaration скрытой связности,
- отношения Wimp/Fuzzy/Macho/Axion до materialization,
- deterministic declaration addressing по WIMP SRC и local ID,
- отсутствие actor/topology/value instances.

### Boundary

- canonical current world,
- создание actor/topology/value identity,
- адресуемая materialized hierarchy,
- испускание Graviton и самодостаточных runtime projections после commit.

### Matrix

- runtime actor/brane addressing из самодостаточного snapshot,
- локализация state transition без чтения Boundary.

### Bulk

- проявленная структурная раскладка,
- геометрия акторов,
- пространственная раскладка исполнения,
- наблюдаемая локализация проявленной формы.

## Силовые различия

- `Gravity` не переносит `State` в наблюдаемой форме; это делает `Photon`.
- `Gravity` не изменяет значения обычных `Field`; это делает `Gluon`.
- `Gravity` не изменяет поля topology; это делает `Higgs boson`.
- `Gravity` не проводит переход между состояниями; это делает `Weak` через `W boson` и `Z boson`.
- `Gravity` задаёт рамку отношения и локализации, в которой остальные изменения получают место, адресуемость и структурную согласованность.
- ID без materialized данных не является достаточной runtime-проекцией Gravity.
