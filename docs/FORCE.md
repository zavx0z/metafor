# Central Force: реализованный contract

Концептуальная семантика Force принадлежит
[репозиторию `zavx0z/concept`](https://github.com/zavx0z/concept). Ниже описан
только contract, который проверяет и исполняет текущий runtime. Корневой
`force/` является ingress и transport между локальными силами доменов, а не
реализацией всей Force.

## Server endpoints

- `GET /health` возвращает `{ok:true, domain:"force"}`.
- `POST /force` принимает один поддержанный внешний `AgentIngressMessage` без
  доверенного `by`.
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

Runtime validator разрешает particle keys `part`, `op`, `path`, `by`, `ts`,
`value` и `from`. `path`, `by` и `ts` обязательны во внутреннем сообщении.
`path` имеет тип `string | number`; `ts` — неотрицательное целое время источника
в миллисекундах Unix. `from`, если
присутствует, имеет тип `string | number`.

| Field  | Реализованные значения                                              |
| ------ | ------------------------------------------------------------------- |
| `part` | `inflaton`, `graviton`, `photon`, `gluon`, `higgs`, `w+`, `w-`, `z` |
| `op`   | `add`, `remove`, `replace`, `move`, `copy`, `test`                  |

Payload с дополнительными top-level keys, `type`, нулём или несколькими
particles получает HTTP 400 или игнорируется WebSocket handler.

## Внешний ingress

`POST /force` принимает одну поддержанную Particle без `by`. Force назначает ей
доверенный источник `by: agent`; вызывающий не может назначить источник себе.
Сейчас разрешены два узких входа:

- `inflaton/add` с категорией `path: "wimp"` и минимальным WIMP в `value`;
- `inflaton/test` с корневым WIMP SRC в `path`, запускающий чтение внешнего
  Meta-пакета в Dark.

Оба входа доставляются Dark и Bulk. Boundary не получает исходную agent
Particle. Dark сохраняет её `ts`, а сформированные им декларационные Particle
испускает с `by: dark` через Force в Boundary и Bulk.

## Delivery

По умолчанию WebSocket-origin message отправляется всем открытым
зарегистрированным sockets, кроме origin. Для поддержанных Inflaton действует
адресный закон: agent Inflaton получает только Dark и Bulk, Dark Inflaton —
только Boundary и Bulk.

Uncommitted `gluon`/`higgs` mutation без `from` доставляется только
зарегистрированному Boundary. Если HTTP mutation некому доставить, server
возвращает 503.

Force server не открывает domain storage. Порядок обхода получателей определяется
текущим insertion order `Map`.

## Registration и replay markers

При регистрации server обменивает между новым и уже подключёнными consumers
обычные markers:

```ts
{parts: [{part: "z", op: "test", path: "force/replay/<domain>/<id>", by: "force", ts: 1710000000000}]}
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

Logger является независимой диагностикой. Его записи не отправляются в Bulk как
отдельный trace protocol и не становятся историей Вселенной.

Force не добавляет causal parent, trace envelope или renderer instructions.
Bulk выводит причинное проявление из обычной Particle, текущего состояния,
времени и Viewpoint.
