# AppWeb

`app/web` сейчас содержит только браузерную оболочку Bulk, которую загружает
`bulk/index.html` из Dark. Серверный центр находится в `dark/index.ts`.

AppWeb больше не запускает сервер, не открывает Boundary/SQLite, не держит
`/ws`, `/force`, `/matrix/ws` или `/energy/ws` и не является server-dev target.

## Живой браузерный слой

- `client.ts` - браузерный entry: WebSocket `/ws`, snapshot, Force-сообщения,
  запуск Bulk viewport и HUD.
- `world.ts` - преобразование `BoundaryBulkRuntimeSnapshot` в `BulkManifest`.
- `hud.ts` - Settings/fullscreen HUD поверх Bulk viewport.
- `settings.ts` - UI metadata и layout/render преобразования.
- `force-snapshot.ts` - локальное применение Force parts к текущему snapshot.

## Запуск

Основной запуск идет через Dark:

```bash
bun run workspace.dark:dev
```

Root aliases `workspace.app.web:*` пока ведут в Dark, чтобы старые команды не
возвращали AppWeb в роль серверного центра.

## Не возвращать в AppWeb

- server runtime;
- Boundary/SQLite ownership;
- Matrix/Energy bridge endpoints;
- Bulk executor/router/process runtime;
- interpreter process/source inspector;
- Codex, terminal, voice, Android, TODO или WebRTC tooling.
