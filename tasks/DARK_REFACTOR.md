# Dark Refactor

Документ разворачивает [CURRENT_PLAN.md](./CURRENT_PLAN.md) только для домена `Dark`.
Он опирается на [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md), [docs/ONTOLOGY.md](../docs/ONTOLOGY.md), протокольные документы из `docs/proto/*` и опорный коммит старого force-layer:

`a333205a4f14608fe9811681f881beb6b79e31b1`

`[refactor/feat/test/docs] force - реструктуризация сил и обновление API`

## Цель

Привести `Dark` к целевой доменной проекции как owner of graph/store/path/address domain:

1. `Dark` является владельцем source graph как скрытого структурного субстрата.
2. `dark/store` становится местом хранения graph structure, а не временным helper-слоем.
3. В `Dark` формируются пути, адреса, graph lookup API и graph API.
4. `Dark` держит `DSL`, `AST` и AST-schema на dark-стороне как вход в graph substrate.
5. Старый `force/` читается как архитектурный ancestor нового `Dark`, а не как historical artifact.
6. `Boundary` и `Bulk` получают уже dark-prepared linked flat structure.

## Что этот план больше не предполагает

1. `Dark` не читается как только continuity/history/projection слой.
2. `Boundary` не считается владельцем source graph parsing.
3. `Boundary` не считается владельцем primary path/address API.
4. `Bulk` не считается владельцем source graph parsing.
5. `Bulk` не считается местом рождения graph storage.
6. Старый `force/` не читается как набор "просто channels".

## Не меняем в рамках этого плана

1. Не переносим boundary canonicalization в `Dark`.
2. Не переносим boundary deduplication и string interning в `Dark`.
3. Не переносим boundary transition runtime в `Dark`.
4. Не переносим bulk manifestation runtime в `Dark`.
5. Не переносим bulk process execution в `Dark`.
6. Не превращаем `Dark` в полный persistence/history runtime на этом этапе.

## Опорный слой миграции: `force -> dark`

Архитектурным источником миграции для `dark/*` является старый пакет `force/` из коммита:

`a333205a4f14608fe9811681f881beb6b79e31b1`

Что в этом коммите фиксировано как предок `Dark`:

1. `force/electromagnetic.ts`
2. `force/gravity.*`
3. `force/strong.ts`
4. `force/week.ts`
5. согласованный runtime поверх новой организации сил
6. связанное обновление `core/processes*.ts`, `core/reactions*.ts` и `schema/*`

Принцип чтения:

`old force/ responsibilities -> dark/* domain responsibilities`

## Этап 1. Закрепить Dark как owner graph/store/address domain

1. Ввести `dark/store` как явный store of graph structure.
2. Закрепить за `Dark` graph API и graph lookup API.
3. Закрепить за `Dark` path formation, path API, address API и primary addressing.
4. Закрепить за `Dark` dark-side holding `DSL`, `AST`, AST-schema как вход в graph substrate.
5. Убрать из формулировок `Dark` чтение как только continuity/lineage/history/projection.

## Этап 2. Выделить Dark × Gravity

1. Читать `dark/gravity/*` как graph geometry, structure loading, hierarchy и primary path construction.
2. Перенести в `Dark × Gravity` schema loading по главному schema path.
3. Перенести в `Dark × Gravity` primary addressing графа.
4. Держать здесь source graph flattening в плоскую связанную форму с сохранением отношений.
5. Не смешивать это с boundary-specific flattening.

## Этап 3. Выделить Dark × Strong

1. Читать `dark/strong/*` как слой graph cohesion и relation retention.
2. Удерживать здесь stable linked flat form после graph flattening.
3. Удерживать здесь согласованность graph substrate до downstream domain projection.
4. Не переносить сюда boundary canonicalization и boundary deduplication.

## Этап 4. Выделить Dark × Weak

1. Читать `dark/weak/*` как слой structural transformation path.
2. Удерживать здесь graph transition preparation и подготовку реконфигурации графа до runtime-проекций.
3. Не переносить сюда boundary transition runtime.
4. Не переносить сюда bulk process execution.

## Этап 5. Выделить Dark × Electromagnetism

1. Читать `dark/em/*` как projection/export contract подготовленного graph state.
2. Держать здесь вынесение dark-prepared structure в downstream signal/projection form.
3. Не читать `Dark × Electromagnetism` как owner runtime-handoff между `Boundary` и `Bulk`.
4. Не смешивать это с bulk-side delivery.

## Этап 6. Выпрямить файловую проекцию `Dark`

1. Оставить `dark/index.ts` тонким публичным входом dark-domain.
2. Добавить `dark/store.ts` и `dark/store.t.ts` как доменную точку владения graph structure.
3. Организовать файловую проекцию вокруг:
   - `dark/gravity/*`
   - `dark/strong/*`
   - `dark/weak/*`
   - `dark/em/*`
4. Не реконструировать старую директорию `force/` буквально; переносить ownership и responsibility в новом доменном формате.

## Этап 7. Подготовить downstream contracts

1. Зафиксировать, что `Boundary` потребляет dark-owned graph structure.
2. Зафиксировать, что `Bulk` потребляет dark-owned graph structure.
3. Подготовить dark-provided linked flat representation как единый вход для downstream-доменов.
4. Развести primary graph addressing и boundary-local/bulk-local runtime addressing как разные уровни.

## Этап 8. Довести тесты до новой проекции

1. Добавить тесты на `dark/store` как source of graph structure.
2. Добавить тесты на path API, address API и graph lookup API.
3. Добавить тесты на graph flattening с сохранением связей.
4. Добавить интеграционное чтение:
   - `DSL/AST -> Dark`
   - `Dark -> Boundary`
   - `Dark -> Bulk`
5. Проверить согласованность UUID/path/address между dark-owned structure и downstream consumers.

## Obsolete формулировки

1. Любое описание `Dark` как только continuity/history/projection слоя считается obsolete.
2. Любое описание `Boundary` как места первичного graph parsing считается obsolete.
3. Любое описание `Bulk` как места рождения graph storage считается obsolete.
4. Любое описание old `force/` как "просто channels" считается obsolete.

## Критерий завершения

1. `Dark` читается как owner graph/store/path/address domain.
2. `dark/store` зафиксирован как store of graph structure.
3. `Dark × Gravity`, `Dark × Strong`, `Dark × Weak`, `Dark × Electromagnetism` разведены по ownership.
4. Старый `force/` из коммита `a333205a4f14608fe9811681f881beb6b79e31b1` зафиксирован как migration source.
5. `Boundary` и `Bulk` читаются как downstream consumers dark-owned graph structure.
6. Следующий implementation step может начинаться с force -> dark migration.
