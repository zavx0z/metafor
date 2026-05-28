# Bun Inspector Protocol

Bun использует WebKit Inspector Protocol, а не Chrome DevTools Protocol.
Это главный источник отличий от Node.js inspector workflow.

## Важное Отличие

Bun inspector говорит WebKit Inspector Protocol.
Chrome DevTools Protocol clients и команды CDP не являются совместимым frontend для workflow интерпретатора.

CDP-команда:

```text
Runtime.runIfWaitingForDebugger
```

не разблокирует Bun `--inspect-wait`.
В Bun 1.3.13 она возвращает `-32601`, потому что метод не реализован.

## Frontend

Основной интерфейс в MetaFor — локальный UI интерпретатора:

```text
http://127.0.0.1:6500/
```

Этот документ фиксирует protocol behavior; рабочий frontend MetaFor остаётся локальным UI интерпретатора.

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
Если другой inspector client уже включил debugger domain, Bun может вернуть `Debugger domain already enabled`.
Sidecar считает это нормальным состоянием второго клиента и продолжает работу.

`Debugger.setBreakpointsActive`

Активирует breakpoint processing.
Без этого pause на breakpoint/debugger statement может не приходить ожидаемо.

`Debugger.setPauseOnDebuggerStatements`

Нужно, чтобы `debugger;` давал `Debugger.paused`.

`Inspector.initialized`

Разблокирует `--inspect-wait`.

## Почему Inspector.initialized Отложен

Если sidecar сразу отправит `Inspector.initialized`, тест или daemon начнёт выполняться до того, как интерпретатор успел поставить breakpoint-ы.

Поэтому default:

```text
AGENT_INITIALIZE_FALLBACK_MS=1500
```

То есть sidecar ждёт 1.5 секунды.
Если UI поставил breakpoint-ы быстро, target остановится на них.
Если breakpoint-ов нет, sidecar разблокирует target сам после fallback.

Для строгого интерактивного режима:

```sh
AGENT_INITIALIZE_FALLBACK_MS=0 bun run debug
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

В интерактивном workflow breakpoint-ы ставятся руками в интерпретаторе.
Sidecar при этом только слушает `Debugger.paused` и читает state.

## Debugger.pause

Команда доступна через NDJSON:

```json
{"cmd":"pause"}
```

Она отправляет:

```text
Debugger.pause
```

Это удобно для force-pause, но основной сценарий интерпретатора — human-owned breakpoint-ы в общем live-контексте.
