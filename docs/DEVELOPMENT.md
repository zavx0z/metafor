# Разработка

Этот документ фиксирует локальный режим проверки ядра MetaFor. Он не заменяет
[Онтологию](./ONTOLOGY.md), [Архитектуру](./ARCHITECTURE.md) и
[Force](./FORCE.md).

## Перед работой

Минимальные инварианты:

- `Dark -> inflaton -> Force -> Boundary`;
- `Boundary -> graviton/create -> Force -> runtime domains`;
- Dark не импортирует Boundary;
- Matrix, Energy и Bulk не читают Boundary/SQLite;
- declaration identity задаёт Dark;
- runtime/materialization identity задаёт Boundary;
- `enum` и `array` являются topology fields;
- большие tool results живут в mass/artifacts.

## Локальные домены

| Domain   | Port | Entry                 |
| -------- | ---- | --------------------- |
| Force    | 4000 | `force/server.ts`     |
| Boundary | 4001 | `boundary/server.ts`  |
| Dark     | 4002 | `dark/server.ts`      |
| Matrix   | 4003 | `matrix/server.ts`    |
| Bulk     | 4004 | `bulk/server.ts`      |
| Energy   | 4005 | `energy/server.ts`    |

Запуск ядра:

```bash
bun run force
```

Или по одному:

```bash
bun run --filter force server
bun run --filter boundary server
bun run --filter dark server
bun run --filter matrix server
bun run --filter energy server
```

Force clients по умолчанию подключаются к
`ws://127.0.0.1:4000/ws`. Другой адрес задаётся через `FORCE_ADDRESS`.
Boundary database можно передать первым позиционным аргументом server script;
следующий источник — `BOUNDARY_PATH`, а без обоих используется
`boundary/tmp/boundary.sqlite`.

## Локальный declaration flow

После запуска Force, Boundary и Dark:

```bash
curl -sS -X POST http://127.0.0.1:4000/force \
  -H 'content-type: application/json' \
  -d '{
    "parts": [{
      "part": "inflaton",
      "op": "test",
      "path": "zavx0z/test-meta"
    }]
  }'
```

Ожидаемый порядок:

1. Force broadcast-ит `inflaton/test`.
2. Dark загружает `meta`.
3. Dark отправляет declaration stream.
4. Boundary применяет весь stream одной транзакцией.
5. Boundary materializes current world.
6. Boundary испускает Graviton.
7. Boundary отправляет Matrix/Energy/Bulk target `create` snapshots.

Проверяйте не только health endpoints, но и итоговые declaration/materialized
rows в выбранной SQLite DB.

## Тесты

Полный прогон:

```bash
bun test
```

Точечные проверки ядра:

```bash
bun test force
bun test dark
bun test boundary
bun test matrix
bun test energy
```

Проверка типов:

```bash
bun run tsc --noEmit
```

После изменения Markdown:

```bash
git diff --check -- '*.md'
```

## Правило тестовой склейки

Production domains общаются только через Force. В test files допустимы прямые
импорты для подготовки fixture, чтения SQLite и проверки результата.
Тестовый import не становится public runtime API.

Предпочтительный набор проверок:

1. unit test нормализации declaration;
2. Boundary transaction/materialization test;
3. Force transport test;
4. Matrix/Energy protocol test;
5. один локальный end-to-end запуск реальных domain servers.

## Lifecycle

Полный reset runtime достигается остановкой процесса и созданием нового.
Production API домена не должен получать `reset/clear/restore` только ради
тестов. Такие операции принадлежат fixture или внешней orchestration.

Force `create` является bootstrap snapshot, а не скрытой синхронизацией БД.
Ordinary `{parts}` не replay-ятся центральным Force server.

## Test tools

Пока общий внешний adapter не реализован, `fixture/tools` содержит небольшие
read-only scoped action fixtures:

- `filesystem.read`;
- `filesystem.list`;
- `filesystem.metadata`.

Они работают только внутри capability root, который trusted fixture/runtime
передаёт как `mass.filesystemRoot`; входные fields содержат только относительный
`path` и не могут выбрать новый root. Actions не используют shell, кладут
результат в переданный mass object и возвращают только control state.

```bash
bun test fixture/tools/filesystem.spec.ts
```

Эти tests проверяют scoped filesystem access и разделение control result/mass,
но не являются end-to-end проверкой Energy, Force, Matrix или будущего
Codex-compatible adapter. Read fixture ограничен 1 MiB, list fixture — 1000
entries. Большие outputs требуют filesystem-backed operation mass/artifacts и
не должны помещаться в текущую in-memory Energy mass.
