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
6. Для активного плана фиксируются буквальные ownership markers:
   - `Dark owns graph storage.`
   - `Dark owns graph API.`
   - `Dark owns path formation and addressing.`
   - `Dark owns force-level graph preparation.`

## Базовое владение доменов

### Dark

`Dark` является владельцем структурного graph domain.

`Dark` владеет:

1. загрузкой схемы по главному schema path,
2. удержанием `DSL`, `AST` и AST-schema на dark-стороне как входа в структурный граф,
3. `dark/store` как store of graph structure,
4. graph API,
5. graph lookup API,
6. формированием путей,
7. path API и address API,
8. первичным addressing графа,
9. graph flattening в плоскую связанную форму с сохранением отношений,
10. linked flat representation с сохранёнными ссылками,
11. force-level preparation структуры до domain projection,
12. скрытой организацией графа как источником для последующего `Boundary`- и `Bulk`-потребления.

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
`Boundary` больше не является владельцем первичной addressable source geometry.

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
`Bulk` не является местом рождения graph storage и не формирует первичную path/address model.

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

## Force -> Dark

Архитектурным источником миграции для `dark/*` является старый слой `force/`.

Опорный коммит:

`a333205a4f14608fe9811681f881beb6b79e31b1`

`[refactor/feat/test/docs] force - реструктуризация сил и обновление API`

В этом коммите было явно зафиксировано force-layer ownership:

1. `core/electromagnetic.ts -> force/electromagnetic.ts`,
2. `gravity.* -> force/gravity.*`,
3. создание `force/strong.ts`,
4. создание `force/week.ts`,
5. синхронизация `Actor` и runtime с новой организацией сил,
6. обновление `core/processes*.ts`, `core/reactions*.ts` и `schema/*`,
7. адаптация тестов и фикстур после переноса сил,
8. перенос документации `interaction.md -> force/force.md`.

`old force/ is the migration source for dark/*`.

Старый `force/` не должен трактоваться как просто historical artifact.
Он должен трактоваться как предшественник нового домена `Dark`.

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

## Что переносится в Dark первым

Первое переназначение ownership читается так:

1. `old force/gravity.* -> dark/gravity/*`,
2. `old force/strong.ts responsibility -> dark/strong/*`,
3. `old force/week.ts responsibility -> dark/weak/*`,
4. `old force/electromagnetic.ts export/projection responsibility -> dark/em/*`.

Важно:

1. нельзя копировать старые файлы вслепую,
2. нужно переносить ownership и responsibility,
3. перенос должен происходить в новом доменном формате `Dark`, а не как буквальная реконструкция старой директории `force/`.

## Dark Store

В первом активном срезе должен появиться явный `dark/store` layer.

`Dark must own:`

1. store of graph structure,
2. path API,
3. address API,
4. graph lookup API,
5. linked flat representation.

## Что закрепляется в Dark первым

Первый срез миграции обязан закрепить в `Dark`:

1. storage of graph structure,
2. path/address API,
3. graph lookup API,
4. graph flattening с сохранением связей,
5. linked flat representation,
6. schema-loading ownership,
7. force-level structure preparation,
8. graph API как единый вход для downstream-доменов,
9. удержание `DSL/AST`-входа по главному schema path.

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
4. Любая активная задача, которая оставляет `Boundary` владельцем первичной addressable geometry, считается устаревшей до переписывания.
5. Любая активная задача, которая оставляет `Bulk` местом рождения graph storage, считается устаревшей до переписывания.

## Этап 1. Исправить `CURRENT_PLAN.md` и связанные таски под новое владение

1. Переписать активный план без старой модели, где `Dark` читается только как continuity/projection слой.
2. Переписать связанные task-документы так, чтобы `Boundary` и `Bulk` больше не читались владельцами первичного графа.
3. Пометить obsolete любые task-формулировки, которые противоречат новому ownership model.

## Этап 2. Зафиксировать Dark как graph/store/address owner

1. Зафиксировать `Dark` как владельца structural graph domain в активном плане и задачах.
2. Явно отделить graph ownership от boundary- и bulk-runtime ownership.
3. Зафиксировать загрузку схемы по главному schema path и dark-side holding `DSL/AST` как вход в graph substrate.
4. Зафиксировать, что graph storage, path formation, addressing, graph lookup API и graph API принадлежат `Dark`.

## Этап 3. Перенести force responsibilities из опорного слоя `force/` в `dark/*`

1. Прочитать старый `force/` из коммита `a333205a4f14608fe9811681f881beb6b79e31b1` как архитектурный ancestor нового `Dark`.
2. Разнести обязанности подготовки графа по `dark/gravity`, `dark/strong`, `dark/weak` и `dark/em`.
3. Зафиксировать, что речь идёт не о переносе "каналов", а о переносе слоя graph preparation.
4. Подготовить дальнейшие кодовые задачи вокруг dark-owned structure, а не вокруг boundary/bulk-owned loaders.

## Этап 4. Перевести Boundary на consumption dark-owned graph structure

1. Считать `Boundary` downstream-domain, работающим поверх dark-prepared linked flat graph.
2. Оставить в `Boundary` только boundary flattening, canonicalization, deduplication, string interning и transition runtime.
3. Убрать из задач и описаний предположение о primary parsing/path/address ownership и первичной addressable geometry в `Boundary`.
4. Разводить boundary-local indexing и primary graph addressing как разные уровни ответственности.

## Этап 5. Перевести Bulk на consumption dark-owned graph structure

1. Считать `Bulk` downstream-domain, работающим поверх dark-prepared graph contracts.
2. Оставить в `Bulk` только manifested topology/runtime projection, binding, entanglement projection, intentions/action loading и process execution.
3. Убрать из задач и описаний предположение о primary graph ownership, primary path/address ownership и рождении graph storage в `Bulk`.
4. Рассматривать прямую загрузку `meta.json` как временный bootstrap, который затем должен быть переподключён к `Dark`.

## Этап 6. Только после этого продолжать runtime refactor

1. Углублять boundary runtime refactor только после фиксации dark-owned graph input.
2. Углублять bulk runtime refactor только после фиксации dark-owned graph input.
3. Отдельно проектировать persistence/history runtime уже после закрепления graph/store/address ownership.
4. Не начинать глубокий runtime-рефакторинг с сохранением старой модели владения графом.

## Граница реализации следующего шага

Этот шаг обновляет только план и task definitions.
Полная code migration, перенос старых force-responsibilities и переподключение runtime-доменов выполняются после этого и должны следовать данному плану.

## Критерий завершения

1. `Dark` признан owner graph/store/path/address domain.
2. В плане присутствуют явные формулировки `Dark owns graph storage`, `Dark owns graph API`, `Dark owns path formation and addressing`.
3. `old force/` explicitly referenced as migration source для `dark/*`, включая коммит `a333205a4f14608fe9811681f881beb6b79e31b1`.
4. `Boundary` и `Bulk` больше не описываются как primary graph owners.
5. связанные task-документы обновлены под тот же ownership model.
6. следующий implementation step может начинаться с force -> dark migration.
