# `@hamiltonian/release`

`@hamiltonian/release` владеет composition и update-механикой сменяемой среды
после устойчивого [`@hamiltonian/startup`](../startup/README.md). Release
собирает `@hamiltonian/release`, [`@internal/*`](../internal/README.md) и будущие
`@metafor/*` packages в один совместимый выпуск.

Общая карта владельцев находится в
[корневом README Hamiltonian](../README.md#распределение-ответственности).

## Закон release

Когда Hamiltonian требует новый выпуск:

1. release composition выбирает package versions и проверяет dependency
   closure;
1. delivery получает immutable artifacts и проверяет их identity и bytes;
1. update runtime готовит полный candidate рядом с current составом;
1. startup создаёт inert candidate runtime до cleanup predecessor;
1. release завершает forward cleanup, а startup активирует candidate;
1. новое воплощение подтверждает composition, env versions и готовность
   обязательных связей.

## Среды package

| Env | Реализованная роль |
| --- | --- |
| `main` | Запускает сменяемый Window composition и импортирует функциональные packages |
| `service` | Владеет Service Worker runtime, browser fetch/cache/update lifecycle и control RPC |
| `server` | Владеет host-side package graph, сборкой, immutable publication, HTTP delivery и server-side control RPC |

Все env разделяют одно package name и одну SemVer. Каждый объявленный env имеет
собственный artifact этой версии. Изменение одного env создаёт новый полный
набор объявленных artifacts package. Source сохраняет bare package name, а
conditional export выбирает env.

## Состав browser release

Версионные dependencies корневого Hamiltonian задают полный browser release
membership. Composition проверяет, что runtime dependency каждого участника
присутствует в membership и удовлетворяет выбранному workspace range.

Каждый browser artifact публикует package name, env, version, SHA-256 и byte
size. Stable URL выбирает package/env slot, exact URL — immutable version.
Namespace package определяет owner его canonical browser code storage.

## Обновление browser release

Когда Service Worker соединяется или получает сигнал об изменении, он заново
читает фактический canonical состав, проверяет bytes и отправляет current
snapshot. Host сравнивает snapshot с desired composition и возвращает только
необходимые additions/removals. Поэтому повторный signal и reconnect запускают
одну и ту же сверку из текущего состояния.

Candidate проходит последовательность:

1. получить и проверить все новые artifacts;
1. добавить полный candidate рядом с current составом;
1. проверить integrity и dependency closure candidate;
1. подготовить inert release runtime;
1. удалить вытеснённые artifacts, сохраняя current `release/service` до
   готовности остальных slots;
1. проверить единственный итоговый состав и последней durable операцией
   завершить transaction;
1. активировать candidate, дождаться операций predecessor и завершить его
   runtime.

После interruption Worker читает фактические canonical entries и получает
fresh delta. При повреждённом current release artifact startup завершает boot
явной ошибкой. При готовом полном candidate cleanup продолжает движение вперёд
к выбранному composition.

## Host publication и delivery

Root versioned composition хранит durable host intent. При publication host:

1. фиксирует target composition;
1. проверяет package-owned contracts и выполняет package-wide typecheck;
1. собирает env artifacts и записывает immutable versions;
1. обновляет child manifests до target versions;
1. публикует payload-free release signal после готовности состава.

Обычная ошибка восстанавливает предыдущий root intent. После process
interruption host recovery завершает уже зафиксированное движение вперёд до
открытия listener. HTTP delivery отдаёт stable либо exact browser artifact, а
Service Worker подтверждает собственный current по локально прочитанным bytes.

Точные HTTP/RPC методы, wire objects, storage names и publication operations
задают public types, код и
[руководство разработки](../../.agents/skills/metafor-dev/references/development.md).

## Целевая server release

Текущий `release/server` управляет browser packages со стороны host. Следующий
server result помещает его за `startup/server` и расширяет composition всей
рабочей server-средой: release выбирает [`@internal/*`](../internal/README.md) и
`@metafor/*` packages, startup создаёт новое process
воплощение, а readiness подтверждает version и восстановленные обязательные
связи.

## Public-граница

Env `service` публикует loader dependency и runtime contracts для startup. Env
`server` публикует package graph, build/publication/delivery и control RPC
contracts. Точные exports задают [`package.json`](package.json) и public source.
