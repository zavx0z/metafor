# Минимальный план

Документ опирается на `docs/PHILOSOPHY.md`, `docs/ARCHITECTURE.md`, `docs/ONTOLOGY.md` и протокольные документы из `docs/proto/*`.
Он фиксирует активный рабочий порядок миграции и явное владение между доменами.

## Цель

Довести проект до минимально целостной реализации трёхдоменной архитектуры:

```text
DSL -> AST -> Dark
Dark -> Boundary
Dark -> Bulk
Boundary -> Electromagnetism -> Bulk
```

В этом чтении:

1. `DSL` задаёт декларацию.
2. `AST` задаёт сериализуемый технический контракт.
3. `Dark` является владельцем структурного графа как скрытого субстрата системы.
4. `Boundary` и `Bulk` являются downstream-доменами, которые работают поверх подготовленной `Dark`-структуры.
5. Строка `Boundary -> Electromagnetism -> Bulk` описывает только runtime-handoff уже подготовленного изменения и не отменяет общего источника в `Dark`.

## Базовое владение доменов

### Dark

`Dark` является владельцем структурного graph domain.

`Dark` владеет:

1. загрузкой схемы по главному schema path,
2. удержанием `DSL`, `AST` и AST-schema на dark-стороне как входа в структурный граф,
3. хранением графовой структуры,
4. graph API,
5. формированием путей,
6. первичным addressing графа,
7. graph flattening в плоскую связанную форму с сохранением отношений,
8. force-level preparation структуры до domain projection,
9. скрытой организацией графа как источником для последующего `Boundary`- и `Bulk`-потребления.

`Dark` не должен:

1. поглощать boundary canonicalization,
2. поглощать boundary deduplication,
3. подменять boundary transition runtime,
4. подменять bulk manifestation runtime,
5. подменять bulk process execution,
6. в рамках этой задачи превращаться в полный persistence/history runtime.

`Dark` больше нельзя описывать как только continuity/history/projection слой.
В активном плане он читается как владелец graph substrate.

### Boundary

`Boundary` больше не является владельцем source graph parsing или primary addressing.

`Boundary` владеет только boundary-specific работой поверх dark-prepared structure:

1. boundary flattening в boundary-смысле,
2. canonicalization,
3. deduplication,
4. string interning,
5. boundary state transition computation,
6. boundary-specific runtime representation,
7. boundary-side transport и serialization контракта.

### Bulk

`Bulk` больше не является владельцем source graph parsing или primary graph addressing.

`Bulk` владеет только manifestation/runtime работой поверх dark-prepared structure:

1. manifested topology и runtime projection,
2. binding,
3. entanglement projection,
4. intentions и action loading,
5. process execution,
6. bulk-side delivery и signal unfolding.

## Два разных flattening

Эти два значения нельзя смешивать:

1. `Dark` graph flattening
   Это подготовка source graph в плоскую связанную структуру с сохранёнными отношениями, путями и адресами.
2. `Boundary` flattening
   Это boundary-specific геометрическая и каноническая подготовка уже dark-owned структуры для boundary-space, индексов и детерминированного вычисления.

`Boundary` не должен считаться владельцем dark graph flattening.

## Принцип миграции

`old force/ responsibilities -> dark/* domain responsibilities`

Предрефакторный пакет `force/` является правильным архитектурным предком нового домена `Dark`.
Старый force-layer был не только набором каналов и не только `Gravity`.
Он был распределённым слоем подготовки графа: хранения структуры, удержания связности, переходной подготовки и projection-ready organization.

Поэтому дальнейшая миграция читается так:

1. старые force-level обязанности переносятся не обратно в `Boundary` и не в `Bulk`,
2. они ре-хомятся в `dark/gravity`, `dark/strong`, `dark/weak` и `dark/em`,
3. downstream-домены должны потреблять уже dark-prepared graph structure.

## Dark × Force в новой модели

Старый force layer был preparation layer графа, а не "просто channels".

1. `Dark × Gravity` — graph geometry, structure loading, hierarchy, path construction, primary addressing.
2. `Dark × Strong` — graph cohesion, relation retention, stable linked flat form, удержание связности графа после flattening.
3. `Dark × Weak` — structural transformation path, graph transition preparation, подготовка реконфигурации графа до доменных runtime-проекций.
4. `Dark × Electromagnetism` — projection/export contract подготовленного graph state в downstream-домены.

## Что переносим в Dark первым

Первый срез миграции обязан закрепить в `Dark`:

1. storage of graph structure,
2. path/address API,
3. graph flattening с сохранением связей,
4. schema-loading ownership,
5. force-level structure preparation,
6. graph API как единый вход для downstream-доменов,
7. удержание `DSL/AST`-входа по главному schema path.

## Что остаётся вне Dark

Следующие обязанности остаются вне `Dark` и не должны быть перенесены в него:

1. boundary canonicalization,
2. boundary deduplication,
3. boundary string interning,
4. boundary transition runtime,
5. boundary-specific flattening и boundary-local indexing,
6. bulk manifestation runtime,
7. bulk binding и entanglement projection,
8. bulk process execution.

## Что считаем недействительным

После фиксации этого плана недействительными считаются следующие допущения:

1. `Dark` — это только continuity/lineage/history/projection слой.
2. `Boundary` владеет первичным source graph parsing.
3. `Boundary` владеет primary path/address model.
4. `Bulk` владеет первичным source graph parsing.
5. `Bulk` владеет primary graph addressing.
6. boundary-side flattening и dark graph flattening обозначают одну и ту же операцию.
7. прямое чтение `meta.json` из bulk является целевой архитектурой, а не временным shortcut.

## Согласование активных задач

1. `tasks/BOUNDARY_REFACTOR.md` должен читать `Boundary` как consumer dark-owned graph structure, а не как владельца source graph.
2. Любая активная задача, которая приписывает `Boundary` или `Bulk` первичное владение графом, адресами или путями, считается устаревшей до переписывания.
3. Любая активная задача, которая описывает `Dark` только как continuity/history/projection домен, считается устаревшей до переписывания.

## Этап 1. Закрепить Dark как graph/store/address owner

1. Зафиксировать `Dark` как владельца structural graph domain в активном плане и задачах.
2. Явно отделить graph ownership от boundary- и bulk-runtime ownership.
3. Зафиксировать загрузку схемы по главному schema path и dark-side holding `DSL/AST` как вход в graph substrate.
4. Зафиксировать, что graph storage, path formation, addressing и graph API принадлежат `Dark`.

## Этап 2. Перенести pre-refactor force responsibilities в `dark/*`

1. Прочитать старый `force/` как архитектурный ancestor нового `Dark`.
2. Разнести обязанности подготовки графа по `dark/gravity`, `dark/strong`, `dark/weak` и `dark/em`.
3. Зафиксировать, что речь идёт не о переносе "каналов", а о переносе слоя graph preparation.
4. Подготовить дальнейшие кодовые задачи вокруг dark-owned structure, а не вокруг boundary/bulk-owned loaders.

## Этап 3. Перевести Boundary на consumption dark-owned graph structure

1. Считать `Boundary` downstream-domain, работающим поверх dark-prepared linked flat graph.
2. Оставить в `Boundary` только boundary flattening, canonicalization, deduplication, string interning и transition runtime.
3. Убрать из задач и описаний предположение о primary parsing/path/address ownership в `Boundary`.
4. Разводить boundary-local indexing и primary graph addressing как разные уровни ответственности.

## Этап 4. Перевести Bulk на consumption dark-owned graph structure

1. Считать `Bulk` downstream-domain, работающим поверх dark-prepared graph contracts.
2. Оставить в `Bulk` только manifested topology/runtime projection, binding, entanglement projection, intentions/action loading и process execution.
3. Убрать из задач и описаний предположение о primary graph ownership в `Bulk`.
4. Рассматривать прямую загрузку `meta.json` как временный bootstrap, который затем должен быть переподключён к `Dark`.

## Этап 5. Только после этого продолжать deeper runtime refactors

1. Углублять boundary runtime refactor только после фиксации dark-owned graph input.
2. Углублять bulk runtime refactor только после фиксации dark-owned graph input.
3. Отдельно проектировать persistence/history runtime уже после закрепления graph/store/address ownership.
4. Не начинать глубокий runtime-рефакторинг с сохранением старой модели владения графом.

## Граница реализации следующего шага

Этот шаг обновляет только план и task definitions.
Полная code migration, перенос старых force-responsibilities и переподключение runtime-доменов выполняются после этого и должны следовать данному плану.

## Критерий завершения

1. `Dark` описан как владелец graph storage, path formation, addressing и force-level graph preparation.
2. предрефакторный `force/` явно признан источником миграции для `dark/*`.
3. `Boundary` и `Bulk` больше не описываются как владельцы первичного графа.
4. два смысла flattening явно разведены.
5. активные задачи больше не противоречат corrected ownership model.
6. следующий implementation step может начинаться с переноса force functionality в `Dark` в доменном формате.
