# MetaFor: граф исполнения

Здесь находятся только принятые задачи. Общие правила, состояния и жизненный
цикл заданы в [`README.md`](README.md), крупное направление — в
[`ROADMAP.md`](ROADMAP.md), а непринятая работа — в
[`BACKLOG.md`](BACKLOG.md).

Внутри одного приоритета порядок строк является порядком выбора. Стрелки на
графе показывают только настоящие зависимости, а не сходство тем.

## Граф зависимостей

```mermaid
flowchart LR
    AUD005["AUD-005 · атомарность топологии"]
    AUD007["AUD-007 · граница Force"]
    AUD008["AUD-008 · версии схемы"]
    AUD009["AUD-009 · закрытие Boundary"]
    AUD010["AUD-010 · перемещение UI"]
    AUD011["AUD-011 · Matrix4"]
    AUD012["AUD-012 · завершение Renderer"]
    AUD013["AUD-013 · серверные проверки"]
    AUD014["AUD-014 · корневой пакет"]
    MF411["MF-411 · что делает Hamiltonian"]
    MF414["MF-414 · где работают домены"]
    MF421["MF-421 · деактивация невидимого monitor display"]
    MF424["MF-424 · визуальная доводка Hamiltonian"]
    HAM001["HAM-001 · декларации нодовой системы Hamiltonian"]
    NODES009["NODES-009 · универсальные границы node-system"]
    HAM002["HAM-002 · единый визуальный слой Hamiltonian"]
    HAM003["HAM-003 · среды и механизмы Hamiltonian"]
    HAM005["HAM-005 · стандартное visual-окружение Window"]
    NODES006["NODES-006 · кратчайший законный маршрут"]
    NODES008["NODES-008 · убрать пустой compound-резерв"]
    MF425["MF-425 · одна Вселенная на одном устройстве"]
    LOAD001["LOAD-001 · минимальный browser loader"]
    UPD002["UPD-002 · клиентская сборка через Service Worker"]
    MF426["MF-426 · одна Вселенная на нескольких устройствах"]
    MF427["MF-427 · несколько Вселенных"]
    MTX001["MTX-001 · причинный порядок"]
    MTX002["MTX-002 · память"]
    MTX003["MTX-003 · структура и Process"]
    MTX004["MTX-004 · срок Energy"]
    MF109["MF-109 · ветвь исполнения"]
    MF110["MF-110 · ветвь Interpreter"]
    MF400["MF-400 · Force v2"]
    MF401["MF-401 · растворение родителя"]
    MF402["MF-402 · управление версиями"]
    MF405["MF-405 · структурный агент"]
    MF406["MF-406 · изменение Лады"]
    MF407["MF-407 · частичная Graph-проекция"]
    MF109 --> MF110
    MF405 --> MF406
    MF411 --> MF414
    MF425 --> MF426
    MF426 --> MF427
```

## P1 — ближайшая работа

Текущая визуальная работа ведётся в `MF-424 — Визуально довести Hamiltonian
вместе с владельцем`. Подзадачи `MF-424.1` и `MF-424.3` приняты: серверная
часть остаётся в едином видимом контуре, а все одновременно открытые вкладки
находятся внутри одного Chrome и видят одинаковый retained lifecycle друг
друга. Текущий срез — `MF-424.2` про устойчивые цвета transport family и
легенду в панели `Вид холста`. Параллельно `MF-425 — Управлять одной Вселенной на
одном устройстве` уточняет границу устройства. Следом идут
`MF-426 — Распределить одну Вселенную между несколькими
устройствами` и `MF-427 — Управлять несколькими Вселенными`.
`MF-411 — Определить, что делает Hamiltonian и где он работает` остаётся
отдельной незавершённой работой. После неё начинается
`MF-414 — Определить, где работают домены и какая их копия действующая`.
Параллельно `NODES-006 — Выбирать кратчайший законный маршрут между равными
вариантами` проходит closing review изменений `@nodes/layout`. `NODES-008 —
Не оставлять пустой маршрутный резерв внутри compound` возвращена в работу:
checkpoint NODES-008.4 с общим исправлением левых интервалов сохранён отдельным
коммитом `b0fee1ee0`; owner review открыл NODES-008.5 для зеркального лишнего
интервала справа в `DOWN`. Реализация NODES-008.5 сохранена checkpoint-коммитом
`e1b2aea50` и ожидает визуального подтверждения владельца.

Отдельная пакетная задача `HAM-001 — Удерживать одну декларацию нодовой системы
каждого контура` формулирует общий Hamiltonian lifecycle contract. Срез
`HAM-001.1 — Заменять серверное поддерево при новой incarnation Hamiltonian`
принят. `HAM-001.2 — Показывать действующее WebRTC-соединение между браузером и
сервером` зафиксировал exact Oracle/Force declaration boundary, но live canvas
не показал уже принятые линии. Принятая диагностика `HAM-001.3 —
Установить, почему действующие WebRTC-линии не попадают в кадр` локализует
первую расходящуюся границу без product patch. `HAM-001.4 — Сохранять ноды,
которые продолжаются в новой декларации` исправила эту границу; applied layout и
canvas показали оба RTC endpoint и exact Oracle/Force lines. HAM-001.1–HAM-001.4 закрыты
после положительной независимой проверки; HAM-001 остаётся `IN_PROGRESS` для
остальных independently authoritative contours.

`NODES-009 — Разделить библиотеку нод для разных способов представления графа`
остаётся `IN_PROGRESS`: лёгкое ядро `nodes`, чистая числовая геометрия
`@nodes/layout`, HUD-free `@nodes/ui`, optional `@nodes/hud`, fixed card adapter
и consumer-owned Hamiltonian palette физически разделены и проверены.
NODES-009.1–NODES-009.5 закрыты после отдельной package/browser/live-проверки;
executable Service Worker обновлён до `1.1.3`. Родитель не закрывается и
остаётся текущим местом дальнейшей работы владельца.
Эти закрытые срезы полностью удовлетворяют прежнюю подготовительную зависимость
`HAM-002`; открытый родитель `NODES-009` больше не блокирует Hamiltonian.
`HAM-002` собрала Hamiltonian-specific отображение прототипа под
`hamiltonian/visual` без переноса lifecycle/control orchestration; Bulk и
`pkg/visual` в работу не входили. `HAM-002.1` зафиксировала import graph,
`HAM-002.2` удалила legacy fallback screen, `HAM-002.3` создала приватный
`@hamiltonian/visual`, а `HAM-002.4`–`HAM-002.6` перенесли presentation,
HUD/workspace composition и изолированный layout Worker entrypoint. По прямому
запросу владельца `HAM-002.7` подняла постоянный Hamiltonian host через
LaunchAgent и дала визуальное подтверждение canvas-only нодового UI в dedicated
CDP Chrome.
Все эти checkpoints теперь относятся к отдельно запускаемому прототипу.
Следующего structural среза нет: prototype visual дальше не переносится в
clean-room loader. Владелец отдельно выбрал `HAM-005 — Собрать стандартное
окружение визуализации Window`: новый `@import/main` уже создаёт общий runtime,
пол и управляемую обзорную камеру. Текущий срез `HAM-005.6` добавляет один
пустой standard display в `Space` и его navigation dock в `HUD`; первый
ownership correction `HAM-005.7` переносит всё стандартное visual behavior в
`@internal/visual`, оставляя `@import/main` только bare import. Первый
предметный graph module будет выбран позднее.

Начата `LOAD-001 — Загружать браузерный функционал через минимальный Service
Worker`. Весь прежний Hamiltonian остаётся отдельно запускаемым прототипом.
Browser path уже разделён на неизменяемый `startup`, обновляемые importers и
загружаемые modules. Пакеты `@startup/main` и `@startup/service` устанавливают
Service Worker, восстанавливают HTML/startup offline и запускают
`@import/main` и `@import/service` из cache `import`. Service Worker importer
владеет module loader и storage policy; первый module `@internal/rpc`
загружается через `/code?module=@internal/rpc` в cache `internal` и открывает
`/sw` для серверных уведомлений.
Владелец подтвердил startup/import offline, cold-восстановление `internal` и
текущий internal RPC/WebSocket. `LOAD-001.23` остановлен: Window loader не
расширяет startup до появления первого реального Window module. Стандартное
пустое visual-окружение Window вынесено в самостоятельную `HAM-005`; оно не
является дополнительным критерием minimal loader. Полный versioned manifest,
hashes и атомарное переключение сменяемого набора
`import`/`internal`/`metafor` принадлежат начатой `UPD-002`; неизменяемый
startup в этот выпуск не входит. Владелец признал текущий loader checkpoint
достаточным для development update-срезов, не закрывая остальную `LOAD-001`.
`UPD-002.2`–`UPD-002.4` находятся в `REVIEW`: групповой build, одно уведомление
и один browser restart сохранены, а единственный внешний POST contract теперь
использует JSON `{modules: string[]}`. Legacy query POST отклоняется; Service
Worker delivery после parsing boundary не менялась. Package-owned development
build сохраняет debug и inline source map, production удаляет `console.debug`
и не публикует карту; постоянный contour запускается через `bun run dev`.

`HAM-003 — Разделить Hamiltonian по средам исполнения и механизмам` остаётся
`IN_PROGRESS`, но активного среза не имеет. Широкий object-oriented срез
`HAM-003.8` отклонён и откачен; принятый `HAM-003.9` теперь является prototype
checkpoint и сохранён в `server_proto.ts`. Clean-room `server.ts`,
`web/startup`, `web/import` и `internal` принадлежат `LOAD-001` и не являются
продолжением refactor старого Hamiltonian. Перед следующим срезом владелец
отдельно выбирает механизм, который ещё нужен самому прототипу и не пересекает
`LOAD-001`/`UPD-002`.

| ID     | Состояние   | Зависимости | Карточка                   |
| ------ | ----------- | ----------- | -------------------------- |
| MF-424 | IN_PROGRESS | нет         | [Открыть](tasks/MF-424.md) |
| MF-425 | IN_PROGRESS | нет         | [Открыть](tasks/MF-425.md) |
| LOAD-001 | IN_PROGRESS | нет       | [Открыть](tasks/LOAD-001.md) |
| HAM-005 | IN_PROGRESS | нет         | [Открыть](tasks/HAM-005.md) |
| UPD-002 | IN_PROGRESS | нет       | [Открыть](tasks/UPD-002.md) |
| HAM-001 | IN_PROGRESS | нет         | [Открыть](tasks/HAM-001.md) |
| NODES-009 | IN_PROGRESS | нет       | [Открыть](tasks/NODES-009.md) |
| HAM-002 | IN_PROGRESS | нет         | [Открыть](tasks/HAM-002.md) |
| HAM-003 | IN_PROGRESS | нет         | [Открыть](tasks/HAM-003.md) |
| MF-411 | IN_PROGRESS | нет         | [Открыть](tasks/MF-411.md) |
| NODES-006 | REVIEW      | нет       | [Открыть](tasks/NODES-006.md) |
| NODES-008 | IN_PROGRESS | нет       | [Открыть](tasks/NODES-008.md) |
| MF-414 | WAITING     | MF-411      | [Открыть](tasks/MF-414.md) |
| MF-426 | WAITING     | MF-425      | [Открыть](tasks/MF-426.md) |
| MF-427 | WAITING     | MF-426      | [Открыть](tasks/MF-427.md) |

## P2 — функциональное продолжение и надёжность

| ID      | Состояние   | Зависимости | Карточка                    |
| ------- | ----------- | ----------- | --------------------------- |
| MF-407  | READY       | нет         | [Открыть](tasks/MF-407.md)  |
| MF-421  | READY       | нет         | [Открыть](tasks/MF-421.md)  |
| AUD-009 | READY       | нет         | [Открыть](tasks/AUD-009.md) |
| AUD-005 | GATE        | нет         | [Открыть](tasks/AUD-005.md) |
| AUD-008 | GATE        | нет         | [Открыть](tasks/AUD-008.md) |
| AUD-013 | READY       | нет         | [Открыть](tasks/AUD-013.md) |
| AUD-010 | READY       | нет         | [Открыть](tasks/AUD-010.md) |
| AUD-011 | READY       | нет         | [Открыть](tasks/AUD-011.md) |
| AUD-012 | READY       | нет         | [Открыть](tasks/AUD-012.md) |
| MTX-001 | READY       | нет         | [Открыть](tasks/MTX-001.md) |
| AUD-007 | GATE        | нет         | [Открыть](tasks/AUD-007.md) |
| AUD-014 | GATE        | нет         | [Открыть](tasks/AUD-014.md) |

## P3 — поведение runtime

| ID      | Состояние | Зависимости | Карточка                    |
| ------- | --------- | ----------- | --------------------------- |
| MTX-002 | READY     | нет         | [Открыть](tasks/MTX-002.md) |
| MTX-003 | READY     | нет         | [Открыть](tasks/MTX-003.md) |

## P4 — отложенные решения

| ID      | Состояние | Зависимости | Карточка                    |
| ------- | --------- | ----------- | --------------------------- |
| MTX-004 | GATE      | нет         | [Открыть](tasks/MTX-004.md) |
| MF-400  | GATE      | нет         | [Открыть](tasks/MF-400.md)  |
| MF-401  | GATE      | нет         | [Открыть](tasks/MF-401.md)  |
| MF-402  | GATE      | нет         | [Открыть](tasks/MF-402.md)  |
| MF-109  | READY     | нет         | [Открыть](tasks/MF-109.md)  |
| MF-110  | WAITING   | MF-109      | [Открыть](tasks/MF-110.md)  |
| MF-405  | READY     | нет         | [Открыть](tasks/MF-405.md)  |
| MF-406  | WAITING   | MF-405      | [Открыть](tasks/MF-406.md)  |

## Требования к доказательству

Для завершения задачи нужны:

* изменённый закон и его постоянный владелец;
* точные публичные договоры;
* обычный пользовательский или предметный сценарий;
* выполненные команды проверки;
* фактический результат;
* известные ограничения;
* решение владельца, если задача проходила через `GATE`.
