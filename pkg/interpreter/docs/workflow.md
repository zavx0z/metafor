# Workflow Интерпретатора

Интерпретатор — общий runtime/source-контекст человека и ИИ. Человек работает в UI, агент читает тот же snapshot, stack, scopes, source и может выполнять точные runtime-запросы. Изменения кода обсуждаются в том же контексте, где видны актуальная точка исполнения, значения и события модуля.

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

Browser-страница сейчас является host-слоем для canvas/input/WebSocket. Это не продуктовая граница интерпретатора: для XR тот же process-scoped state должен рендериться как `UIDisplay`-контент в общем `Space`.

## Перезапуск Модуля

Кнопка UI “Перезапустить модуль” всегда делает интерактивный restart: старый `--inspect*` вычищается из команды, а новый запуск отправляется с `pauseOnStart: true`.

Это нужно, чтобы короткий модуль или тест не завершался до того, как человек успел поставить breakpoint. Если нужен отдельный запуск без начальной остановки, использовать REST `POST /processes` с явным `pauseOnStart: false`.

После `exited`/`failed` runtime-команды `pause`, `resume`, `step` и `stop` в UI блокируются: текущего runtime-контекста уже нет. Доступным остаётся перезапуск модуля, просмотр вывода и событий.

Если browser-страница перезагружена после завершения модуля, UI восстанавливает последний видимый source из server snapshot или локального файла. Stack/scope при этом остаются пустыми, потому что live runtime-контекста уже нет.

## Timeout Тестов

При ручной остановке тестов использовать максимальный timeout:

```sh
bun run interpreter ./module.spec.ts -timeout=2147483647
```

Если timeout не поднять, тест может завершиться, пока execution стоит на breakpoint-е.

## Единый Контекст

В одном live-контексте находятся:

- человек, который управляет breakpoint-ами, stepping и визуально смотрит source/stack/scope;
- ИИ-агент, который читает тот же snapshot, выполняет `eval`/`props` и предлагает изменения.

MetaFor UI является основным frontend интерпретатора. Подключение к WebStorm/DevTools в этом workflow не используется.

## API-Редактирование Source

Когда агент или внешний host меняет код через `POST /processes/:id/source` или `POST /processes/:id/apply_patch`, UI получает `source-patched` и переводит соответствующий process display на измененный файл.

Переход выбирает первый измененный не-delete файл из patch payload, открывает его в source editor, раскрывает и выделяет файл в file tree и ставит cursor на первую измененную строку. Если patch не содержит line changes, cursor ставится на строку 1.

Если в target editor уже есть несохраненный dirty state или идет сохранение, авто-переход пропускается: API patch уже применен на диске, но UI не должен молча перетирать локальный редактор.

## SQLite HUD

SQLite HUD открывается из CLI входа `.sqlite` или через `POST /sqlite/open`. Панель можно свернуть и развернуть через `/hud/sqlite/dock|show|toggle`; свернутое состояние живет в HUD dock как отдельная вкладка, наравне с TODO и host terminal.

Открытая SQLite-панель обновляет выбранную таблицу автоматически: UI раз в секунду проверяет дешевый `/sqlite/fingerprint` для основного файла database и его `-wal`, а полный `/sqlite` payload перечитывает только если `version` изменился. `-shm` отдается только диагностически, потому что обычное чтение SQLite может менять shared-memory файл. Свернутая панель не поллит database.

Таблица ведет себя как row-based inspector:

- один клик выбирает строку целиком;
- `Shift` расширяет выделение диапазоном от anchor-строки;
- `Cmd` на macOS и `Ctrl` на других системах добавляют или снимают отдельные строки;
- двойной клик по editable cell открывает локальный редактор ячейки;
- обычный одиночный клик не должен начинать редактирование.

Выделенные строки публикуются в `GET /context` как `context.hud.sqlite`. Snapshot содержит активную базу, выбранную таблицу, `selectedRowIds`, `selectedRowCount` и первые выбранные строки в `selectedRows`. Это намеренно компактный контекст для агента, а не полный dump таблицы; при превышении лимита выбранных строк выставляется `selectionTruncated:true`.

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
