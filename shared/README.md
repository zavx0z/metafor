# Shared infrastructure

`shared` — нижний infrastructure package, общий для runtime domains и
центрального Force. Он разделяет неизменный wire protocol и физические
environment-specific transports.

## Public exports

- `shared/transport/force` — один import для `Force`; package conditions
  выбирают `transport/force/server.ts` в Bun/Node и
  `transport/force/web.ts` в browser;
- `shared/transport/monad` — один import для `MonadRpcClient` и provider
  transport; server/web implementation выбирается теми же conditions;
- `shared/transport/force/log` — общий logger физического Force-канала;
- `shared/protocol/force/*` — единый Particle wire contract;
- `shared/protocol/monad/rpc` — единый transport-neutral RPC envelope.

Protocol никогда не ветвится по среде. Server и web обязаны кодировать один и
тот же контракт. `shared` не владеет relay laws, lifecycle Монад, domain Store
или предметными payload Boundary/Matrix.
