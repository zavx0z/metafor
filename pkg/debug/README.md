# @metafor/bun-debug

`@metafor/bun-debug` — sidecar-пакет для совместной отладки Bun через WebKit Inspector Protocol.
Он подключается к тому же inspector WebSocket, что и человек в WebStorm или Chrome `debug.bun.sh`, и пишет snapshot остановленного процесса в JSON.

Основной сценарий:

1. Человек ставит breakpoint-ы и шагает в WebStorm или Chrome.
2. Sidecar подключён вторым inspector-клиентом.
3. При остановке sidecar пишет snapshot с call frames и top-frame scopes.
4. Агент в чате читает snapshot или отправляет NDJSON-команды для `eval`, `props`, `step`, `resume`.

Sidecar запускается отдельным процессом, чтобы crash/debug WebSocket не валил основной чат.

## Установка В Репозитории

Пакет находится в workspace:

```text
pkg/debug
```

CLI entrypoint:

```text
pkg/debug/agent-attach.ts
```

Dark compatibility wrapper:

```text
dark/debug/agent-attach.ts
```

## Быстрый Старт

Запустить отлаживаемый Bun-процесс:

```sh
bun test --timeout=2147483647 --inspect-wait=ws://127.0.0.1:6499/dark dark/server.spec.ts
```

`--timeout=2147483647` нужен для ручной отладки тестов: пока ты стоишь на breakpoint-е, Bun test иначе может завершить тест по timeout.

Запустить sidecar во втором терминале:

```sh
bun run dark/debug/agent-attach.ts
```

Подключить человеческий debugger:

```text
WebStorm: Bun Attach -> ws://127.0.0.1:6499/dark
Chrome:   https://debug.bun.sh/#127.0.0.1:6499/dark
```

Важно: для этого workflow target запускается из терминала с TCP inspector URL.
WebStorm здесь используется как `Bun Attach`.
Если запускать тест кнопкой Run/Debug в WebStorm, JetBrains Bun plugin может поднять inspector через `ws+unix://...`, и sidecar с default TCP URL к нему не подключится.

Когда target остановился на breakpoint-е, snapshot будет здесь:

```text
dark/debug/.agent-state.json
```

Sidecar должен быть запущен до breakpoint-а, который агент должен увидеть.
Если Chrome/WebStorm уже стоит на breakpoint-е, а sidecar запущен только после этого, Bun 1.3.13 обычно начнёт обслуживать второй клиент только после `Step`/`Resume` и следующей остановки.

Если используется package CLI без dark wrapper:

```sh
bun run pkg/debug/agent-attach.ts
```

Snapshot по умолчанию:

```text
.metafor/debug/agent-state.json
```

## Переменные Окружения

`BUN_INSPECTOR_URL`

Inspector WebSocket endpoint.

Default package CLI:

```text
ws://127.0.0.1:6499/bun
```

Default dark wrapper:

```text
ws://127.0.0.1:6499/dark
```

`AGENT_DUMP_PATH`

Путь JSON snapshot.

`AGENT_EVENT_LOG_PATH`

Путь NDJSON event log.

`AGENT_INITIALIZE_FALLBACK_MS`

Задержка перед автоматическим `Inspector.initialized`.

Default:

```text
30000
```

Отключить автоматическую разблокировку `--inspect-wait`:

```sh
AGENT_INITIALIZE_FALLBACK_MS=0 bun run dark/debug/agent-attach.ts
```

Smoke-test режим:

```sh
AGENT_INITIALIZE_FALLBACK_MS=1000 bun run dark/debug/agent-attach.ts
```

`AGENT_REQUEST_TIMEOUT_MS`

Timeout inspector request. Default: `10000`.

`AGENT_RECONNECT_DELAY_MS`

Reconnect delay. Default: `1000`.

## Timeout Тестов

Для breakpoint-debugging тестов всегда поднимать Bun test timeout:

```sh
bun test --timeout=2147483647 --inspect-wait=ws://127.0.0.1:6499/dark dark/server.spec.ts
```

`2147483647` ms — примерно 24.8 дней.
Это практический максимум для timer-based timeout.

## Команды Агента

Команды читаются из stdin в формате NDJSON.
Ответы пишутся в stdout в формате NDJSON.
Status и logs пишутся в stderr/event log.

Получить последние frames:

```json
{"cmd":"frames"}
```

Вычислить выражение в top frame:

```json
{"cmd":"eval","frame":0,"expr":"wimp.children.length"}
```

Прочитать свойства objectId:

```json
{"cmd":"props","objectId":"{\"injectedScriptId\":1,\"id\":7}"}
```

Попросить Bun остановиться:

```json
{"cmd":"pause"}
```

Step:

```json
{"cmd":"step","kind":"over"}
{"cmd":"step","kind":"into"}
{"cmd":"step","kind":"out"}
```

Resume:

```json
{"cmd":"resume"}
```

## Проверка

Typecheck:

```sh
bun run --filter @metafor/bun-debug typecheck
```

Build smoke:

```sh
bun build pkg/debug/agent-attach.ts --target=bun --outdir /tmp/pkg-debug-check
```

Dark wrapper build smoke:

```sh
bun build dark/debug/agent-attach.ts --target=bun --outdir /tmp/dark-debug-wrapper-check
```

## Документация

- [Архитектура](docs/architecture.md)
- [Bun Inspector Protocol](docs/bun-inspector.md)
- [Snapshot и NDJSON API](docs/api.md)
- [Workflow WebStorm/Chrome](docs/workflow.md)
- [Acceptance сценарий](docs/acceptance.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Источники](docs/references.md)
