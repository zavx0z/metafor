# Boundary unification — перенос Boundary на единый store

Дата: 2026-04-26. Детализация к `task/store-unification.md`.

## Проверенный текущий факт

`boundary/database.ts` сейчас не является тонким adapter-ом. Это 1577 строк
старого `DbData` runtime pipeline:

- `DbData` нормализуется в `BoundaryDatabaseData`;
- `wimp_fields + meta_fields + field_values` превращаются в brane fields;
- `field_sources` используются для source-chain и operational package loading;
- `entanglement_*` строки превращаются в prepared entanglement projection;
- runtime field registry строит собственную нумерацию;
- write-back идёт через `persistRuntimeChanges()` и старый `DbBackend`.

Boundary не выводит shared blocks из равных значений. Он принимает prepared
projection и валидирует её в `boundary/strong/entangled.ts`.

## Что нужно перенести

1. **Read model.**
   - Было: `DbBackend / DbData / wimp_* / entanglement_*`.
   - Должно стать: `store.meta + store.actor -> BoundaryDatabaseData`.

2. **Operational loading.**
   - Сейчас package loading идёт через `field_sources`.
   - В новом store нужно проверить, достаточно ли `owners by value` для загрузки
     shared family без direction.
   - Если нет, нужен provenance слой (`actor_value_source` или equivalent).

3. **Entanglement projection.**
   - Shared source of truth должен быть `actor_value.value`.
   - Boundary projection должна строиться из owners одного `value`, но сохранить
     старый контракт: `representativeBraneIndex`, `fieldName`, `payloadIds`,
     `semanticKeys`.

4. **Write-back.**
   - Сейчас один runtime field может писать N `wimpFieldId` через
     `backend.setFieldValue`.
   - В новом store shared field должен писать один `value.uuid`.
   - Для fork/share нужно явно различать mutation shared value vs local fork.

## Порядок

1. Сделать SQLite actor store рабочим.
2. Подготовить store fixture, который создаёт meta + actors + shared values.
3. Написать read-only `boundary/database.store.ts` поверх `store/server`.
4. Перенести `boundary/tests/database.test.ts` на store fixture.
5. После read-path перенести write-back на `actor.value.*`, `actor.link.*`,
   `actor.state.*`.
6. Удалить production imports `store/db*` из Boundary.

## Риск

Самый большой риск — потерять старую source-chain семантику. Не начинать с
массовой замены `DbData` по всему Boundary. Сначала нужен один вертикальный
test: actor family с shared ordinary field -> Boundary prepared projection ->
runtime update -> запись обратно в shared `value.uuid`.
