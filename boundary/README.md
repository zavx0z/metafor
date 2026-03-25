# Boundary

`Boundary` — домен границы, который держит канонический store и собственный оркестратор.

## Слои

- `boundary/gravity` раскладывает входную структуру в плоскую адресуемую форму.
- `boundary/strong` собирает канонический store, дедупликацию и материализацию связности.
- `boundary/weak` вычисляет переход состояния поверх канонического store.

## Внутренняя проекция сил

- `boundary/gravity` держит доменный оркестратор силы и подпакеты `condition`, `validate`, `numeric`.
- `boundary/strong` держит доменный оркестратор силы и подпакеты `stored`, `string-table`, `entangled`, `normalize`.
- `boundary/weak` держит доменный оркестратор силы и подпакеты `runtime`, `program`, `encode`.

## Инварианты

- [`gravity.store.ts`](./gravity.store.ts) — долгоживущий composition/addressing слой.
- [`store.ts`](./store.ts) — derived materialized runtime store.
- Слабый слой не владеет доменным store и не становится второй истиной.
- CPU и GPU остаются backend-адаптерами внутри `Boundary × Weak`.
- Межслойные производные формы не подменяют каноническую boundary-форму.

## Публичный вход

```ts
import {
  gravity$,
  strong$,
  write,
  setValues,
  update,
  unlock,
  writeRuntimeFromSharedDb,
  addRuntimeWimp,
  removeRuntimeWimp,
  rebuildRuntime,
  applyStructuralPatchFromSharedDb,
  subscribeBoundaryGluonBroadcast,
  subscribeBoundaryHiggsBroadcast,
} from "@boundary"
```

`write()` записывает каноническую структуру. `setValues()` — внешний UUID-addressed intake для ordinary/topology field updates. `update()` остаётся runtime-функцией по индексам уже materialized слоя. Когда Boundary загружен из `shared/db`, runtime write-back пишет изменившиеся canonical `field_values`/`wimp_states` обратно в тот же backend. `unlock()` снимает блокировку.
`write(data)` остаётся отдельным bootstrap/bypass path и сознательно очищает `gravity$`, потому что в этом режиме нет UUID-composition из `shared/db`.
Для `shared/db`-пути `add/remove` мутируют `gravity$`, а `test ""` barrier через `applyStructuralPatchFromSharedDb(...)`
или явный `rebuildRuntime(backend)` пересобирает `boundary$` и обновляет `uuid <-> braneIndex`.
UUID field addressing и topology/ordinary field routing живут в `strong$`, а `brane/stateIndex -> metaStateId` для write-back живёт в `weak$`.
