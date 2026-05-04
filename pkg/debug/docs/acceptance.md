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

Breakpoint ставит человек.
Sidecar не должен программно ставить breakpoint.

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

## Automated Smoke

Для smoke без ручного debugger можно использовать короткий fallback:

```sh
AGENT_INITIALIZE_FALLBACK_MS=1000 bun run dark/debug/agent-attach.ts
```

Так проверяется:

- WebSocket connect
- handshake
- `Inspector.initialized`
- прохождение `--inspect-wait`

Полная проверка `Debugger.paused` требует реальной остановки: human breakpoint, `debugger;` во временном smoke target или `pause` command.
