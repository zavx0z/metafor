# Workflow Интерпретатора

Интерпретатор — общий runtime/source-контекст человека и ИИ. Человек работает в UI, агент читает тот же snapshot, stack, scopes, source и может выполнять точные runtime-запросы. Черновик кода живёт в этом же контексте, поэтому изменения можно обсуждать и готовить в реальном времени.

## Запуск

UI без стартового модуля:

```sh
bun run interpreter
```

Один модуль:

```sh
bun run interpreter ./module.ts
```

Тестовый модуль с Bun-параметрами:

```sh
bun run interpreter ./module.spec.ts -timeout=2147483647 -grep=case
```

Несколько модулей:

```sh
bun run interpreter dark/server.spec.ts -timeout=2147483647 pkg/interpreter/src/syntax.test.ts
```

Правило CLI:

- путь без `-` начинает новый модуль;
- параметры с `-` после пути относятся к этому модулю;
- `-param=value` нормализуется в `--param=value`;
- относительные и абсолютные пути поддерживаются.

Для `*.spec.ts` и `*.test.ts` интерпретатор запускает `bun test <params> <path>`. Для остальных JS/TS entrypoint-ов — `bun <path> <params>`.

UI доступен на `http://127.0.0.1:6500/`.

## UIDisplay

UI создаёт один WebGPU `Space` и несколько равноправных `UIDisplay`, по одному на модуль. Дисплеи раскладываются в ряд; ни один из них не является default/main display.

## Timeout Тестов

При ручной остановке тестов использовать максимальный timeout:

```sh
bun run interpreter ./module.spec.ts -timeout=2147483647
```

Если timeout не поднять, тест может завершиться, пока execution стоит на breakpoint-е.

## Единый Контекст

В одном live-контексте находятся:

- человек, который управляет breakpoint-ами, stepping и визуально смотрит source/stack/scope;
- ИИ-агент, который читает тот же snapshot, выполняет `eval`/`props` и предлагает изменения;
- черновик кода в shared editor layer, где можно готовить правку без немедленной записи в файл.

MetaFor UI является основным frontend интерпретатора. Подключение к WebStorm/DevTools в этом workflow не используется.

## Runtime-Слой

Runtime-слой интерпретатора:

- подключается к Bun protocol socket;
- слушает `Debugger.paused`;
- пишет snapshot;
- выполняет точечные команды `eval`, `props`, `step`, `resume`, `pause`;
- ставит breakpoint-ы после `Debugger.scriptParsed` по конкретному `scriptId`, чтобы не получить скрытый runtime-line breakpoint.

## Роль Агента В Чате

Агент:

- запускает интерпретатор;
- читает `.metafor/interpreter/state.json`;
- интерпретирует top-frame locals/closures;
- отправляет NDJSON/REST/WS-команды, когда нужен точный runtime ответ.

Пример:

```text
проверь длину wimp.children
```

Команда:

```json
{"cmd":"eval","frame":0,"expr":"wimp.children.length"}
```

## Fallback

Если человек должен успеть подключиться первым:

```sh
INTERPRETER_INITIALIZE_FALLBACK_MS=30000 bun run interpreter ./module.ts
```

Если интерпретатор не должен разблокировать модуль вообще:

```sh
INTERPRETER_INITIALIZE_FALLBACK_MS=0 bun run interpreter ./module.ts
```
