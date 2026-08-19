# `@hamiltonian/release`

`@hamiltonian/release` владеет сменяемой частью Hamiltonian после устойчивого
[`@hamiltonian/startup`](../startup/README.md). Один release определяет
согласованный состав `@hamiltonian/release`, `@internal/*` и будущих
`@metafor/*` packages, но не включает startup в сменяемую группу.

## Ответственность

Release:

* выбирает полный совместимый состав сменяемых packages;
* получает и проверяет code artifacts;
* готовит кандидата целиком до удаления действующего состава;
* переводит среду вперёд как один согласованный выпуск и запускает новое
  воплощение;
* владеет browser cache/update policy и внутренним control RPC;
* на host публикует immutable artifacts и сообщает участникам, что доступен
  новый состав.

Release не является startup, предметным `internal`/`metafor` module или
production Oracle/Force transport. Code bytes передаются через `fetch`.
Control RPC/WSS может сообщить о новом выпуске и согласовать его, но не заменяет
доставку bytes и не переносит обычный Oracle/Force realtime.

## Среды package

| Среда | Реализованная роль |
| --- | --- |
| `main` | Запускает сменяемый Window composition и импортирует его функциональные packages |
| `service` | Владеет Service Worker runtime, browser fetch/cache/update lifecycle и control RPC |
| `server` | Владеет host-side package graph, сборкой, immutable publication, HTTP delivery и server-side control RPC |

Один package сохраняет одно каноническое имя и одну SemVer во всех объявленных
средах. Source импортирует bare package name; среду выбирает conditional export,
а не другой package или transport-specific subpath. Изменение любого env
создаёт новую версию package и полный набор его поддерживаемых artifacts.

## Состав browser release

Корневые versioned dependencies определяют полный состав browser release.
Runtime dependency участника обязана входить в тот же состав, а выбранная
версия — удовлетворять объявленному workspace range. Поэтому новый package
нельзя применить без closure его зависимостей, требуемый package нельзя удалить,
а несовместимая группа останавливается до исполнения.

Каждый artifact имеет identity package, env, version, SHA-256 и byte size.
Stable URL выбирает slot, exact URL — immutable version. Package namespace
определяет владельца постоянного browser code storage; имена отдельных modules
не превращаются в новые policy branches.

## Обновление browser release

Service Worker сначала сообщает host фактически проверенный текущий состав.
Host отвечает только необходимыми добавлениями и удалениями относительно этого
снимка. Сигнал о новом выпуске не несёт готовый состав: пропущенный сигнал или
новое соединение приводит к новой сверке из фактического локального состояния.

Кандидат обновления проходит последовательность:

1. получить и проверить все новые artifacts;
1. добавить полный кандидат, не удаляя действующий состав;
1. повторно проверить целостность и closure кандидата;
1. подготовить новый inert release runtime до первого удаления старого кода;
1. только после этого удалить вытеснённые artifacts, оставляя прежний
   `release/service` до готовности остальных slots;
1. проверить единственный итоговый состав и последним завершить техническую
   transaction;
1. запустить и активировать новый runtime через startup boundary, дождаться
   уже начатых операций прежнего runtime и завершить его.

После прерывания продолжение строится из фактических canonical entries и новой
server delta, а не из сохранённого обещания предыдущей попытки. Повреждённый
первый release artifact приводит к явной ошибке; loader не выбирает молча
другой код. Старое `release/service` удаляется только после готовности всего
преемника, чтобы startup сохранял путь к восстановлению.

## Host publication и delivery

Host intent задаётся корневым versioned composition. Publication сначала
фиксирует этот intent, затем проверяет package-owned contracts, собирает и
записывает immutable artifacts и доводит child manifests до выбранных версий.
Обычная ошибка возвращает прежнее состояние; host recovery после аварийного
прерывания завершает уже зафиксированное движение вперёд до открытия listener.

Host отдаёт browser artifact по package identity и env, а exact version — по
той же identity с версией. Endpoint текущего code state является диагностикой
host, а не источником истины для локального Service Worker: Worker всегда
перечитывает и проверяет собственные bytes.

Точные HTTP/RPC методы, wire objects, cache names, transaction marker и
порядок operational публикации принадлежат public types, коду и
[руководству разработки](../../.agents/skills/metafor-dev/references/development.md).

## Целевая server release

Текущий env `server` управляет browser packages со стороны host, но сам ещё не
является сменяемым server runtime за `startup/server`. Целевой путь определён
[общим законом](../README.md#общий-закон): тонкий `server.ts` запускает
`startup/server`, тот проверяет и запускает `release/server`, а release
определяет весь последующий `internal`/`metafor` состав серверной среды.

Значит, наличие собранного `release/server` сегодня не доказывает полное
server self-update. Такое доказательство потребует отдельной реализации
server startup, рождения нового process incarnation, перехода authority и
наблюдаемого восстановления обязательных связей.

## Public-граница

Env `service` владеет loader dependency и runtime contracts, необходимыми
startup для безопасной замены. Env `server` публикует package graph,
build/publication/delivery и control RPC contracts. Точные exports находятся в
[`package.json`](package.json) и public source; этот README задаёт их предметный
смысл, но не повторяет сигнатуры.
