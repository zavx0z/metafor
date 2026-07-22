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

Отдельные сущности, прочитанные из внешней Meta-декларации, переносятся через
`Inflaton`:

```text
Dark -> inflaton -> Force -> Boundary declaration/materialization
Boundary -> one local graviton consequence -> Force -> Matrix / Energy / Bulk
```

Inflaton и Graviton не являются двумя именами одной проекции. Каждый переносит
изменение одной entity на своей стороне Boundary.

## Чтение по доменам

### Dark

- declaration скрытой связности,
- отношения Wimp/Fuzzy/Macho/Axion до materialization,
- deterministic declaration addressing по WIMP SRC и local ID,
- отсутствие atom/topology/value instances.

### Boundary

- canonical current world,
- создание atom/topology/value identity,
- адресуемая materialized hierarchy,
- испускание поштучных Graviton consequences после commit.

### Matrix

- инкрементальный atom/brane store с parent-child индексами,
- локализация state transition без чтения Boundary.

### Bulk

- проявленная структурная раскладка,
- геометрия атомов,
- пространственная раскладка исполнения,
- наблюдаемая локализация проявленной формы.

## Силовые различия

- `Gravity` не переносит `State` в наблюдаемой форме; это делает `Photon`.
- `Gravity` не изменяет значения обычных `Field`; это делает `Gluon`.
- `Gravity` не изменяет поля topology; это делает `Higgs boson`.
- `Gravity` не проводит переход между состояниями; это делает `Weak` через `W boson` и `Z boson`.
- `Gravity` задаёт рамку отношения и локализации, в которой остальные изменения получают место, адресуемость и структурную согласованность.
- повторная доставка одной canonical identity не создаёт второй runtime
  instance.
