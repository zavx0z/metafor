# Серверы Приложения

`@app/application` содержит минимальные серверные процессы для проверки обмена
`ForceMessage` между доменами без браузерного `IndexedDB` и без старого
воркер-рантайма `app/web`.

- `dark.server.ts` импортирует `@metafor/dark/server`, открывает `Boundary` SQLite и материализует `zavx0z/git`.
- `energy.server.ts` импортирует `@metafor/energy/server` и поднимает
  рантайм-WebSocket без доступа к `Boundary`/SQLite.

Слой приложения не является доменом. Он только держит два процесса и WebSocket-транспорт:

```text
Dark + Boundary -> Boundary entropy -> WebSocket
WebSocket -> Boundary absorb

WebSocket -> Energy force.absorb -> рантайм Energy
Energy force.entropy -> WebSocket
```

`Energy` не открывает базу и не синхронизирует SQLite. Все данные, нужные ему
для рантайма, должны приходить через Force-данные.

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

- WebSocket `Dark`/`Boundary`: `127.0.0.1:7101/ws`;
- рантайм-WebSocket `Energy`: `127.0.0.1:7102/ws`.

Путь `Boundary` задаётся через `BOUNDARY_PATH` только для `Dark`/`Boundary`.
Для `Energy` путь базы не задаётся.
