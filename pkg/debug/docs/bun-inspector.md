# Bun Inspector Protocol

Bun использует WebKit Inspector Protocol, а не Chrome DevTools Protocol.
Это главный источник отличий от Node.js debugging.

## Что Не Работает

WebStorm `Attach to Node.js/Chrome` не подходит.
Эта конфигурация говорит CDP.

CDP-команда:

```text
Runtime.runIfWaitingForDebugger
```

не разблокирует Bun `--inspect-wait`.
В Bun 1.3.13 она возвращает `-32601`, потому что метод не реализован.

## Что Работает

Для WebStorm нужен JetBrains Bun plugin.
Он добавляет Bun-specific run/debug configuration.

Для браузера:

```text
https://debug.bun.sh/#127.0.0.1:<port>/<path>
```

Рекомендуется Chrome.
Safari может блокировать `ws://` с HTTPS-страницы.

## Handshake

Sidecar использует последовательность, совместимую с Bun debug adapter:

```text
Inspector.enable
Runtime.enable
Debugger.enable
Debugger.setAsyncStackTraceDepth({ depth: 200 })
Debugger.setBreakpointsActive({ active: true })
Debugger.setPauseOnDebuggerStatements({ enabled: true })
Debugger.setPauseOnExceptions({ state: "none" })
Inspector.initialized
```

Зачем нужны отдельные команды:

`Inspector.enable`

Включает inspector domain.

`Runtime.enable`

Позволяет использовать runtime methods и получать runtime events.

`Debugger.enable`

Включает debugger domain и даёт `Debugger.scriptParsed`, `Debugger.paused`, `Debugger.resumed`.
Если Chrome или WebStorm уже включили debugger domain, Bun может вернуть `Debugger domain already enabled`.
Sidecar считает это нормальным состоянием второго клиента и продолжает работу.

`Debugger.setBreakpointsActive`

Активирует breakpoint processing.
Без этого pause на breakpoint/debugger statement может не приходить ожидаемо.

`Debugger.setPauseOnDebuggerStatements`

Нужно, чтобы `debugger;` давал `Debugger.paused`.

`Inspector.initialized`

Разблокирует `--inspect-wait`.

## Почему Inspector.initialized Отложен

Если sidecar сразу отправит `Inspector.initialized`, тест или daemon начнёт выполняться до того, как человек подключил WebStorm и поставил breakpoint-ы.

Поэтому default:

```text
AGENT_INITIALIZE_FALLBACK_MS=1500
```

То есть sidecar ждёт 1.5 секунды.
Если IDE подключилась первой, она сама разблокирует target.
Если IDE не подключилась, sidecar разблокирует target сам.

Для строгого human-led режима:

```sh
AGENT_INITIALIZE_FALLBACK_MS=0 bun run dark/debug/agent-attach.ts
```

## Breakpoint-ы

В Bun 1.3.13 нельзя полагаться на early logical URL breakpoint как на готовую точку остановки.
Наблюдаемое поведение старой схемы:

- `Debugger.setBreakpointByUrl` может вернуть success
- Bun может прислать `Debugger.breakpointResolved`
- но `Debugger.paused` при попадании приходит не всегда

Рабочая схема sidecar:

```text
1. сохранить BreakpointSpec из /target/run или POST /breakpoint
2. дождаться Debugger.scriptParsed для matching url
3. взять sourceMapURL из scriptParsed
4. перевести editor line/column в generated line/column
5. вызвать Debugger.setBreakpoint({ location: { scriptId, lineNumber, columnNumber } })
```

`line` в REST API остаётся 1-based строкой исходного `.ts` файла, как в редакторе.

Почему нужен source map:

- Bun исполняет transpiled/generated JavaScript.
- `Debugger.setBreakpoint` принимает generated coordinates.
- `Debugger.paused` тоже отдаёт generated coordinates.
- Sidecar маппит breakpoint туда и snapshot обратно в editor coordinates.

Для human-led workflow всё ещё можно ставить breakpoint-ы руками в WebStorm/Chrome.
Sidecar при этом только слушает `Debugger.paused` и читает state.

## Подключение Вторым Клиентом К Уже Остановленному Target

Практическое ограничение Bun 1.3.13: если Chrome/WebStorm уже остановил target на breakpoint-е,
а sidecar подключается только после этой остановки, Bun принимает WebSocket, но может не обработать
`Inspector.enable`/`Runtime.enable`/`Debugger.enable` до выхода из текущей pause.

Причина по исходникам Bun: пока VM находится внутри `runWhilePaused`, список inspector connections
берётся один раз. Новый connection, добавленный во время этой же pause, будет обслужен только после
`Step`/`Resume`, когда выполнение выйдет из текущего paused-loop.

Практическое правило:

```text
sidecar должен быть запущен до breakpoint-а, на котором агент должен видеть live state
```

Если sidecar запущен уже после остановки в Chrome/WebStorm, он обычно начнёт получать события со
следующего breakpoint/step-pause.

## Debugger.pause

Команда доступна через NDJSON:

```json
{"cmd":"pause"}
```

Она отправляет:

```text
Debugger.pause
```

Это удобно для force-pause, но основной сценарий совместной отладки — human-owned breakpoint-ы.
