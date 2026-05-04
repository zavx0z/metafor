# @metafor/bun-debug

Sidecar для совместной отладки Bun-процессов через WebKit Inspector Protocol.

Он подключается к тому же inspector WebSocket, что WebStorm или Chrome `https://debug.bun.sh`,
пишет snapshot текущей остановки, даёт REST/WS API для `eval`, `props`, `step`, `resume`, и умеет
запускать target-процесс сам.

## Быстрый Старт Для `dark`

Терминал 1:

```sh
bun run dark/debug/agent-attach.ts
```

UI и REST API будут доступны здесь:

```text
http://127.0.0.1:6500/
```

Терминал 2:

```sh
bun test --timeout=2147483647 --inspect-wait=ws://127.0.0.1:6499/dark dark/server.spec.ts
```

Chrome:

```text
https://debug.bun.sh/#127.0.0.1:6499/dark
```

WebStorm:

```text
Run/Debug Configurations -> Bun Attach -> ws://127.0.0.1:6499/dark
```

Когда target остановится на breakpoint-е, snapshot будет здесь:

```text
dark/debug/.agent-state.json
```

## Запуск Target Через REST

Sidecar может сам стартовать target и заранее принять breakpoint-ы в editor coordinates:

```sh
curl -sS -X POST http://127.0.0.1:6500/target/run \
  -H 'content-type: application/json' \
  -d '{
    "command": [
      "bun", "test", "dark/server.spec.ts",
      "--timeout=2147483647",
      "--inspect-wait=ws://127.0.0.1:6499/dark"
    ],
    "cwd": "/absolute/path/to/metafor",
    "breakpoints": [
      {"url": "/absolute/path/to/metafor/dark/server.ts", "line": 46}
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
| `BUN_INSPECTOR_URL` | `ws://127.0.0.1:6499/bun` |
| `AGENT_DUMP_PATH` | `.metafor/debug/agent-state.json` |
| `AGENT_HTTP_HOST` | `127.0.0.1` |
| `AGENT_HTTP_PORT` | `6500` |
| `AGENT_INITIALIZE_FALLBACK_MS` | `1500` |
| `AGENT_REQUEST_TIMEOUT_MS` | `10000` |

`dark/debug/agent-attach.ts` переопределяет defaults на `/dark` и `dark/debug/.agent-state.json`.

## Проверка

```sh
bun run --filter @metafor/bun-debug typecheck
```

## Документация

- [Архитектура](docs/architecture.md)
- [API](docs/api.md)
- [Workflow WebStorm/Chrome](docs/workflow.md)
- [Bun Inspector Protocol](docs/bun-inspector.md)
- [Acceptance сценарии](docs/acceptance.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Источники](docs/references.md)
