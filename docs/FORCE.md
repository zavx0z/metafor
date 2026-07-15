# Force: реализованный contract

Концептуальная семантика Force принадлежит
[репозиторию `zavx0z/concept`](https://github.com/zavx0z/concept). Ниже описан
только contract, который проверяет и исполняет текущий runtime.

## Server endpoints

- `GET /health` возвращает `{ok:true, domain:"force"}`.
- `POST /force` принимает один plain `ForceMessage`.
- `GET /ws` обновляет соединение до WebSocket.

WebSocket registration имеет форму:

```json
{"type":"register","domain":"matrix","id":"matrix-local"}
```

Обычный message не содержит `type` и имеет ровно один элемент `parts`:

```ts
interface ForceMessage {
  parts: [Particle]
}
```

Runtime validator разрешает particle keys `part`, `op`, `path`, `value` и
`from`. `path` обязателен и имеет тип `string | number`; `from`, если
присутствует, имеет тот же тип.

| Field  | Реализованные значения                                              |
| ------ | ------------------------------------------------------------------- |
| `part` | `inflaton`, `graviton`, `photon`, `gluon`, `higgs`, `w+`, `w-`, `z` |
| `op`   | `add`, `remove`, `replace`, `move`, `copy`, `test`                  |

Payload с дополнительными top-level keys, `type`, нулём или несколькими
particles получает HTTP 400 или игнорируется WebSocket handler.

## Delivery

WebSocket-origin message отправляется всем открытым зарегистрированным sockets,
кроме origin. HTTP-origin message не имеет исключаемого socket.

Uncommitted `gluon`/`higgs` mutation без `from` доставляется только
зарегистрированному Boundary. Если HTTP mutation некому доставить, server
возвращает 503.

Force server не открывает domain storage. Порядок обхода получателей определяется
текущим insertion order `Map`.

## Registration и replay markers

При регистрации server обменивает между новым и уже подключёнными consumers
обычные markers:

```ts
{parts: [{part: "z", op: "test", path: "force/replay/<domain>/<id>"}]}
```

Bun transport также отправляет marker своего domain после открытия socket.
Конкретные ответы на marker реализованы domain handlers, не Force storage.

Этот раздел фиксирует наблюдаемое поведение. Он не разрешает открытые
snapshot/create/replay вопросы и не объявляет существующий механизм
каноническим.

## Client transport

`new Force(domain)`:

- использует `FORCE_ADDRESS` или `ws://127.0.0.1:4000/ws`;
- буферизует outgoing messages до открытия socket;
- переподключается через 500 ms;
- не переподключается при `FORCE_RECONNECT=0`;
- публикует текущее состояние регистрации через `connected` и
  `onConnectionChange` независимо от causal impulse-потока;
- вызывает `onImpulse` для принятого single-particle message;
- вызывает optional `onDestroy` при shutdown.

## Наблюдаемость

`METAFOR_LOG_IMPULSES=0|compact|full` управляет детализацией. Дополнительные
фильтры: `METAFOR_LOG_DOMAINS` и `METAFOR_LOG_PARTS`.
