# Bulk Refactor

Документ разворачивает [CURRENT_PLAN.md](./CURRENT_PLAN.md) только для домена `Bulk`.
Он опирается на [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md), [docs/ONTOLOGY.md](../docs/ONTOLOGY.md) и протокольные документы из `docs/proto/*`.

## Цель

Привести `Bulk` к целевой доменной проекции как consumer of dark-owned graph structure:

1. `Bulk` является downstream-domain, а не владельцем source graph.
2. `Bulk` работает поверх dark-prepared graph contracts.
3. `Bulk` не рождает primary graph storage, primary path model или primary addressing.
4. `Bulk` сохраняет собственный runtime-domain: topology projection, binding, intentions и execution.
5. Исторические имена перестают быть каноническими, если они скрывают corrected ownership model.

## Что этот план больше не предполагает

1. `Bulk` не является владельцем source graph parsing.
2. `Bulk` не является владельцем primary graph addressing.
3. `Bulk` не является местом рождения graph storage.
4. `bulk/gravity/*` не является owner source graph hierarchy.
5. прямое чтение `meta.json` из `Bulk` не считается целевой архитектурой.

## Не меняем в рамках этого плана

1. Не переносим manifested topology/runtime projection в `Dark` как bulk-runtime.
2. Не переносим binding в `Dark`.
3. Не переносим entanglement projection в `Dark`.
4. Не переносим intentions и action loading в `Dark`.
5. Не переносим process execution в `Dark`.
6. Не делаем `Boundary` загрузчиком `Bulk`.

## Этап 1. Закрепить Bulk как consumer dark-owned graph

1. Оставить `Bulk` downstream-domain поверх dark-provided structure.
2. Убрать из bulk-задач и bulk-описаний primary graph ownership.
3. Убрать из bulk-задач и bulk-описаний primary path/address ownership.
4. Убрать из bulk-задач и bulk-описаний рождение graph storage в `Bulk`.
5. Зафиксировать, что входная structural form поступает в `Bulk` из `Dark`.

## Этап 2. Выделить Bulk × Gravity

1. Читать `bulk/gravity/*` как manifested topology и runtime projection уже dark-owned structure.
2. Держать в `Bulk × Gravity` только runtime hierarchy, order и topology projection bulk-space.
3. Не держать в `Bulk × Gravity` source graph flattening.
4. Не держать в `Bulk × Gravity` primary path construction и primary graph addressing.
5. Рассматривать direct `meta.json` loading как временный bootstrap, а не целевое владение.

## Этап 3. Выделить Bulk × Strong

1. Удерживать в `bulk/strong/*` binding и manifested connectedness bulk-form.
2. Оставить здесь entanglement projection и bulk-specific связность.
3. Не переносить сюда source graph storage.
4. Не переносить сюда dark-owned graph flattening.

## Этап 4. Выделить Bulk × Weak

1. Сделать `Bulk × Weak` каноническим слоем intentions, action loading и process execution.
2. Удерживать здесь execution runtime, а не source graph ownership.
3. Не смешивать execution structures с graph substrate.
4. Не подменять bulk-runtime dark-owned graph contracts.

## Этап 5. Выделить Bulk × Electromagnetism

1. Описать и вынести bulk-side delivery, signaling и unfolding в `bulk/em/*`.
2. Зафиксировать, что bulk-side transport работает поверх уже подготовленного graph/state contract.
3. Не читать `Bulk × Electromagnetism` как owner source graph.

## Этап 6. Выпрямить публичный API и файловую проекцию

1. Оставить `bulk/index.ts` тонким публичным входом bulk-domain.
2. Явно читать публичный вход `Bulk` как consumer dark-owned contracts.
3. Убрать из экспортов и описаний исторические зонтичные имена, скрывающие роли `Gravity/Strong/Weak/Electromagnetism`.
4. Синхронизировать `bulk/README.md` после фактического переноса модулей и переподключения contracts.

## Этап 7. Довести тесты до новой проекции

1. Разделить тесты по силовой проекции: topology projection, `Strong`, `Weak`, `Electromagnetism`.
2. Добавить интеграционное чтение:
   - dark-prepared graph -> bulk topology projection -> binding -> execution
3. Проверить согласованность UUID/path/address между dark-provided structure, bulk runtime projection и execution result.
4. Добавить проверку, что bulk-runtime не подменяет graph substrate.

## Obsolete формулировки

1. Любое описание `Bulk` как места рождения graph storage считается obsolete.
2. Любое описание `Bulk` как владельца primary path/address model считается obsolete.
3. Любое описание `bulk/gravity/*` как владельца source graph hierarchy считается obsolete.
4. Любое описание direct `meta.json` loading как целевой архитектуры считается obsolete.

## Критерий завершения

1. `Bulk` читается как downstream-domain, который потребляет dark-owned graph structure.
2. `Bulk × Gravity` описывает только manifested topology/runtime projection, а не source graph ownership.
3. `Bulk × Strong`, `Bulk × Weak` и `Bulk × Electromagnetism` разведены без возврата source graph ownership в `Bulk`.
4. Direct `meta.json` loading читается как временный bootstrap.
5. Документация, тесты и публичный API читаются через corrected ownership model.
6. Следующий implementation step может переподключать `Bulk` к dark-owned graph contracts без возврата старой двухдоменной схемы.
