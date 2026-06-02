# План актуализации Store / DB архитектуры

Дата актуализации: 2026-05-28.

Этот документ заменяет предыдущий узкий план унификации `store`.
Он нужен не как список готовых implementation-команд, а как рабочая рамка для
следующей итерации планирования после повторного чтения документации, task-файлов
и GitHub issues.

## Кратко

Главный вывод: текущая задача не сводится к замене старого `store/db` на новый
`store.wimp + store.actor` API.

Старый `store/db` как кодовая форма был плохо спроектирован и сейчас фактически
разобран. Но архитектурная роль, которую он пытался закрыть, остаётся важной:
нужен общий фиксированный DB/world-layer, через который `Dark`, `Boundary` и
`Bulk` читают один и тот же мир.

Правильный вектор:

- не восстанавливать старый `store/db` API;
- не сужать новый store до ORM-обёртки над `wimp/actor`;
- сделать DB канонической world / boundary-form системы;
- сохранить разделение `Dark`, `Boundary`, `Bulk` как параллельных доменов;
- держать render/world snapshot как derived projection/cache, а не как
  canonical truth;
- отдельно развести runtime DB и authoring/editing DB для будущей
  self-authoring мультивселенной.

## Что было неверно в предыдущем плане

Предыдущий план слишком сильно смещал первый рубеж в сторону:

```text
Dark -> Store -> Boundary -> Bulk-domain API
```

без достаточного учёта `app/web`, world snapshot, incremental Bulk и общей
DB/world-form.

Это опасно по нескольким причинам:

1. Issues `#51`, `#53`, `#77` фиксируют, что общая БД — это не просто API для
   Boundary, а фиксированный слой мира для `Dark`, `Boundary` и `Bulk`.
2. `Bulk` не должен получать мир через `Boundary` как скрытый загрузчик.
   Он должен читать world-data напрямую из общей DB/world-layer.
3. Render rows нельзя считать canonical store truth, но ближайший рабочий
   контур не может игнорировать derived world projection: именно она нужна для
   shell-first и incremental manifestation.
4. Random explicit IDs допустимы только как переходный bootstrap-режим.
   Они не закрывают open issue `#58` про rename, restructure, semantic key и
   stable identity.
5. `actor_value_source` вероятно нужен, но его нельзя принимать как
   окончательное решение до проверки source-chain и prepared entanglement
   projection в Boundary.

## Архитектурная цель

Целевая модель должна читаться так:

```text
DSL / MetaFor source
  -> canonical relational DB/world-form
  -> Dark ORM / particle materialization
  -> Boundary active observer runtime
  -> Bulk manifested projection
```

При этом:

- DSL остаётся authoring source.
- DB фиксирует каноническую реляционную форму мира.
- `Dark` работает с particle/ORM materialization поверх БД, а не строит второй
  in-memory мир как source of truth.
- `Boundary` читает активный наблюдаемый fragment из БД и строит runtime matrix,
  но не владеет всей БД как своей приватной памятью.
- `Bulk` получает manifested form из общей world-form, не через внутренности
  `Boundary`.
- Protocol patches сигналят о случившемся изменении, но не являются payload
  переносом мира.

## Роли слоёв

### 1. Canonical Runtime DB

Основная БД логики и runtime мира.

Она должна хранить:

- декларативный meta/wimp слой;
- instance actor/wimp слой;
- field values;
- state;
- source/provenance там, где это нужно для Boundary source-chain;
- минимальные relation rows, которые нельзя восстановить без потери смысла.

Она не должна хранить как canonical truth:

- Boundary runtime indexes;
- `braneIndex`, `fieldIndex`, offsets и contiguous memory layout;
- frontend UI cache;
- transient camera/viewport state;
- случайные snapshot-объекты, которые можно пересчитать.

### 2. Boundary Runtime

`Boundary` должен оставаться active observer runtime.

Он может иметь:

- `gravity$` как долгоживущий composition/addressing слой;
- `boundary$` как derived materialized runtime store;
- `strong$` как field-level UUID routing;
- `weak$` как state/process runtime addressing.

Но эти структуры не должны становиться второй persisted truth рядом с DB.

### 3. Bulk Render Projection

Render/world rows должны читаться как derived projection/cache:

- shell carriers;
- field orbits;
- layout coordinates;
- colors;
- labels;
- Z-up/mm geometry.

Эта projection может и должна быть персистентной или mirrored для performance,
если это нужно для incremental rendering. Но её статус должен быть явно
secondary:

```text
canonical DB -> render projection -> Bulk/WebGPU scene
```

а не:

```text
render projection = source of truth
```

### 4. Authoring / Editing DB

Отдельно нужна будущая authoring/editing DB для линии `#66` и `#68`:

```text
code <-> authoring DB <-> multiverse editor
```

Её нельзя смешивать с runtime DB.

Runtime DB отвечает за живой мир и исполнение.
Authoring DB отвечает за редактирование логики, round-trip и обратную сборку в
код.

## Новый Store: как его читать

Текущий `store` уже содержит важные части:

- `store.wimp` — декларативный meta/wimp слой;
- `store.actor` — instance actor/value/state слой;
- `store.topology` — topology-узлы;
- `store/server` — один SQLite handle под несколькими схемами;
- `store.update(...)` — inbound patch application.

Но этого ещё недостаточно как финальной DB-архитектуры.

Нужно определить, станет ли `store`:

1. только доменным API поверх canonical DB;
2. или единым DB contract, куда входят canonical runtime rows, derived render
   projection и app settings как разные table groups;
3. или промежуточным слоем, который позже будет пересобран в более общий
   `DbStore<TableSpec>`.

Следующая итерация планирования должна принять это решение явно.

## Entanglement и source-chain

Текущий новый `actor`-слой правильно выражает базовый shared value:

```text
actor_value(actor_a, field_x, value_v)
actor_value(actor_b, field_y, value_v)
```

Это хорошо покрывает:

- shared ordinary field value;
- write-back одним update по `value.uuid`;
- owners-by-value;
- fork/share.

Но shared `value.uuid` сам по себе не хранит:

- направление `parent -> child`;
- binding/provenance;
- root source chain;
- stable representative для Boundary projection;
- отличие direct source от manual share.

Для Boundary это критично, потому что старый путь использовал `field_sources`
для source-chain и operational loading, а `entanglement_*` принимались как
prepared projection.

Текущий вывод:

- не возвращать старые `entanglement_*` как canonical source of truth;
- не заставлять Boundary выводить entanglement из случайно равных values;
- prepared projection должна собираться адаптером из canonical store rows;
- если owners-by-value не хватает для source-chain, нужен минимальный
  provenance слой, например `actor_value_source`;
- `actor_value_source` должен хранить direction/provenance, но не заменять
  shared `value.uuid` как source of truth shared state.

## Identity

Identity нельзя считать закрытой.

Переходное правило:

- random explicit actor/value IDs допустимы для bootstrap и SQLite-first
  smoke-пути;
- sync events должны всегда нести уже созданные IDs;
- writer не должен генерировать скрытые IDs локально в разных местах.

Но финальная модель должна быть отдельно спроектирована по `#58`.

Нужно решить:

- что переживает rename field/state/process;
- что переживает restructure meta/matter;
- где stable UUID;
- где mutable semantic key;
- где provenance/history;
- какие IDs могут быть deterministic;
- где explicit external ID обязателен.

До этого нельзя цементировать random IDs как архитектурный финал.

## Reset / Compare / Update

Текущий reset-from-zero режим допустим как bootstrap и test/recovery path.
Он не должен считаться финальной моделью живого мира.

По `#57` нужно отдельно решить:

- остаётся ли полный rebuild допустимым только для clean boot;
- нужен ли compare/update protocol для live DB;
- где граница между rematerialization, relayout и render-only update;
- как сохранить continuity Bulk scene и не сбрасывать world identity при каждом
  изменении settings.

Для `#77` особенно важно разделить:

- `src changed` -> new materialization;
- layout changed -> relayout only;
- render settings changed -> rerender only;
- field/state changed -> protocol/runtime update.

## Granularity write path

По `#56` вопрос остаётся открытым.

Row-group запись допустима для bootstrap:

- write one meta;
- write one actor/wimp;
- write local related rows.

Но live mutation может потребовать entity-stage операции:

- add actor;
- remove actor;
- update value;
- fork/share value;
- add/remove source link;
- update state;
- local topology change;
- local render projection invalidation.

Следующая итерация должна определить минимальный набор write operations, не
уходя раньше времени в слишком широкий generic DB layer.

## Browser / IDB

IDB parity не нужно проектировать раньше SQLite-first runtime.

Но направление такое:

- public API server/browser должен совпадать по поведению;
- IndexedDB не должен быть snapshot-cache adapter;
- browser store должен быть live addressable backend или live mirror;
- parity tests должны сравнивать поведение API, а не внутреннюю форму таблиц;
- render projection mirror может быть обязательным раньше, чем mirror всей
  canonical DB;
- mirror canonical meta/actor rows в браузер включается только если это нужно
  для client-side inspector / authoring / DSL emit.

## App/Web и Bulk нельзя откладывать слишком далеко

Предыдущий план слишком сильно откладывал `app/web`.

На самом деле текущий функциональный рубеж должен включать хотя бы минимальную
сквозную проверку:

```text
Dark materialization
  -> canonical DB rows
  -> Boundary read/update/write-back
  -> Bulk render projection
  -> app/web protocol or smoke path
```

Полный UI можно не чинить первым шагом, но нельзя проектировать DB так, будто
`Bulk` и `app/web` не являются проверкой правильности store.

Минимальная shell-first manifestation нужна рано, потому что именно она
показывает, что DB действительно является world-form, а не только внутренним
ORM storage.

## Практический порядок следующей итерации

### Этап 1. Зафиксировать целевой DB scope

До кода нужно письменно решить:

1. `store` остаётся `wimp/actor/topology` API или становится более общим
   DB contract.
2. Render projection живёт внутри общего DB contract как `view_*` слой или
   остаётся отдельным Bulk cache с тем же sync-механизмом.
3. `actor_value_source` нужен сразу или сначала проверяется Boundary adapter на
   owners-by-value.
4. Какие части предыдущего `STORE_UNIFICATION_PLAN.md` считаются отменёнными.

### Этап 2. SQLite-first runtime DB

Минимально нужно добиться:

- `store/server.open()` стабильно открывает одну file-backed SQLite DB;
- `store.wimp` создаёт canonical declaration rows;
- `store.actor` создаёт actor/value/state rows;
- shared value работает как canonical shared state;
- direct ordinary binding создаёт shared value link;
- topology fields `enum/array` не шарятся как ordinary source;
- value write/fork/share имеют явный API.

### Этап 3. Boundary adapter

Сделать read-only adapter:

```text
store.wimp + store.actor -> BoundaryDatabaseData
```

Проверить:

- branes;
- fields;
- field values;
- state seeds;
- source-chain;
- prepared entanglement projection;
- owners-by-value;
- representative field stability.

Только после этого решать, нужен ли `actor_value_source` как обязательный слой.

### Этап 4. Boundary write-back

Перенести write-back с old `DbBackend` на store operations:

- shared value update;
- local fork;
- share existing value;
- state update;
- topology update через отдельную semantics, не как ordinary `Gluon`.

### Этап 5. Bulk projection

Убрать render-row типы из `@store/actor`.

Render projection должна жить в Bulk/render module или в явно named `view_*`
слое, но не в canonical actor API.

Нужны:

- `DbWorldRows` / row events как Bulk projection types;
- incremental upsert/remove API для viewport;
- Z-up/mm invariant;
- разделение materialize / relayout / render-settings.

### Этап 6. App/Web smoke

До полного UI нужно проверить один сквозной smoke:

- открыть file-backed SQLite;
- materialize `zavx0z/git`;
- получить Boundary runtime;
- получить Bulk world rows/events;
- убедиться, что browser/client больше не требует несуществующие exports из
  `@store/actor`.

### Этап 7. IDB / Browser

После SQLite path:

- добавить `store/browser`;
- реализовать IDB backend на той же public semantics;
- добавить parity tests;
- решить mirror scope: render-only, canonical partial или full canonical.

## Что можно закрыть или актуализировать в issues

Нужно отдельно пройти GitHub issues:

- `#64` по треду уже фактически готова к закрытию, но всё ещё open.
- `#73` нужно переписать/сузить: правильный смысл не `sqlite -> dark bundle`,
  а `load -> relation`, дальше `dark` читает particle/ORM rows из БД.
- `#56`, `#57`, `#58` оставить открытыми как фундаментальный кластер.
- `#77` оставить открытой до настоящего incremental viewport apply, а не
  только per-row DB sync.
- `#53`, `#68` оставить как direction/vision, не закрывать обычным code commit.
- `task/issues-audit.md` нужно обновить по фактическому GitHub status.

## Нельзя делать

- Нельзя возвращать старый `store/db` как совместимый shim и считать это
  решением.
- Нельзя оставлять production imports из `store/db*`.
- Нельзя переносить Boundary runtime indexes в canonical DB.
- Нельзя делать render rows частью `@store/actor` canonical API.
- Нельзя считать `Boundary` загрузчиком для `Bulk`.
- Нельзя выводить topology-field updates через ordinary value path.
- Нельзя принимать random IDs как финальную identity-модель.
- Нельзя смешивать runtime DB и authoring/editing DB.

## Минимальный критерий успеха ближайшего рубежа

Ближайший рубеж считается полезным, если выполняется следующее:

1. Один SQLite-файл является общей runtime DB для текущего сценария.
2. `Dark` пишет canonical rows в новый store/DB path.
3. `Boundary` читает из нового store/DB path без `store/db`.
4. Shared ordinary field value работает через общий `value.uuid`.
5. Boundary write-back меняет canonical value/state.
6. Bulk получает derived shell-first world projection из canonical DB path.
7. `app/web` больше не зависит от несуществующих `@store/actor` render exports.
8. Все оставшиеся full snapshot/rebuild пути явно помечены как bootstrap,
   debug, recovery или test harness, а не production runtime model.

## Источники для следующей итерации

Обязательные локальные документы:

- `docs/ARCHITECTURE.ru.md`
- `docs/ONTOLOGY.ru.md`
- `docs/PROTOCOL.ru.md`
- `docs/TOPOLOGY.ru.md`
- `docs/DEVELOPMENT.ru.md`
- `store/README.md`
- `store/actor/README.md`
- `store/docs/load-pipeline.md`
- `boundary/README.md`
- `boundary/docs/issue-map.md`
- `boundary/docs/multiverse-visualization.md`
- `task/storage-analysis.md`
- `task/store-unification.md`
- `task/boundary-unification.md`
- `task/render-projection.md`
- `task/idb-parity.md`
- `task/issues-audit.md`

Обязательные GitHub issues:

- `#51` — общая БД и patch как сигнал;
- `#53` — Bulk на базе web-gpu-engine;
- `#56` — granular write path;
- `#57` — reset-from-zero vs compare/update;
- `#58` — identity для rename/restructure;
- `#64` — Weak W/Z поверх Boundary lock;
- `#65` — минимальная событийная protocol model;
- `#66` — DSL <-> DB authoring round-trip;
- `#68` — self-authoring мультивселенная;
- `#73` — Dark materialization из SQLite/particle rows;
- `#77` — incremental materialization rendering.
