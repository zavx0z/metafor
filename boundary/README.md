# Boundary runtime

Boundary хранит канонический текущий мир в SQLite и выпускает consequences
только после commit. Проверяемые законы находятся в [`DOMAIN.md`](DOMAIN.md),
принятая работа — в [`project/TODO.md`](../project/TODO.md), ещё не принятая — в
[`project/BACKLOG.md`](../project/BACKLOG.md), общая карта — в
[`docs/README.md`](../docs/README.md).

Этот README описывает только точки реализации и не дублирует доменный контракт.

## Entry и storage

`boundary/server.ts` открывает SQLite, поднимает Oracle RPC, подключает
`Force("boundary")`, применяет входные Particle и отправляет возвращённые
consequences после commit.

Путь database выбирается в порядке:

1. первый позиционный аргумент;
2. `BOUNDARY_PATH`;
3. `.metafor/dev.sqlite`.

```bash
BOUNDARY_PATH=/absolute/path/boundary.sqlite bun run --filter boundary start
```

Тесты используют отдельные `:memory:` databases и не открывают development
database.

## Public runtime paths

- `boundary.initialState.read` — нормализованный initial state для Matrix;
- `boundary.initialProjection.read` — полный canonical projection для Energy и
  Bulk;
- Inflaton от Dark — declaration/materialization в `incremental.ts`;
- Photon/Z/W — Process commit в `execution.ts`;
- Reaction lifecycle — `reaction.ts`.

Initial reads проходят через Oracle RPC. Realtime changes после рождения идут
поштучными Particle через Force; Boundary не рассылает bootstrap snapshot как
Graviton.

## Основные файлы

- `sqlite.ts` — открытие database и Boundary facade;
- `incremental.ts` — relational declaration/materialization projection;
- `execution.ts` — Process registration, Energy selection и result commit;
- `reaction.ts` — Reaction commit;
- `oracle.ts` — initial read RPC;
- `server.ts` — process lifecycle и transport wiring.

Низкоуровневые тесты могут открывать Boundary напрямую:

```ts
import {open} from "boundary/sqlite"

const boundary = await open(":memory:")
try {
  await boundary.materialize(message)
} finally {
  await boundary.close()
}
```

Production domains не открывают SQLite напрямую.
