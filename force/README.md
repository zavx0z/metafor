# Force

Package `force` владеет центральным Particle relay, `ForceLifecycle` и
service-plane `MonadRouter`. Общие transport и wire protocol принадлежат
package `shared`.

- `force.ts` — только relay: законы перенаправления одной Particle.
- `store.ts` — постоянный Store каналов `dark`, `boundary`, `matrix`, `energy`,
  `bulk`.
- `monad.ts` — `ForceLifecycle`: готовность пяти `ForceChannel`, общий gate и
  fail-stop; он не занимается RPC и не знает физический transport.
- `rpc.ts` — transport-neutral `MonadRouter`; он знает только
  каналы, source, target, capabilities method и correlation id.
- `server.ts` — REST, HTTP Upgrade, WebSocket и process events.
- `src/` — техническое создание серверных физических каналов и HTTP parsing.
- `fixture.ts` — отдельный test-only contract.

Домены импортируют `Force` из `shared/transport/force`. Сервер домена создаёт
`MonadTransport`, а Монада получает только transport-neutral `MonadRpcPeer` над
его постоянным `MonadChannel`. `shared/package.json` выбирает server или web
implementation через conditional exports. Particle и RPC envelopes
импортируются из `shared/protocol/{force,monad}`.

Transport сохраняет прежнее физическое соединение. Identity `domain/id`
передаётся серверу в HTTP Upgrade; после открытия WebSocket по нему идут только
Particle. `register`, readiness, replay, snapshot, error и другие служебные
payload не являются сообщениями канала.

Service-plane RPC не входит в Particle WebSocket. Сейчас transport один раз
открывает локальный REST-канал через `POST /monad/channels`, передавая identity,
capabilities и callback endpoint только при создании. Force связывает канал с
непрозрачным токеном. Последующие `POST /monad/rpc` и
`DELETE /monad/channel` используют только токен: source не читается из URL или
RPC payload. Один канал может одновременно инициировать вызовы и предоставлять
методы; отдельных client/provider registrations нет.

Текущий REST adapter доверяет локальной серверной границе: открыть канал можно
только с loopback-адреса. Это не самостоятельная межхостовая аутентификация.
Следующий физический transport обязан устанавливать и авторизовать identity при
создании своего `MonadChannel`; channel, peer и router contracts от REST не
зависят. Маршруты
доступны уже в состоянии `starting`, поэтому первоначальное состояние можно
получить до подключения Matrix к Particle-каналу.

Сервер оборачивает соединения пяти обязательных доменов в `ForceChannel` Store
`force$`. `ForceLifecycle` открывает relay gate только после готовности всех
пяти. Identity `MonadChannel` не ограничена этими runtime-доменами. Потеря любого
обязательного `ForceChannel` переводит lifecycle в `error`; физический reconnect
transport-а сам по себе не восстанавливает runtime.

Канал валиден по конструкции. Ни `ForceLifecycle`, ни relay не валидируют форму Particle
и не сверяют `by` с identity канала. Открытие transport-а не создаёт Particle:
первым realtime-сообщением становится только фактический доменный Impulse.
