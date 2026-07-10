# Разработка

Этот документ фиксирует локальную проверку динамического ядра MetaFor.

## Инварианты перед работой

- `Dark -> inflaton -> Force -> Boundary`;
- `Boundary -> derived particles -> Force -> Matrix / Energy / Bulk`;
- каждый домен хранит собственную локальную проекцию и dependency indices;
- один Force message содержит ровно одну Particle;
- каждый Boundary patch является отдельной transaction;
- derived particles выходят только после commit;
- snapshot, `type:"create"`, reset и полный rebuild запрещены;
- cold start/reconnect используют обычный incremental replay;
- Dark не импортирует Boundary;
- Matrix, Energy и Bulk не читают Boundary/SQLite.

## Локальные домены

| Domain   | Port | Entry                |
| -------- | ---- | -------------------- |
| Force    | 4000 | `force/server.ts`    |
| Boundary | 4001 | `boundary/server.ts` |
| Dark     | 4002 | `dark/server.ts`     |
| Matrix   | 4003 | `matrix/server.ts`   |
| Bulk     | 4004 | `bulk/server.ts`     |
| Energy   | 4005 | `energy/server.ts`   |

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
bun run --filter bulk server
bun run --filter energy server
```

Force clients используют `ws://127.0.0.1:4000/ws`; другой адрес задаётся
`FORCE_ADDRESS`. Boundary database задаётся первым аргументом или
`BOUNDARY_PATH`.

## Declaration flow

После запуска доменов:

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

Ожидаемый причинный порядок:

1. Force передаёт request Dark и Boundary.
2. Dark загружает meta и сравнивает её со своей проекцией.
3. Dark отправляет отдельный Inflaton для каждой add/remove/replace entity.
4. Boundary применяет каждую entity отдельной transaction.
5. После каждого commit Boundary отправляет только локальные consequences.
6. Matrix, Energy и Bulk патчат собственные stores без reset.
7. Dark завершает серию минимальным `inflaton/test` marker.

Проверяйте, что локальный field patch не меняет ID или object identity
unrelated actors/subtrees.

## Replay

Каждый runtime transport после register отправляет:

```text
z/test force/replay/<domain>/<connection-id>
```

Domain owners отвечают обычными idempotent `add` particles. Force server не
хранит state/history. Проверка reconnect должна подтверждать:

- нет create/snapshot payload;
- существующая projection не очищается;
- повторный add сохраняет identity;
- startup order доменов не влияет на результат.

## Тесты

Полный прогон:

```bash
bun test
bun run tsc --noEmit
```

Точечные проверки:

```bash
bun test force
bun test dark
bun test boundary
bun test matrix
bun test energy
bun test bulk
```

Обязательные сценарии:

1. add parent и child поддерживает оба направления индекса;
2. local replace сохраняет identity unrelated subtree;
3. branch remove не затрагивает sibling;
4. move/copy/test работают через entity paths;
5. replay повторно применяет add без duplication;
6. ни один production flow не вызывает reset/full rebuild;
7. malformed zero/multi-particle message отвергается Force.

После Markdown-изменений:

```bash
bun run .qwen/skills/table-format/format.ts <changed-files>
git diff --check -- '*.md'
```

## Тестовая склейка

Production domains общаются только через Force. Test files могут напрямую
читать store/SQLite для assertions, но такой import не становится runtime API.

Fixture не должен добавлять production reset/clear surface. Изоляция теста
достигается новым instance/process/database.

## Test tools

`fixture/tools` содержит scoped read-only actions:

- `filesystem.read`;
- `filesystem.list`;
- `filesystem.metadata`.

Capability root приходит через `mass.filesystemRoot`; caller задаёт только
relative path. Эти actions проверяют Energy/tool boundary, но не являются
полным внешним Codex-compatible adapter.
