# Application Servers

`@app/application` содержит два минимальных серверных процесса для проверки обмена `ForceMessage` между доменами без browser `IndexedDB` и без `app/web` worker runtime.

- `dark.server.ts` статически импортирует `@metafor/dark/server` и поверх `globalThis.store` поднимает WebSocket-мост.
- `boundary.server.ts` поднимает server-side `store/sqlite`, грузит `@metafor/boundary/boot` и поднимает такой же WebSocket-мост.

Слой приложения не является доменом. Он только пересылает сообщения:

```text
store.onmessage -> WebSocket
WebSocket -> store.postMessage
```

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

- Dark WebSocket: `127.0.0.1:7101/ws`;
- Boundary WebSocket: `127.0.0.1:7102/ws`.

Путь Dark Store задается через `STORE_PATH`, потому что Store открывает пакетный `@metafor/dark/server` на этапе статического импорта.
