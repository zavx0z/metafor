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
  source, target, method, correlation id и зарегистрированный provider.
- `server.ts` — REST, HTTP Upgrade, WebSocket и process events.
- `src/` — техническое создание серверных физических каналов и HTTP parsing.
- `fixture.ts` — отдельный test-only contract.

Домены импортируют `Force` из `shared/transport/force`, а доменные Монады —
`MonadRpcClient` из `shared/transport/monad`. `shared/package.json` выбирает
server или web implementation через conditional exports. Particle и RPC
envelopes импортируются из `shared/protocol/{force,monad}`.

Transport сохраняет прежнее физическое соединение. Identity `domain/id`
передаётся серверу в HTTP Upgrade; после открытия WebSocket по нему идут только
Particle. `register`, readiness, replay, snapshot, error и другие служебные
payload не являются сообщениями канала.

Service-plane RPC не входит в Particle WebSocket. Сейчас Монада
регистрирует HTTP endpoint в `POST /monad/providers/:identity`, а consumer
вызывает `POST /monad/rpc/:source`. Force добавляет доверенный source, проверяет
target/method и коррелирует ответ, не интерпретируя предметные данные. Эти
маршруты доступны уже в состоянии `starting`, поэтому первоначальное состояние
можно получить до подключения Matrix к Particle-каналу. REST является первым
adapter-ом из `shared/transport/monad`: router contract не привязан к нему и
допускает WebRTC DataChannel без изменения Particle-протокола.

Сервер оборачивает соединения пяти обязательных доменов в `ForceChannel` Store
`force$`. `ForceLifecycle` открывает relay gate только после готовности всех
пяти. Identity `MonadChannel` не ограничена этими runtime-доменами. Потеря любого
обязательного `ForceChannel` переводит lifecycle в `error`; физический reconnect
transport-а сам по себе не восстанавливает runtime.

Канал валиден по конструкции. Ни `ForceLifecycle`, ни relay не валидируют форму Particle
и не сверяют `by` с identity канала. Открытие transport-а не создаёт Particle:
первым realtime-сообщением становится только фактический доменный Impulse.
