# Boundary runtime

Канонические понятия MetaFor определяются в
[`zavx0z/concept`](https://github.com/zavx0z/concept). Этот файл описывает
только текущую Boundary implementation.

## Entry и storage

`boundary/server.ts`:

1. выбирает database path;
2. создаёт parent directory;
3. открывает SQLite через `boundary/sqlite.ts`;
4. поднимает Boundary Monad HTTP endpoint;
5. регистрирует в Force RPC метод первоначального чтения;
6. подключает Particle transport `Force("boundary")`;
7. применяет входные messages через `boundary.materialize(message)`;
8. отправляет возвращённые messages после commit;
9. закрывает server и database через Force shutdown hook.

Приоритет пути:

1. первый позиционный аргумент;
2. `BOUNDARY_PATH`;
3. `.metafor/dev.sqlite` в корне репозитория.

Health response содержит фактически открытый absolute database path и состояние
регистрации `rpc`.

## Development и tests

Development server использует persistent file. Tests открывают собственные
`:memory:` databases и закрывают их в `afterEach`; они не читают и не
изменяют `.metafor/dev.sqlite`.

Явный запуск Boundary с отдельным файлом:

```bash
BOUNDARY_PATH=/absolute/path/boundary.sqlite bun run --filter boundary start
```

## Реализованные handlers

- `inflaton` от Dark по одной сущности изменяет нормализованные таблицы;
- обычные канонические consequences после commit продолжают идти как Particle;
- `boundary.initialState.read` через Force RPC возвращает нормализованные
  канонические строки для первоначального рождения Matrix;
- Boundary не собирает Matrix Store/Weak и не отправляет стартовый snapshot как
  `graviton/replace`;
- остальные messages проходят через `materialize()`.

Meta-файл в Boundary не попадает. Здесь нет внутренней сущности Meta, JSON-копии
декларации и slash-пути, кодирующего её дерево. WIMP хранится по своему `src`, а
его Fields, States, Processes, Matter и остальные декларационные сущности — в
отдельных реляционных таблицах по детерминированным локальным индексам.

## Низкоуровневый API

```ts
import {open} from "boundary/sqlite"

const boundary = await open(filename)
try {
  await boundary.materialize(message)
} finally {
  await boundary.close()
}
```

Production domains не открывают эту database напрямую; test imports
используются для fixtures и assertions.
