# Workflow WebStorm/Chrome

## WebStorm

Установить JetBrains Bun plugin.

Использовать Bun-specific configuration.
Не использовать:

```text
Attach to Node.js/Chrome
```

Эта конфигурация говорит CDP, а Bun inspector — WebKit Inspector Protocol.

## Запуск С WebStorm

Терминал 1:

```sh
bun test --timeout=2147483647 --inspect-wait=ws://127.0.0.1:6499/dark dark/server.spec.ts
```

Терминал 2:

```sh
bun run dark/debug/agent-attach.ts
```

WebStorm:

```text
Run/Debug Configurations -> Bun Attach -> ws://127.0.0.1:6499/dark
```

Важно: в этом workflow WebStorm используется именно как Attach.
Target запускается из терминала с `--inspect-wait=ws://127.0.0.1:6499/dark`.
Если нажать Run/Debug прямо в WebStorm, JetBrains Bun plugin может запустить Bun через `BUN_INSPECT=ws+unix://...`; это другой endpoint, и sidecar с TCP default его не увидит.

Дальше:

1. Поставить breakpoint в IDE.
2. Дождаться остановки.
3. Агент читает `dark/debug/.agent-state.json`.
4. Агент при необходимости отправляет `eval` в sidecar stdin.
5. Человек делает Step Over/Into/Out в IDE.
6. Sidecar автоматически пишет новый dump на следующей остановке.

## Запуск С Chrome

Терминал 1:

```sh
bun test --timeout=2147483647 --inspect-wait=ws://127.0.0.1:6499/dark dark/server.spec.ts
```

Терминал 2:

```sh
bun run dark/debug/agent-attach.ts
```

Chrome:

```text
https://debug.bun.sh/#127.0.0.1:6499/dark
```

Safari лучше не использовать: он может блокировать `ws://` с HTTPS-страницы.

## Timeout Тестов

При ручной отладке тестов использовать максимальный timeout:

```sh
bun test --timeout=2147483647 --inspect-wait=ws://127.0.0.1:6499/dark dark/server.spec.ts
```

Если timeout не поднять, тест может завершиться, пока execution стоит на breakpoint-е.

## Роль Человека

Человек управляет:

- breakpoint-ами
- stepping
- визуальным осмотром stack/scope в IDE/browser

Это сделано намеренно.
В Bun 1.3.13 программная установка breakpoint-ов через raw WebSocket flaky.

## Роль Sidecar

Sidecar:

- подключается вторым inspector client
- слушает `Debugger.paused`
- пишет snapshot
- выполняет точечные команды `eval`, `props`, `step`, `resume`, `pause`

Sidecar не ставит breakpoint-ы.

## Роль Агента В Чате

Агент:

- запускает sidecar
- читает `.agent-state.json`
- интерпретирует top-frame locals/closures
- отправляет NDJSON-команды, когда нужен точный runtime ответ

Пример:

```text
проверь длину wimp.children
```

Команда sidecar:

```json
{"cmd":"eval","frame":0,"expr":"wimp.children.length"}
```

## Настройка Fallback

Если человек должен успеть подключиться первым:

```sh
AGENT_INITIALIZE_FALLBACK_MS=30000 bun run dark/debug/agent-attach.ts
```

Если sidecar не должен разблокировать target вообще:

```sh
AGENT_INITIALIZE_FALLBACK_MS=0 bun run dark/debug/agent-attach.ts
```

Если нужен automation smoke-test:

```sh
AGENT_INITIALIZE_FALLBACK_MS=1000 bun run dark/debug/agent-attach.ts
```
