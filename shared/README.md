# Shared infrastructure

`shared` — нижний infrastructure package, общий для runtime domains и
центрального Force. Он разделяет неизменный wire protocol и физические
environment-specific transports.

## Public exports

- `shared/transport/force` — один import для `Force`; package conditions
  выбирают `transport/force/server.ts` в Bun/Node и
  `transport/force/web.ts` в browser;
- `shared/transport/oracle` — один import для `OracleTransport`, постоянного
  `OracleChannel` и transport-neutral `OracleRpcPeer`; server/web implementation
  выбирается теми же conditions. Текущий REST adapter открывает identity-bound
  канал, а будущий WebRTC adapter обязан сохранить тот же `send/subscribe/close`
  contract;
- `shared/transport/force/log` — общий logger физического Force-канала;
- `shared/protocol/force/*` — единый Particle wire contract;
- `shared/protocol/oracle/rpc` — единый transport-neutral RPC envelope.

`OracleChannel` не является RPC client или provider: он только доставляет
сообщения одной identity. `OracleRpcPeer` коррелирует исходящие вызовы и вызывает
локальные handlers; `OracleRouter` принадлежит Dark Oracle.

Protocol никогда не ветвится по среде. Server и web обязаны кодировать один и
тот же контракт. `shared` не владеет relay laws, lifecycle Oracle, domain Store
или предметными payload Boundary/Matrix.
