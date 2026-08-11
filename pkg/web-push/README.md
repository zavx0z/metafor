# `@metafor/web-push`

Переиспользуемые TypeScript-примитивы Web Push для client, Service Worker и
server. Публичный закон находится в [`CONTRACT.md`](CONTRACT.md).

Пакет не открывает `BroadcastChannel`. Для наблюдения приложение передаёт
необязательный lifecycle hook; Hamiltonian публикует события в собственную
browser-local шину из этого hook.

Client использует только системный запрос разрешения на уведомления. `denied`
не запрашивается повторно, а закрытый prompt оставляет `default`, поэтому
`permissionDisposition()` разрешает повторить системный запрос после reload.
