# Boundary Refactor

Документ разворачивает [CURRENT_PLAN.md](/Users/zavx0z/zavx0z/metafor/tasks/CURRENT_PLAN.md) только для домена `Boundary`.
Он опирается на [docs/ARCHITECTURE.md](/Users/zavx0z/zavx0z/metafor/docs/ARCHITECTURE.md), [docs/ONTOLOGY.md](/Users/zavx0z/zavx0z/metafor/docs/ONTOLOGY.md) и протокольные документы из `docs/proto/*`.

## Цель

Привести `Boundary` к целевой доменной проекции как consumer of dark-owned graph structure:

1. `Boundary` имеет собственный доменный оркестратор.
2. [boundary/store.ts](/Users/zavx0z/zavx0z/metafor/boundary/store.ts) остаётся единственным источником истины только для boundary-домена, а не для source graph.
3. Вход `Boundary` должен читаться через dark-owned graph API и dark-prepared linked flat structure.
4. Внутренняя структура `Boundary` читается через `Boundary × Gravity`, `Boundary × Strong`, `Boundary × Weak`, `Boundary × Electromagnetism`.
5. CPU и GPU остаются backend-адаптерами внутри `Boundary × Weak`, а не скрытыми центрами владения.
6. Исторические имена перестают быть каноническими, если они скрывают corrected ownership model.

## Что этот план больше не предполагает

1. `Boundary` не является владельцем source graph parsing.
2. `Boundary` не является владельцем primary path/address API.
3. `Boundary` не является владельцем первичной addressable source geometry.
4. `Boundary × Gravity` не является владельцем dark graph flattening.
5. runtime-store слабого слоя не является вторым источником истины домена.

## Не меняем в рамках этого плана

1. Не переносим boundary canonicalization в `Dark`.
2. Не переносим boundary deduplication в `Dark`.
3. Не переносим boundary transition runtime в `Dark`.
4. Не делаем `Bulk` загрузчиком `Boundary`.
5. Не смешиваем boundary store с производными execution-структурами.

## Этап 1. Закрепить Boundary как consumer dark-owned graph

1. Оставить [boundary/boundary.ts](/Users/zavx0z/zavx0z/metafor/boundary/boundary.ts) boundary-доменным оркестратором поверх dark-provided structure.
2. Оставить [boundary/store.ts](/Users/zavx0z/zavx0z/metafor/boundary/store.ts) и [boundary/store.t.ts](/Users/zavx0z/zavx0z/metafor/boundary/store.t.ts) единственным источником истины boundary-домена.
3. Убрать из boundary-задач и boundary-описаний первичное graph storage, path construction, primary addressing ownership и первичную addressable geometry.
4. Зафиксировать, что входная структурная форма поступает в `Boundary` из `Dark`, а не собирается в `Boundary` как source graph.
5. Явно развести доменный store и локальный runtime-store слабого слоя, чтобы execution-структуры оставались производными.

## Этап 2. Выделить Boundary × Gravity как boundary-specific flattening

1. Читать `boundary/gravity/*` как слой boundary-specific подготовки уже dark-prepared graph structure.
2. Держать в `Boundary × Gravity` только boundary flattening, boundary geometry, boundary-local indexing и производную addressable geometry boundary-space.
3. Не держать в `Boundary × Gravity` source graph flattening, primary path construction, primary graph addressing или первичную addressable source geometry.
4. Явно различать dark graph flattening и boundary flattening как две разные операции.

## Obsolete формулировки

1. Любое старое описание `boundary/gravity/*` как владельца addressable source geometry считается obsolete.
2. Любое старое описание `Boundary` как места рождения graph storage считается obsolete.

## Этап 3. Выделить Boundary × Strong

1. Удерживать в `boundary/strong/*` canonicalization, deduplication, string interning и materialization связности boundary-формы.
2. Оставить сборку канонической boundary store-формы в `Strong`, а не в dark-domain и не в backend-runtime.
3. Зафиксировать, что boundary snapshot/dump остаётся boundary-специфичной формой и не подменяет dark-owned fixed graph state.

## Этап 4. Выделить Boundary × Weak

1. Сделать `Boundary × Weak` каноническим слоем вычисления transition runtime.
2. Удерживать backend-адаптеры CPU/GPU, устройство, константы и runtime-типы в `boundary/weak/*`.
3. Убедиться, что `Weak` вычисляет boundary transition, но не становится владельцем graph source и не подменяет boundary store.
4. Держать [boundary/weak/runtime/store.ts](/Users/zavx0z/zavx0z/metafor/boundary/weak/runtime/store.ts) локальной производной runtime-структурой.

## Этап 5. Выделить Boundary × Electromagnetism

1. Описать и вынести boundary-side transport, serialization и signaling в `boundary/em/*`.
2. Перенести dump-проекцию снимка внутрь [boundary/strong/dump/](/Users/zavx0z/zavx0z/metafor/boundary/strong/dump) как часть `Boundary × Strong`.
3. Зафиксировать, что export boundary state относится к `Electromagnetism`, а не к `Weak`.

## Этап 6. Выпрямить публичный API и файловую проекцию

1. Оставить [boundary/index.ts](/Users/zavx0z/zavx0z/metafor/boundary/index.ts) тонким публичным входом boundary-домена.
2. Явно читать публичный вход `Boundary` как consumer dark-owned contracts, а не как первичный loader source graph.
3. Убрать из экспортов и описаний исторические зонтичные имена, скрывающие роли `Gravity/Strong/Weak/Electromagnetism`.
4. Синхронизировать [boundary/README.md](/Users/zavx0z/zavx0z/metafor/boundary/README.md) и [boundary/strong/dump/README.md](/Users/zavx0z/zavx0z/metafor/boundary/strong/dump/README.md) только после фактического переноса модулей.

## Этап 7. Довести тесты до новой проекции

1. Разделить тесты по силовой проекции: boundary flattening, `Strong`, `Weak`, `Electromagnetism`.
2. Добавить интеграционное чтение: dark-prepared graph -> boundary flattening -> canonical store -> transition runtime.
3. Проверить согласованность UUID/state/index между dark-provided structure, boundary store и runtime-результатом.

## Критерий завершения

1. `Boundary` читается как downstream-domain, который потребляет dark-owned graph structure.
2. [boundary/store.ts](/Users/zavx0z/zavx0z/metafor/boundary/store.ts) остаётся источником истины только для boundary-представления.
3. `Boundary × Gravity` описывает только boundary-specific flattening, а не source graph flattening и не primary addressing.
4. `Boundary × Strong`, `Boundary × Weak` и `Boundary × Electromagnetism` разведены без возврата source graph ownership в `Boundary`.
5. Документация, тесты и публичный API читаются через corrected ownership model.
