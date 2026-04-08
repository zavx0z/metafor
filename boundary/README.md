# Boundary

`Boundary` — домен границы, который держит канонический store и собственный оркестратор.

## Первый смысл Boundary

Для текущего этапа `Boundary` нужно читать не только как слой канонизации, но и как
первую читаемую плоскость визуализации мультивселенной.

Именно здесь скрытая связность из `Dark` превращается в:

- адресуемые `Brane`,
- фиксированные `Field`,
- вычислимые `State`,
- локальные матрицы состояний,
- стабильные UUID-идентичности, которые потом могут быть показаны человеку,
- каркас для визуализации агента, чата, инструментов и world-objects в `Bulk`.

Практически это означает:

- сначала человек должен видеть изолированные миры, их носители состояния и локальную геометрию,
- потом должен видеть работу инструментов и ИИ над этими мирами,
- и только после этого нужно наращивать явные связи, entanglement, force-channel routing и межмировую координацию.

Отдельное подробное описание этого направления зафиксировано в
[boundary/docs/multiverse-visualization.md](./docs/multiverse-visualization.md).
Issue-driven архитектурная карта зафиксирована в
[boundary/docs/issue-map.md](./docs/issue-map.md).

## Слои

- `boundary/gravity` раскладывает входную структуру в плоскую адресуемую форму.
- `boundary/strong` собирает канонический store, дедупликацию и материализацию связности.
- `boundary/weak` вычисляет переход состояния поверх канонического store.

В терминах визуализации это читается так:

- `boundary/gravity` задаёт геометрию размещения и адресуемую форму мира,
- `boundary/strong` удерживает компактный канон, который можно стабильно показывать и восстанавливать,
- `boundary/weak` двигает локальную матрицу состояний и тем самым меняет видимый режим мира.

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

Для визуализации мультивселенной дополнительно фиксируются такие инварианты:

- `Boundary` остаётся источником канонической читаемой world-form, а не произвольным UI-cache.
- Визуальный слой не должен изобретать собственные идентичности поверх UUID.
- Один мир сначала должен быть видим как изолированная локальная матрица состояний, даже если межмировые связи ещё не показаны.
- Представление агента, человека, чата, `git`-мира или tool-runtime должно опираться на одну и ту же brane/field/state геометрию.
- Упрощение архитектуры допустимо, если оно делает эту геометрию яснее и не создаёт вторую истину.

## Визуализация мультивселенной

На старте `Boundary` должен уметь давать человеку такую картину:

1. Есть не абстрактный чат и не абстрактный API, а миры, разложенные в адресуемую плоскость.
2. В каждом мире есть носители состояния: `Brane`.
3. На `Brane` фиксируются `Field`, topology-поля, текущий `State`, блокировки, переходы и процессы.
4. Агент, человек, инструмент, `git`-репозиторий или другой ИИ читаются как участники одной и той же мировой геометрии, а не как внешние декоративные виджеты.
5. `Boundary` даёт deterministic contract для того, чтобы потом в `Bulk` можно было проявить это как пространство, сцену, гуманоидный аватар, graph of tools, world-shell или иной manifested interface.

Текущий приоритет чтения такой:

1. изолированная вселенная,
2. её локальная матрица состояний,
3. визуальное присутствие агента и инструментов,
4. только потом межмировые связи и force-channels между вселенными.

## Направление рефакторинга

Если архитектура начинает мешать этой картине, рефакторинг должен идти по таким правилам:

- упрощать путь от canonical DB/runtime contract к читаемой world-form,
- не размазывать визуальный смысл между `Dark`, `Boundary` и случайным UI-store,
- не дублировать state ownership в отдельном frontend truth layer,
- удерживать различие между hidden source в `Dark`, canonical fixation в `Boundary` и manifestation в `Bulk`,
- готовить систему к распределённому вычислению слабосвязанных матриц состояний, а не к одному центральному runtime-графу.

## Issue-Driven Линия

Текущее направление `Boundary` уже нельзя читать только по коду.
Его нужно читать через архитектурные issue, потому что именно там зафиксированы
целевые инварианты системы.

- `#68` задаёт главный вектор: MetaFor должен стать self-authoring мультивселенной, а не проектом с внешним визуальным редактором.
- `#53` фиксирует `Bulk` как пространственный manifested слой на базе `web-gpu-engine`, но не как отдельный источник истины.
- `#51` фиксирует модель: общая БД является общим миром для `Dark`, `Boundary` и `Bulk`, а patch не переносит данные, а только сигналит о том, что нужно перечитать мир из БД.
- `#60` фиксирует `gravity$` как долгоживущий store состава и адресации, а `boundary$` как derived runtime-store.
- `#64` фиксирует lock ownership за `Boundary`, `Z` как канал координации исполнителя, а `W` как единый result envelope процесса.
- `#65` требует держать протокол минимальным и событийным, без ложной адресности и transport-overhead внутри payload.
- `#56`, `#57`, `#58` оставляют открытыми фундаментальные вопросы: гранулярность DB write path, режим жизни БД и identity-модель для живого мира.

Из этого для `Boundary` прямо следует:

- `Boundary` нельзя сводить к frontend cache или к glue-слою между `Dark` и `Bulk`;
- визуализация должна строиться от канонической DB/world-form, а не от случайных runtime-объектов;
- агент, чат, `git`, screenshot workflow и tool invocations должны читаться как world-actors и world-events внутри одной геометрии;
- гуманоидная или иная embodied-форма агента в `Bulk` является только manifested shell того, что уже адресуемо в `Boundary`;
- пока не решены `#56/#57/#58`, нельзя преждевременно цементировать слишком узкий DB/runtime API как окончательный.

## Публичный вход

```ts
import {
  gravity$,
  strong$,
  write,
  setValues,
  update,
  unlock,
  writeRuntimeFromDb,
  addRuntimeWimp,
  removeRuntimeWimp,
  rebuildRuntime,
  applyStructuralPatchFromDb,
  subscribeBoundaryGluonBroadcast,
  subscribeBoundaryHiggsBroadcast,
  subscribeBoundaryWeakResultBroadcast,
} from "@boundary"
```

`write()` записывает каноническую структуру. `setValues()` — внешний UUID-addressed intake для ordinary/topology field updates. `update()` остаётся runtime-функцией по индексам уже materialized слоя. Когда Boundary загружен из DB, runtime write-back пишет изменившиеся canonical `field_values`/`wimp_states` обратно в тот же backend. `unlock()` снимает блокировку.
`write(data)` остаётся отдельным bootstrap/bypass path и сознательно очищает `gravity$`, потому что в этом режиме нет UUID-composition из DB.
Для DB-пути `add/remove` мутируют `gravity$`, а `test ""` barrier через `applyStructuralPatchFromDb(...)`
или явный `rebuildRuntime(backend)` пересобирает `boundary$` и обновляет `uuid <-> braneIndex`.
UUID field addressing и topology/ordinary field routing живут в `strong$`, а `brane/stateIndex -> metaStateId` для write-back живёт в `weak$`.
Существующая `lock/unlock` семантика Boundary остаётся как была. `Photon` публикуется как broadcast observable-state signal, `Z` остаётся coordination-каналом исполнителей в `Bulk`, а `W` возвращает один result envelope обратно в `Boundary`; `subscribeBoundaryWeakResultBroadcast()` принимает этот пакет, применяет все UUID field patches за один проход и только потом снимает `lock`.

В контексте визуализации это означает, что `Boundary` уже сейчас способен служить источником:

- snapshot мира,
- snapshot локальной матрицы состояний,
- стабильной адресации для инструментов и агентов,
- визуального diff между состояниями,
- materialization-контракта для `Bulk`-сцены и chat-driven world interaction.
