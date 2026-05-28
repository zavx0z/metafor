# Workflow MetaFor UI/WebStorm

## WebStorm

Установить JetBrains Bun plugin.

Использовать Bun-specific configuration.
Не использовать:

```text
Attach to Node.js/Chrome
```

Эта конфигурация говорит CDP, а Bun inspector — WebKit Inspector Protocol.

## Запуск Через MetaFor UI

Запустить sidecar и target одной командой:

```sh
bun run debug -- ./module.ts
```

Если нужны стандартные параметры Bun debugger, передать их как обычные Bun args:

```sh
bun run debug -- --inspect-wait ./module.ts -- --flag value
bun run debug -- bun test --timeout=2147483647 ./module.spec.ts -- --grep case
```

Если `--inspect*` не указан, sidecar добавит `--inspect-brk=ws://127.0.0.1:6499/`.
UI доступен на `http://127.0.0.1:6500/`.

## Запуск С WebStorm

Можно запустить target отдельно:

```sh
bun test --timeout=2147483647 --inspect-wait=ws://127.0.0.1:6499/ ./module.spec.ts
bun run debug
```

WebStorm подключается attach-конфигурацией:

```text
Run/Debug Configurations -> Bun Attach -> ws://127.0.0.1:6499/
```

Важно: в этом workflow WebStorm используется именно как Attach.
Target запускается из терминала с `--inspect-wait=ws://127.0.0.1:6499/`.
Если нажать Run/Debug прямо в WebStorm, JetBrains Bun plugin может запустить Bun через `BUN_INSPECT=ws+unix://...`; это другой endpoint, и sidecar с TCP default его не увидит.

Дальше:

1. Поставить breakpoint в IDE.
2. Дождаться остановки.
3. Агент читает `.metafor/debug/agent-state.json`.
4. Агент при необходимости отправляет `eval` в sidecar stdin.
5. Человек делает Step Over/Into/Out в IDE.
6. Sidecar автоматически пишет новый dump на следующей остановке.

## Timeout Тестов

При ручной отладке тестов использовать максимальный timeout:

```sh
bun test --timeout=2147483647 --inspect-wait=ws://127.0.0.1:6499/ ./module.spec.ts
```

Если timeout не поднять, тест может завершиться, пока execution стоит на breakpoint-е.

## Роль Человека

Человек управляет:

- breakpoint-ами
- stepping
- визуальным осмотром stack/scope в IDE/browser

Это сделано намеренно.
Такой режим нужен для совместной интерактивной отладки: человек ведёт IDE/browser, sidecar читает live state.

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

Sidecar не использует flaky early `setBreakpointByUrl`.
Он ждёт `Debugger.scriptParsed`, маппит editor coordinates через source map и ставит конкретный
`Debugger.setBreakpoint` по `scriptId`.

## Роль Sidecar

Sidecar:

- подключается вторым inspector client
- слушает `Debugger.paused`
- пишет snapshot
- выполняет точечные команды `eval`, `props`, `step`, `resume`, `pause`
- ставит REST breakpoint-ы по `scriptId` после `Debugger.scriptParsed`, если они переданы через `/target/run` или `POST /breakpoint`

## Роль Агента В Чате

Агент:

- запускает sidecar
- читает `.metafor/debug/agent-state.json`
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
AGENT_INITIALIZE_FALLBACK_MS=30000 bun run debug
```

Если sidecar не должен разблокировать target вообще:

```sh
AGENT_INITIALIZE_FALLBACK_MS=0 bun run debug
```

Если нужен automation smoke-test:

```sh
AGENT_INITIALIZE_FALLBACK_MS=1000 bun run debug
```
