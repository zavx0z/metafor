# Acceptance Сценарий

Этот сценарий проверяет реальный collaborative debugging loop.

## 1. Запустить Target

```sh
bun test --timeout=2147483647 --inspect-wait=ws://127.0.0.1:6499/dark dark/server.spec.ts
```

`--timeout=2147483647` нужен, чтобы тест не упал, пока человек долго стоит на breakpoint-е.
Это около 24.8 дней на тест.

Ожидаемый banner:

```text
Listening:
  ws://127.0.0.1:6499/dark
Inspect in browser:
  https://debug.bun.sh/#127.0.0.1:6499/dark
```

## 2. Запустить Sidecar

```sh
bun run dark/debug/agent-attach.ts
```

Ожидаемый stderr:

```text
[bun-debug-agent] attaching to ws://127.0.0.1:6499/dark
[bun-debug-agent] inspector socket connected
```

## 3. Подключить Человеческий Debugger

WebStorm:

```text
Bun Attach -> ws://127.0.0.1:6499/dark
```

Или Chrome:

```text
https://debug.bun.sh/#127.0.0.1:6499/dark
```

## 4. Поставить Breakpoint

Поставить breakpoint в прикладном коде, например в `dark/server.ts`.

В human-led режиме breakpoint ставит человек.
Sidecar только слушает `Debugger.paused` и пишет snapshot.

## 5. Дождаться Остановки

Когда breakpoint сработал, должен появиться файл:

```text
dark/debug/.agent-state.json
```

Проверить:

```sh
cat dark/debug/.agent-state.json
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

## 7. Step В IDE

Человек делает Step Over/Into/Out в IDE.

Если Bun снова остановился, sidecar должен автоматически записать новый snapshot.

## Automated Smoke С REST Breakpoint

Для smoke без ручного debugger sidecar может сам запустить target и принять breakpoint:

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
