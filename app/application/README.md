# Application Servers

`@app/application` содержит минимальные серверные процессы для проверки обмена `ForceMessage` между доменами без browser `IndexedDB` и без `app/web` worker runtime.

- `dark.server.ts` импортирует `@metafor/dark/server`, поверх `globalThis.store` поднимает WebSocket-мост Store и после `zavx0z/git` materialization отправляет стартовый `w` particle в process WebSocket.
- `boundary.server.ts` импортирует `@metafor/boundary/server` и поднимает такой же WebSocket-мост Store.
- `process.server.ts` поднимает отдельный WebSocket-слой процессов. Он принимает только particles с `part: "w" | "+z" | "-z"`.

Слой приложения не является доменом. Store-мост только пересылает сообщения:

```text
store.entropy -> WebSocket
WebSocket -> store.absorb
```

Process-мост не принимает Store-replication particles. `path` у process particle — это путь action-модуля из DSL, сохраненный в `process_action.action`; `value` содержит `uuid` строки `process` из SQLite. Остальной контекст выводится из Store по этому process uuid.

Запуск из корня:

```bash
bun run workspace.application
```

Запуск из пакета:

```bash
cd app/application
bun run interpreter
```

Порты по умолчанию:

- Process WebSocket: `127.0.0.1:7103/ws`;
- Dark Store WebSocket: `127.0.0.1:7101/ws`;
- Boundary Store WebSocket: `127.0.0.1:7102/ws`.

Путь Store задается через `STORE_PATH` на уровне каждого доменного сервера.
