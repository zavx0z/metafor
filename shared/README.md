# Shared infrastructure

`shared` — нижний infrastructure package, общий для runtime domains и
центрального Force. Он разделяет неизменный wire protocol и физические
environment-specific transports.

## Public exports

- `shared/transport/force` — один import для `Force`; package conditions
  выбирают `transport/force/server.ts` в Bun/Node и
  `transport/force/web.ts` в browser;
- `shared/transport/monad` — один import для `MonadTransport`, постоянного
  `MonadChannel` и transport-neutral `MonadRpcPeer`; server/web implementation
  выбирается теми же conditions. Текущий REST adapter открывает identity-bound
  канал, а будущий WebRTC adapter обязан сохранить тот же `send/subscribe/close`
  contract;
- `shared/transport/force/log` — общий logger физического Force-канала;
- `shared/protocol/force/*` — единый Particle wire contract;
- `shared/protocol/monad/rpc` — единый transport-neutral RPC envelope.

`MonadChannel` не является RPC client или provider: он только доставляет
сообщения одной identity. `MonadRpcPeer` коррелирует исходящие вызовы и вызывает
локальные handlers; `MonadRouter` принадлежит Dark Monad.

Protocol никогда не ветвится по среде. Server и web обязаны кодировать один и
тот же контракт. `shared` не владеет relay laws, lifecycle Монад, domain Store
или предметными payload Boundary/Matrix.
