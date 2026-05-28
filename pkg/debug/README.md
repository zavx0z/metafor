# @metafor/bun-debug

Sidecar для совместной отладки Bun-процессов через WebKit Inspector Protocol.

Он подключается к Bun inspector WebSocket, пишет snapshot текущей остановки, даёт REST/WS API
для `eval`, `props`, `step`, `resume`, и умеет запускать target-процесс сам.

## Быстрый Старт Для `dark`

Обычный запуск UI без target:

```sh
bun run debug
```

Запуск сразу с target:

```sh
bun run debug -- ./module.ts
```

Если нужен тот же набор параметров, что у стандартного Bun debugger, передавай их перед файлом.
Аргументы программы остаются после `--`:

```sh
bun run debug -- --inspect-wait ./module.ts -- --flag value
bun run debug -- bun test --timeout=2147483647 ./module.spec.ts -- --grep case
```

Если `--inspect*` не указан, sidecar добавит `--inspect-brk=ws://127.0.0.1:6499/`, чтобы UI сразу попал в debugger.

UI и REST API:

```text
http://127.0.0.1:6500/
```

WebStorm:

```text
Run/Debug Configurations -> Bun Attach -> ws://127.0.0.1:6499/
```

Когда target остановится на breakpoint-е, snapshot будет здесь:

```text
.metafor/debug/agent-state.json
```

## Запуск Target Через REST

Sidecar может сам стартовать target и заранее принять breakpoint-ы в editor coordinates:

```sh
curl -sS -X POST http://127.0.0.1:6500/target/run \
  -H 'content-type: application/json' \
  -d '{
    "command": [
      "bun", "test", "--timeout=2147483647", "./module.spec.ts"
    ],
    "cwd": "/absolute/path/to/metafor",
    "breakpoints": [
      {"url": "/absolute/path/to/metafor/module.ts", "line": 46}
    ]
  }'
```

После остановки:

```sh
curl -sS http://127.0.0.1:6500/state
curl -sS -X POST http://127.0.0.1:6500/eval \
  -H 'content-type: application/json' \
  -d '{"frame":0,"expr":"wimp.src"}'
curl -sS -X POST http://127.0.0.1:6500/resume -d '{}'
```

Breakpoint-ы из REST ставятся после `Debugger.scriptParsed` по `scriptId` и с учётом source map,
поэтому `line` указывается как строка в исходном `.ts` файле.

## Основные REST Endpoints

```text
GET    /health
GET    /state
GET    /frames
GET    /scripts
GET    /events?limit=200
GET    /console?limit=200
GET    /breakpoints
GET    /target
POST   /target/run
POST   /target/stop
POST   /eval
POST   /props
POST   /pause
POST   /resume
POST   /step
POST   /breakpoint
DELETE /breakpoint
```

## Переменные Окружения

| Имя | Default |
|---|---|
| `BUN_INSPECTOR_URL` | `ws://127.0.0.1:6499/` |
| `AGENT_DUMP_PATH` | `.metafor/debug/agent-state.json` |
| `AGENT_HTTP_HOST` | `127.0.0.1` |
| `AGENT_HTTP_PORT` | `6500` |
| `AGENT_INITIALIZE_FALLBACK_MS` | `1500` |
| `AGENT_REQUEST_TIMEOUT_MS` | `10000` |

## Проверка

```sh
bun run --filter @metafor/bun-debug typecheck
```

## Документация

- [Архитектура](docs/architecture.md)
- [API](docs/api.md)
- [Workflow MetaFor UI/WebStorm](docs/workflow.md)
- [Bun Inspector Protocol](docs/bun-inspector.md)
- [Acceptance сценарии](docs/acceptance.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Источники](docs/references.md)
