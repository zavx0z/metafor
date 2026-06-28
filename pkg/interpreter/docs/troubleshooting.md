# Troubleshooting

## FIXME: Длинная Голосовая Диктовка Теряет Текст

Известная проблема: при длинной диктовке, примерно от 30 секунд и дольше,
ASR partial-текст начинает долго корректироваться, а финальная отправка в host/module terminal
может потерять часть текста или отправить текст с форматированием, отличающимся от preview.

Что уже проверено:

- нельзя использовать terminal input / `TerminalPane` preview как промежуточный буфер для длинной диктовки
- нельзя писать промежуточные ASR chunks напрямую через `sendHostTerminalInput` или `appendModuleTerminalInputText`
- такой подход конфликтует с `setInputPreview`, local echo, authoritative terminal output и очисткой preview по статусам

Безопасное направление будущего fix:

1. Оставить текущий короткий voice input path без изменений.
2. Для длинной диктовки держать отдельный JS draft buffer вне terminal input.
3. Показывать preview как `stableDraft + currentPartial`, не мутируя terminal input.
4. В terminal отправлять только один финальный текст после silence/final commit.
5. Перед повторной реализацией добавить тестовый harness, который симулирует sequence:
   `partial -> duration chunk -> partial -> final chunk`.

До отдельной реализации long-dictation fix этот сценарий не трогать в production-коде.

## EADDRINUSE

Если protocol socket Bun не может стартовать:

```text
error: Failed to start server. Is port 6499 in use?
```

Проверить порт:

```sh
lsof -nP -iTCP:6499 -sTCP:LISTEN
```

Временно перейти на другой port:

```sh
bun test --timeout=2147483647 --inspect-wait=ws://127.0.0.1:6501/ ./module.spec.ts
BUN_PROTOCOL_URL=ws://127.0.0.1:6501/ bun run interpreter
```

## Белый Экран После Restart Host

Если страница интерпретатора перезагрузилась во время короткого restart host process, browser может открыть пустой ответ или потерять WebSocket раньше, чем новый host поднялся.

Нормальный путь для tmux-контура:

```sh
curl -sS -X POST http://127.0.0.1:6500/restart
```

Этот endpoint отправляет UI-клиентам delayed reload, а клиент перед настоящей перезагрузкой ждёт успешный `/health`. Если белый экран всё равно появился, проверь, что открыта свежая версия `pkg/interpreter/web/main.ts`, а host действительно поднят:

```sh
curl -sS http://127.0.0.1:6500/health
curl -sS http://127.0.0.1:6500/context
```

Не добавляй постоянные repaint/polling loops в UI ради этого симптома: причина должна решаться lifecycle-ом host restart и ожиданием готовности server.

## 502 Bad Gateway От Nginx

502 на `meta.proizvodstvo1.ru` или embedded interpreter routes обычно означает,
что nginx жив, но upstream interpreter/app-web не слушает `10.66.0.10:6500`
или `10.66.0.10:3004`.

Проверить:

```sh
curl -sS http://10.66.0.10:6500/health
curl -sS http://10.66.0.10:3004/health
ss -ltnp | rg '(:6500|:3004)\b'
tmux list-panes -a -F '#{session_name}:#{window_index}.#{pane_index} pid=#{pane_pid} cmd=#{pane_current_command}'
tmux capture-pane -pt metafor-interpreter-host -S -80
```

Не считай `tmux ls` достаточной проверкой. Session
`metafor-interpreter-host` может существовать, но внутри может быть shell или
старый Codex, а не interpreter host.

Безопасное восстановление, если session занята не interpreter host:

```sh
tmux rename-session -t metafor-interpreter-host metafor-interpreter-host-codex-old
tmux new-session -d -s metafor-interpreter-host \
  -c /home/zavx0z/production/vendor/metafor \
  /home/zavx0z/metafor-interpreter-web-dev/run.sh
```

После старта дождись `/health` на обоих портах и отправь reload клиентам:

```sh
curl -sS http://10.66.0.10:6500/health
curl -sS http://10.66.0.10:3004/health
curl -sS -X POST http://10.66.0.10:6500/reload
```

## Тест Падает По Timeout Пока Стоит Breakpoint

Запускать тест с максимальным timeout:

```sh
bun test --timeout=2147483647 --inspect-wait=ws://127.0.0.1:6499/ ./module.spec.ts
```

`2147483647` ms — примерно 24.8 дней.
Этого достаточно для интерактивного выполнения без изменения прикладного теста.

## Интерпретатор Не Подключается

Проверить:

- модуль реально запущен
- port совпадает
- `BUN_PROTOCOL_URL` указан полностью

Правильно:

```text
ws://127.0.0.1:6499/
```

Неправильно, если модуль ожидает canonical URL со slash:

```text
ws://127.0.0.1:6499
```

Для стандартного workflow перезапустить модуль через MetaFor launcher:

```sh
bun run interpreter ./module.spec.ts -timeout=2147483647
```

## Dump Не Появляется

Dump появляется только после `Debugger.paused`.

Проверить:

- модуль действительно paused
- breakpoint сработал
- интерпретатор подключён
- event log содержит `Debugger.paused`

Event log:

```sh
tail -n 80 .metafor/interpreter/events.log
```

Если в логе есть:

```text
Debugger.enable: Debugger domain already enabled (-32000)
```

Это нормальная ситуация, когда интерпретатор уже включил Debugger domain.
Актуальный интерпретатор игнорирует эту ошибку и продолжает слушать модуль.
Если после этой строки идут постоянные reconnect/timeout-сообщения, перезапустить интерпретатор на свежей версии кода.

Для надёжного workflow запускать интерпретатор до попадания на breakpoint:

```sh
bun run interpreter ./module.spec.ts -timeout=2147483647
```

После этого открывать интерпретатор и ставить breakpoint.

## Процесс Начал Выполняться До Breakpoint-а

Увеличить fallback:

```sh
INTERPRETER_INITIALIZE_FALLBACK_MS=60000 bun run interpreter
```

Или отключить fallback:

```sh
INTERPRETER_INITIALIZE_FALLBACK_MS=0 bun run interpreter
```

## Scopes Пустые

Возможные причины:

- остановка произошла в месте без локалов
- переменные оптимизированы или не видны в текущем frame
- модуль уже resumed и object ids устарели
- Bun/JSC не отдал displayable properties для конкретного scope

Что делать:

```json
{"cmd":"eval","frame":0,"expr":"typeof wimp"}
```

Или читать raw frames:

```json
{"cmd":"frames"}
```

## eval Говорит module is not paused

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

Для Bun интерпретатор отправляет собственную protocol initialization command.

Это внутренняя wire-деталь, наружу в UI и логи она выводится как `Protocol.initialized`.

## Breakpoint Через setBreakpointByUrl Резолвится, Но Не Останавливает

Это известное поведение Bun 1.3.13 для early logical URL breakpoint-ов.

Правильная схема для интерпретатора:

1. Не полагаться на `locations: []` из `Debugger.setBreakpointByUrl`.
2. Дождаться `Debugger.scriptParsed` целевого файла.
3. Использовать `sourceMapURL`, чтобы перевести editor line в generated line.
4. Ставить `Debugger.setBreakpoint` по конкретному `scriptId`.

Проверить установленные точки:

```sh
curl -sS http://127.0.0.1:6500/processes/<process-id>/breakpoints
```

В event log должно быть:

```text
breakpoint.installed
Debugger.paused
interpreter.dump.written
```

Если `breakpoint.installed` есть, но `Debugger.paused` нет, проверить `generatedLocation` в event log:
скорее всего breakpoint был поставлен без source map или на строку, которая не исполняется.
