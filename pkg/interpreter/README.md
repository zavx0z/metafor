# MetaFor Интерпретатор

Интерпретатор — общий live-контекст человека и ИИ для Bun-модулей. Человек и агент видят один runtime/source-контекст, один stack/scope/source state, могут управлять паузой, stepping, eval и в реальном времени готовить изменения кода в общем редакторе.

Технически внутри используется Bun WebKit Inspector Protocol. Эта деталь не является отдельным пользовательским отладчиком и не требует WebStorm/DevTools: UI MetaFor является основным интерфейсом интерпретатора.

Один браузерный UI использует один WebGPU `Space` и один canvas. Каждый запущенный модуль получает свой равноправный `UIDisplay`; несколько дисплеев раскладываются в ряд внутри того же `Space`.

## Быстрый Старт

UI без стартового модуля:

```sh
bun run interpreter
```

Запуск одного модуля:

```sh
bun run interpreter ./module.ts
```

Тестовые файлы `*.spec.ts` и `*.test.ts` запускаются через `bun test`, остальные JS/TS entrypoint-ы — через `bun <path>`.

Параметры задаются после пути и принадлежат предыдущему модулю:

```sh
bun run interpreter ./module.spec.ts -timeout=2147483647 -grep=case
```

Одинарный `-param=value` нормализуется в Bun-форму `--param=value`; уже двойной `--param=value` сохраняется.

Несколько модулей:

```sh
bun run interpreter dark/server.spec.ts -timeout=2147483647 pkg/interpreter/src/syntax.test.ts
```

Относительные и абсолютные пути поддерживаются. Имя модуля в UI берётся из пути запуска.

UI и REST API:

```text
http://127.0.0.1:6500/
```

Snapshot текущей остановки:

```text
.metafor/interpreter/state.json
```

## REST Modules API

```text
GET    /modules
POST   /modules/run
POST   /modules/:id/run
POST   /modules/:id/stop
POST   /modules/:id/command
GET    /modules/:id/source
```

Пример запуска модуля через REST:

```sh
curl -sS -X POST http://127.0.0.1:6500/modules/run \
  -H 'content-type: application/json' \
  -d '{
    "id": "syntax",
    "label": "pkg/interpreter/src/syntax.test.ts",
    "command": ["bun", "test", "pkg/interpreter/src/syntax.test.ts"],
    "pauseOnStart": true
  }'
```

## Переменные Окружения

| Имя | Default |
|---|---|
| `BUN_INSPECTOR_URL` | `ws://127.0.0.1:6499/` |
| `INTERPRETER_DUMP_PATH` | `.metafor/interpreter/state.json` |
| `INTERPRETER_HTTP_HOST` | `127.0.0.1` |
| `INTERPRETER_HTTP_PORT` | `6500` |
| `INTERPRETER_INITIALIZE_FALLBACK_MS` | `1500` |
| `INTERPRETER_REQUEST_TIMEOUT_MS` | `10000` |

## Проверка

```sh
bun test pkg/interpreter/src/module-cli.test.ts
bun run --filter @metafor/interpreter typecheck
```

## Документация

- [Архитектура](docs/architecture.md)
- [API](docs/api.md)
- [Workflow интерпретатора](docs/workflow.md)
- [Bun Inspector Protocol](docs/bun-inspector.md)
- [Acceptance сценарии](docs/acceptance.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Источники](docs/references.md)
