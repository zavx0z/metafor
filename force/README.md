# Force

Force разделён на relay, transport и серверный lifecycle.

- `force.ts` — только relay: законы перенаправления одной Particle.
- `store.ts` — постоянный Store каналов `dark`, `boundary`, `matrix`, `energy`,
  `bulk`.
- `transport/` — Bun/browser WebSocket clients, которыми домены пользуются через
  `new Force(domain)`.
- `transport/base.ts` — общий публичный контракт transport client.
- `monad.ts` — серверный замысел: готовность пяти каналов, общий gate и
  fail-stop.
- `server.ts` — REST, HTTP Upgrade, WebSocket и process events.
- `src/` — техническое создание физических каналов и логирование.
- `fixture.ts` — отдельный test-only contract.
- `index.ts` — только публичный transport client `Force`.

Transport сохраняет прежнее физическое соединение. Identity `domain/id`
передаётся серверу в HTTP Upgrade; после открытия WebSocket по нему идут только
Particle. `register`, readiness, replay, snapshot, error и другие служебные
payload не являются сообщениями канала.

До отдельной миграции старые transport clients продолжают испускать replay как
Particle `z/test force/replay/...`. Монада временно поглощает её на входе и не
передаёт relay или доменам. Настоящий числовой `z/test` Energy проходит обычно.

Сервер оборачивает соединения пяти обязательных доменов в каналы `force$`.
Relay начинает работу только после готовности всех пяти. Потеря любого
работающего канала переводит Монаду в `error`; физический reconnect transport-а
сам по себе не восстанавливает runtime.

Канал валиден по конструкции. Ни Монада, ни relay не валидируют форму Particle
и не сверяют `by` с identity канала. Временный replay-мок Монады проверяет только
старый технический путь и должен исчезнуть вместе с ним.
