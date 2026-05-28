# Workflow Интерпретатора

Интерпретатор — общий runtime/source-контекст человека и ИИ. Человек работает в UI, агент читает тот же
snapshot, stack, scopes, source и может выполнять точные runtime-запросы через sidecar. Черновик кода живёт
в этом же контексте, поэтому изменения можно обсуждать и готовить в реальном времени.

## Запуск

Запустить sidecar и target одной командой:

```sh
bun run interpreter -- ./module.ts
```

Если нужны стандартные параметры Bun inspector, передать их как обычные Bun args:

```sh
bun run interpreter -- --inspect-wait ./module.ts -- --flag value
bun run interpreter -- bun test --timeout=2147483647 ./module.spec.ts -- --grep case
```

Если `--inspect*` не указан, sidecar добавит `--inspect-brk=ws://127.0.0.1:6499/`.
Если `--inspect`, `--inspect-wait` или `--inspect-brk` уже указан, sidecar сохраняет выбранный режим и только подставляет endpoint.
UI доступен на `http://127.0.0.1:6500/`.

На стартовом экране можно выбрать файл из workspace. Для `.spec.ts` и `.test.ts` UI формирует команду
`bun test --timeout=2147483647 <file>`, для остальных entrypoints — `bun <file>`.

Несколько процессов:

```sh
bun run interpreter -- \
  --session dark-server -- bun test --timeout=2147483647 dark/server.spec.ts \
  --session syntax -- bun test pkg/interpreter/src/syntax.test.ts
```

В UI это один WebGPU `Space` и несколько `UIDisplay` в ряд, по одному на process/session.

## Timeout Тестов

При ручной отладке тестов использовать максимальный timeout:

```sh
bun test --timeout=2147483647 --inspect-wait=ws://127.0.0.1:6499/ ./module.spec.ts
```

Если timeout не поднять, тест может завершиться, пока execution стоит на breakpoint-е.

## Единый Контекст

В одном live-контексте находятся:

- человек, который управляет breakpoint-ами, stepping и визуально смотрит source/stack/scope;
- ИИ-агент, который читает тот же snapshot, выполняет `eval`/`props` и предлагает изменения;
- черновик кода в shared editor layer, где можно готовить правку без немедленной записи в файл.

MetaFor UI является основным frontend интерпретатора.

## Роль REST Breakpoint-ов

Для automation и smoke sidecar также умеет принимать breakpoint-ы:

```sh
curl -sS -X POST http://127.0.0.1:6500/target/run \
  -H 'content-type: application/json' \
  -d '{
    "command": ["bun","test","--timeout=2147483647","./module.spec.ts"],
    "cwd": "/absolute/path/to/metafor",
    "breakpoints": [{"url": "/absolute/path/to/metafor/module.ts", "line": 46}]
  }'
```

Интерпретатор не использует flaky early `setBreakpointByUrl`.
Для локальных TS/TSX файлов он ждёт `Debugger.scriptParsed`, маппит editor coordinates через source map и ставит конкретный
`Debugger.setBreakpoint` по `scriptId`, чтобы не получить скрытый runtime-line breakpoint.

## Роль Runtime-Слоя Интерпретатора

Runtime-слой интерпретатора:

- подключается к Bun protocol socket
- слушает `Debugger.paused`
- пишет snapshot
- выполняет точечные команды `eval`, `props`, `step`, `resume`, `pause`
- ставит REST breakpoint-ы по `scriptId` после `Debugger.scriptParsed`, если они переданы через `/target/run` или `POST /breakpoint`

## Роль Агента В Чате

Агент:

- запускает интерпретатор
- читает `.metafor/interpreter/state.json`
- интерпретирует top-frame locals/closures
- отправляет NDJSON-команды, когда нужен точный runtime ответ

Пример:

```text
проверь длину wimp.children
```

Команда sidecar:

```json
{"cmd":"eval","frame":0,"expr":"wimp.children.length"}
```

## Настройка Fallback

Если человек должен успеть подключиться первым:

```sh
INTERPRETER_INITIALIZE_FALLBACK_MS=30000 bun run interpreter
```

Если sidecar не должен разблокировать target вообще:

```sh
INTERPRETER_INITIALIZE_FALLBACK_MS=0 bun run interpreter
```

Если нужен automation smoke-test:

```sh
INTERPRETER_INITIALIZE_FALLBACK_MS=1000 bun run interpreter
```
