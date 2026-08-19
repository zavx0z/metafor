# `@hamiltonian/startup`

`@hamiltonian/startup` — устойчивая bootstrap-оболочка между platform entrypoint
и сменяемым [`@hamiltonian/release`](../release/README.md). Она обеспечивает
путь к проверенному release при первом запуске, восстановлении и замене всей
последующей среды.

## Закон startup

Когда platform entrypoint начинает новую incarnation:

1. startup устанавливает минимальные platform lifecycle hooks;
1. startup читает локальный release artifact либо получает его через delivery;
1. startup проверяет artifact и создаёт отдельный release runtime;
1. startup запускает candidate и направляет ему новые platform events;
1. startup дожидается операций predecessor, вызывает его lifecycle cleanup и
   публикует candidate как current runtime.

Наблюдаемый результат — один current release runtime с подтверждёнными package
identity, env и version, которому platform передаёт последующие события.

## Распределение ответственности

| Владелец | Ответственность |
| --- | --- |
| Startup | Bootstrap, проверка release artifact, current runtime и handover |
| [`@hamiltonian/release`](../release/README.md) | Composition, cache/update policy, control RPC и lifecycle сменяемого состава |
| [`@internal/*`](../docs/INTERNAL.md) | Служебные функции Hamiltonian после release startup |
| [`@metafor/*`](../docs/METAFOR.md) | Загружаемые функции самой MetaFor |

## Реализованные browser-среды

| Env | Событие и результат |
| --- | --- |
| `main` | Window регистрирует startup Service Worker, получает controller и передаёт выполнение release main |
| `service` | Service Worker синхронно принимает platform events, поднимает release runtime и направляет ему `fetch`/`message` |

Service startup получает один release artifact из canonical local storage либо
через сеть. Он передаёт release замороженные primitives проверки, чтения и
исполнения. Release возвращает runtime lifecycle, который startup готовит,
активирует, обслуживает и завершает.

## Целевая server-среда

Текущее server entrypoint напрямую запускает `@hamiltonian/release:server` и
владеет HTTP/WSS surface. Следующий принимаемый результат добавляет env
`startup/server`: `server.ts` создаёт startup, startup проверяет и запускает
`release/server`, а handover рождает новую incarnation всей рабочей среды после
startup.

Server startup реализует ту же последовательность bootstrap/handover через
Bun process primitives. Browser startup реализует её через Service Worker
registration, events и local browser code storage.

## Public-граница

Package сейчас экспортирует `main` и `service` entrypoints. Public loader
dependencies и release runtime contract принадлежат
`@hamiltonian/release:service`; startup предоставляет platform implementation
этого contract.

Точные export conditions, artifacts и operations задают
[`package.json`](package.json), public source и
[руководство разработки](../../.agents/skills/metafor-dev/references/development.md).
