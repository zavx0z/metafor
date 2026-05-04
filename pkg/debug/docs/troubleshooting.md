# Troubleshooting

## EADDRINUSE

Если Bun inspector не может стартовать:

```text
error: Failed to start server. Is port 6499 in use?
```

Проверить порт:

```sh
lsof -nP -iTCP:6499 -sTCP:LISTEN
```

Временно перейти на другой port:

```sh
bun test --timeout=2147483647 --inspect-wait=ws://127.0.0.1:6501/dark dark/server.spec.ts
BUN_INSPECTOR_URL=ws://127.0.0.1:6501/dark bun run dark/debug/agent-attach.ts
```

## Тест Падает По Timeout Пока Стоит Breakpoint

Запускать тест с максимальным timeout:

```sh
bun test --timeout=2147483647 --inspect-wait=ws://127.0.0.1:6499/dark dark/server.spec.ts
```

`2147483647` ms — примерно 24.8 дней.
Этого достаточно для ручной отладки без изменения прикладного теста.

## Sidecar Не Подключается

Проверить:

- inspector target реально запущен
- port совпадает
- path совпадает, например `/dark`
- `BUN_INSPECTOR_URL` указан полностью

Правильно:

```text
ws://127.0.0.1:6499/dark
```

Неправильно, если target слушает `/dark`:

```text
ws://127.0.0.1:6499
```

Если target запущен кнопкой Run/Debug в WebStorm, проверить env процесса:

```sh
ps eww -p <bun-pid> | rg BUN_INSPECT
```

Если там `BUN_INSPECT=ws+unix://...`, это не TCP endpoint из инструкции.
Для стандартного workflow перезапустить target из терминала:

```sh
bun test --timeout=2147483647 --inspect-wait=ws://127.0.0.1:6499/dark dark/server.spec.ts
```

А WebStorm подключить через `Bun Attach`.

## Dump Не Появляется

Dump появляется только после `Debugger.paused`.

Проверить:

- target действительно paused
- breakpoint сработал
- sidecar подключён
- event log содержит `Debugger.paused`

Event log:

```sh
tail -n 80 dark/debug/.agent-events.log
```

Если в логе есть:

```text
Debugger.enable: Debugger domain already enabled (-32000)
```

Это нормальная ситуация, когда Chrome/WebStorm уже включил debugger domain.
Актуальный sidecar игнорирует эту ошибку и продолжает слушать target.
Если после этой строки идут постоянные reconnect/timeout-сообщения, перезапустить sidecar на свежей версии кода.

## Sidecar Запущен После Того, Как Chrome Уже Стоит На Breakpoint

В Bun 1.3.13 это отдельный edge case.
Если target уже paused, новый WebSocket-клиент может подключиться, но Bun не будет обрабатывать его
inspector messages до выхода из текущей pause.

Симптомы в event log:

```text
socket.open
inspector.request.soft_timeout method=Inspector.enable
inspector.request.soft_timeout method=Runtime.enable
inspector.request.soft_timeout method=Debugger.enable
```

Что делать:

1. Оставить sidecar запущенным.
2. В Chrome/WebStorm нажать `Step` или `Resume`.
3. Дождаться следующей остановки.
4. Проверить, что timestamp `dark/debug/.agent-state.json` обновился.

Для надёжного workflow запускать sidecar до попадания на breakpoint:

```sh
bun test --timeout=2147483647 --inspect-wait=ws://127.0.0.1:6499/dark dark/server.spec.ts
bun run dark/debug/agent-attach.ts
```

После этого подключать Chrome/WebStorm и ставить breakpoint.

## Процесс Начал Выполняться До Подключения IDE

Увеличить fallback:

```sh
AGENT_INITIALIZE_FALLBACK_MS=60000 bun run dark/debug/agent-attach.ts
```

Или отключить fallback:

```sh
AGENT_INITIALIZE_FALLBACK_MS=0 bun run dark/debug/agent-attach.ts
```

## Scopes Пустые

Возможные причины:

- остановка произошла в месте без локалов
- переменные оптимизированы или не видны в текущем frame
- target уже resumed и object ids устарели
- Bun/JSC не отдал displayable properties для конкретного scope

Что делать:

```json
{"cmd":"eval","frame":0,"expr":"typeof wimp"}
```

Или читать raw frames:

```json
{"cmd":"frames"}
```

## eval Говорит process is not paused

`Debugger.evaluateOnCallFrame` работает только пока target paused.

Нужно:

1. Дождаться breakpoint.
2. Проверить новый dump.
3. Повторить `eval`.

## Старый objectId Не Работает

`objectId` живёт только во время текущей остановки.
После resume/step он может стать невалидным.

Нужно получить новый dump и новый `objectId`.

## Runtime.runIfWaitingForDebugger Не Работает

Это ожидаемо.
Команда относится к Chrome DevTools Protocol.

Для Bun использовать:

```text
Inspector.initialized
```

## Breakpoint Через setBreakpointByUrl Резолвится, Но Не Останавливает

Это известное поведение Bun 1.3.13 для early logical URL breakpoint-ов.

Правильная схема для sidecar:

1. Не полагаться на `locations: []` из `Debugger.setBreakpointByUrl`.
2. Дождаться `Debugger.scriptParsed` целевого файла.
3. Использовать `sourceMapURL`, чтобы перевести editor line в generated line.
4. Ставить `Debugger.setBreakpoint` по конкретному `scriptId`.

Проверить установленные точки:

```sh
curl -sS http://127.0.0.1:6500/breakpoints
```

В event log должно быть:

```text
breakpoint.installed
Debugger.paused
agent.dump.written
```

Если `breakpoint.installed` есть, но `Debugger.paused` нет, проверить `generatedLocation` в event log:
скорее всего breakpoint был поставлен без source map или на строку, которая не исполняется.
