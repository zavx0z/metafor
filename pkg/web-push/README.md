# `@metafor/web-push`

Переиспользуемые TypeScript-примитивы Web Push для client, Service Worker и
server. Публичный закон находится в [`CONTRACT.md`](CONTRACT.md).

Корневой import экспортирует только runtime-neutral protocol и lifecycle.
Исполняемые API подключаются явными subpath imports: `/client`, `/worker`,
`/server` и `/server/bun`; так browser consumer не затягивает server service.

Пакет не открывает `BroadcastChannel`. Для наблюдения приложение передаёт
необязательный lifecycle hook и само решает, куда публиковать безопасные
события этого hook.

Client использует только системный запрос разрешения на уведомления. `denied`
не запрашивается повторно, а закрытый prompt оставляет `default`, поэтому
`permissionDisposition()` разрешает повторить системный запрос после reload.
