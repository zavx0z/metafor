# Acceptance Сценарий Интерпретатора

Этот сценарий проверяет реальный collaborative interpreter loop: человек и ИИ находятся в одном runtime/source-контексте.

## 1. Запустить Модуль

```sh
bun run interpreter ./module.spec.ts -timeout=2147483647
```

`--timeout=2147483647` нужен, чтобы тест не упал, пока человек долго стоит на breakpoint-е.
Это около 24.8 дней на тест.

Интерпретатор добавит `--inspect-brk=ws://127.0.0.1:6499/`, запустит модуль и откроет UI/API на:

```text
http://127.0.0.1:6500/
```

## 2. Проверить Интерпретатор

Ожидаемые строки в stderr:

```text
[interpreter] connecting to interpreter socket ws://127.0.0.1:6499/
[interpreter] socket connected
```

## 3. Открыть Интерпретатор

Открыть:

```text
http://127.0.0.1:6500/
```

## 4. Поставить Breakpoint

Поставить breakpoint в прикладном коде через editor gutter.

В режиме общего контекста breakpoint ставит человек в интерпретаторе.
Интерпретатор слушает `Debugger.paused` и пишет snapshot конкретного модуля.

## 5. Дождаться Остановки

Когда breakpoint сработал, должен появиться файл:

```text
.metafor/interpreter/state.json
```

Проверить:

```sh
cat .metafor/interpreter/state.json
```

Внутри должны быть:

- `timestamp`
- `reason`
- `frames`
- top-frame `local`/`closure` scopes

## 6. Проверить eval

Отправить REST action в конкретный process:

```sh
curl -sS -X POST http://127.0.0.1:6500/processes/<process-id>/action \
  -H 'content-type: application/json' \
  -d '{"action":"evaluate","params":{"frame":0,"expr":"wimp.children.length"}}'
```

Ожидается JSON response:

```json
{"ok":true,"action":"evaluate","reply":{...}}
```

## 7. Step В Интерпретаторе

Человек делает Step Over/Into/Out в интерпретаторе.

Если Bun снова остановился, интерпретатор должен автоматически записать новый snapshot.

## Automated Smoke С REST Breakpoint

Для smoke без ручного UI можно запустить модуль и передать breakpoint:

```sh
curl -sS -X POST http://127.0.0.1:6500/processes \
  -H 'content-type: application/json' \
  -d '{
    "processId": "module-spec",
    "label": "module.spec.ts",
    "command": [
      "bun", "test", "--timeout=2147483647", "./module.spec.ts"
    ],
    "cwd": "/absolute/path/to/metafor",
    "breakpoints": [
      {"url": "/absolute/path/to/metafor/module.ts", "line": 46}
    ]
  }'
```

Так проверяется:

- WebSocket connect
- protocol initialization
- `Debugger.scriptParsed`
- source-map mapping editor line -> generated line
- `Debugger.setBreakpoint` по `scriptId`
- `Debugger.paused`
- запись snapshot
- `Debugger.evaluateOnCallFrame`
- `Debugger.resume`

Минимальная проверка после pause:

```sh
curl -sS http://127.0.0.1:6500/processes
curl -sS -X POST http://127.0.0.1:6500/processes/module-spec/action \
  -H 'content-type: application/json' \
  -d '{"action":"evaluate","params":{"frame":0,"expr":"wimp.src"}}'
curl -sS -X POST http://127.0.0.1:6500/processes/module-spec/action \
  -H 'content-type: application/json' \
  -d '{"action":"resume","params":{}}'
```
