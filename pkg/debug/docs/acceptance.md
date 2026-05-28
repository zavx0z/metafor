# Acceptance Сценарий Интерпретатора

Этот сценарий проверяет реальный collaborative interpreter loop: человек и ИИ находятся в одном runtime/source-контексте.

## 1. Запустить Target

```sh
bun run debug -- bun test --timeout=2147483647 ./module.spec.ts
```

`--timeout=2147483647` нужен, чтобы тест не упал, пока человек долго стоит на breakpoint-е.
Это около 24.8 дней на тест.

Sidecar добавит `--inspect-brk=ws://127.0.0.1:6499/`, запустит target и откроет UI/API на:

```text
http://127.0.0.1:6500/
```

## 2. Проверить Sidecar

Ожидаемые строки в stderr:

```text
[interpreter] connecting to ws://127.0.0.1:6499/
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
Sidecar только слушает `Debugger.paused` и пишет snapshot.

## 5. Дождаться Остановки

Когда breakpoint сработал, должен появиться файл:

```text
.metafor/debug/agent-state.json
```

Проверить:

```sh
cat .metafor/debug/agent-state.json
```

Внутри должны быть:

- `timestamp`
- `reason`
- `frames`
- top-frame `local`/`closure` scopes

## 6. Проверить eval

Отправить в stdin sidecar:

```json
{"cmd":"eval","frame":0,"expr":"wimp.children.length"}
```

Ожидается NDJSON response в stdout:

```json
{"seq":1,"ok":true,"cmd":"eval","result":{...}}
```

## 7. Step В Интерпретаторе

Человек делает Step Over/Into/Out в интерпретаторе.

Если Bun снова остановился, sidecar должен автоматически записать новый snapshot.

## Automated Smoke С REST Breakpoint

Для smoke без ручного UI sidecar может сам запустить target и принять breakpoint:

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

Так проверяется:

- WebSocket connect
- handshake
- `Inspector.initialized`
- `Debugger.scriptParsed`
- source-map mapping editor line -> generated line
- `Debugger.setBreakpoint` по `scriptId`
- `Debugger.paused`
- запись snapshot
- `Debugger.evaluateOnCallFrame`
- `Debugger.resume`

Минимальная проверка после pause:

```sh
curl -sS http://127.0.0.1:6500/state
curl -sS -X POST http://127.0.0.1:6500/eval \
  -H 'content-type: application/json' \
  -d '{"frame":0,"expr":"wimp.src"}'
curl -sS -X POST http://127.0.0.1:6500/resume -d '{}'
```
