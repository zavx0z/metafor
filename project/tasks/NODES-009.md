# NODES-009 — Разделить библиотеку нод для разных способов представления графа

## Коротко

До дальнейшего развития типов сокетов нужно определить физические границы
библиотеки `nodes`. Потребитель должен подключать только тот способ представления
графа, который ему нужен: лёгкие фиксированные входы и выходы либо адаптивные
двусторонние сокеты, — без загрузки неиспользуемой реализации другого способа.

## Зачем

Одна большая библиотека с переключателями, подобная конфигурационной модели
ELK, формально позволяет выбрать поведение, но не гарантирует минимальную
сборку. Неиспользуемые layout-, UI- и interaction-ветви могут остаться в
dependency graph, занимать память и усложнять понимание public API.

Декомпозиция нужна до детализации форм сокетов, чтобы:

* функции переиспользовались между проектами без копирования;
* названия импортов и типов не обещали неподдерживаемое поведение;
* общие законы node-system оставались едиными для разных представлений;
* каждый consumer мог доказать отсутствие чужой функциональности в своей
  browser-сборке, а не только выключить её runtime-конфигурацией.

## Связь с дорожной картой

Задача уточняет пакетную границу универсальной node-system из раздела
[`Наблюдаемость и управление Hamiltonian`](../ROADMAP.md#наблюдаемость-и-управление-hamiltonian).
Она предшествует новым задачам на семантику, форму и интерактивность сокетов.
Перевод конкретных соединений Hamiltonian остаётся будущей подзадачей
[`MF-424 — Визуально довести Hamiltonian вместе с владельцем`](MF-424.md), а не
частью пакетной декомпозиции `nodes`.

## Связанные задачи и история

* Коммит `da2d7b6ed` впервые разделил общую node-system на `nodes`, чистое
  синхронное ядро `@nodes/layout` и отображение `@nodes/ui`.
* Закрытая `NODES-001` закрепила pure TypeScript layout, числовой serializable
  protocol, принадлежащий `nodes` Worker adapter и exact visible parameter
  sockets. Result/closing-линия: `915d13976`, `539179a5a`, `f91cdc286`,
  `8b79f61fd`.
* Закрытая `NODES-004` закрепила подсветку всех совпавших semantic edges при
  наведении (`3be6c9968`, `9bfc39251`), поэтому будущая интерактивность сокетов
  должна расширять, а не дублировать этот закон.
* Закрытая `NODES-005` разрешила общий trunk только для рёбер одного exact port
  (`611283e77`, `535bc6db7`); новая декомпозиция не отменяет exact endpoint
  identity.
* `MF-424.2` и коммит `3403e11f2` отделили цвет transport family от направления.
  Последующий аудит показал, что добавление обратного edge для каждого
  двустороннего транспорта перегружает граф и что capability сокета нельзя
  подменять числом рёбер.
* [`BLK-002 — Нодовая система Bulk в Space`](BLK-002.md) сохраняет отдельную
  продуктовую линию Bulk: смысловые WebGPU-компоненты, проекцию Bulk Store,
  Field intent и visual/live acceptance. Она использует универсальные законы
  `nodes`, но не переносит Bulk entities в этот пакет.
* В текущем public type уже существуют `in`, `out`, `inout` и необязательная
  сторона `left/right`. Это ещё не доказывает правильную пакетную границу:
  общая модель, layout adapter, Worker adapter и presentation logic сейчас
  экспортируются одним пакетом `nodes`, который зависит и от `@nodes/layout`,
  и от `@nodes/ui`.

Новое требование шире предыдущих layout- и UI-исправлений: требуется решить,
какие зависимости и public entrypoints получает каждый класс потребителей.
По решению владельца это отдельная архитектурная задача, а не ещё одна
подзадача действующей визуальной приёмки Hamiltonian.

## Подтверждённые факты

1. Корневой пакет `nodes` сейчас содержит model validation, containment,
   layout adapter, Worker transport adapter и incremental presentation logic.
2. `@nodes/layout` является чистым синхронным числовым ядром, а `@nodes/ui`
   измеряет и отображает карточки, Inspector, viewport и сообщения на рёбрах.
3. `nodes/package.json` объявляет обе части прямыми workspace-зависимостями.
   Наличие отдельных subpath exports само по себе не доказывает, что consumer
   не получает ненужные транзитивные модули в своей конечной сборке.
4. Текущий общий тип порта уже смешивает capability (`in/out/inout`) и
   placement hint (`left/right`). Дальнейшее наращивание форм и поведения без
   согласованной границы усилит неоднозначность API.
5. Один граф может содержать только фиксированные directional sockets, только
   адаптивные sockets или оба вида. Пакетная декомпозиция не должна требовать
   одного глобального runtime-переключателя для всех графов.
6. В `@nodes/ui/connection-color.ts` сейчас зашит Hamiltonian transport catalog:
   `ipc`, `websocket`, `web-push`, Service Worker/Worker/MessagePort/Broadcast
   Channel и Oracle/Force RTC families вместе с конкретной палитрой. Это
   фактическая consumer-специфика внутри общего UI package.
7. Общий `layout-engine.ts` импортирует `@nodes/ui/card-layout` и переставляет
   `facts` конкретной карточной модели. Поэтому model/layout integration сейчас
   зависит не только от универсальных measured nodes/ports, но и от одного
   presentation preset, используемого Hamiltonian.
8. `@nodes/ui` содержит Inspector с обязательной зависимостью от `@ui/hud`, а
   root `nodes` barrel реэкспортирует model, layout, WebGPU surface и Inspector.
   Consumer не получает физически минимальную UI-зависимость одним выбором
   socket/layout policy.
9. Чистый runtime-код `@nodes/layout` не содержит branches по Hamiltonian
   entity или transport kind. Hamiltonian-названия в его tests являются
   сложной acceptance fixture, а не сами по себе нарушением универсальности.
   Нарушением остаётся public fixed-only law `source=out/EAST`,
   `target=in/WEST`, если его выдавать за единственную политику всех consumers.

## Решения владельца

1. Декомпозиция библиотеки обсуждается и принимается до новых задач на типы
   сокетов.
2. Нельзя строить один монолитный пакет, где все реализации всегда загружаются,
   а различие задаётся только конфигурацией наподобие ELK.
3. MetaFor и Bulk требуют максимально лёгкого фиксированного представления:
   вход расположен со своей стороны, выход — со своей; адаптивные двусторонние
   сокеты этому consumer не нужны.
4. Hamiltonian требует адаптивного представления, где двусторонний I/O-сокет
   может находиться справа или слева в зависимости от геометрии.
5. Сторонние проекты должны иметь возможность выбрать подходящее представление;
   для обзорных графов вероятным основным вариантом является адаптивное.
6. Общие принципы, идентичности и переиспользуемые функции не копируются между
   представлениями и не расходятся по смыслу.
7. После решения пакетной архитектуры будущая работа декомпозируется по
   семантике сокета: каждая подзадача отвечает за свой тип целиком, включая
   форму, геометрию, размер, состояния, различимость и интерактивность.
8. В `nodes` не попадают MetaFor-, Bulk-, Hamiltonian- или transport-specific
   сущности, каталоги и палитры. Пакет хранит только общие законы построения
   node-system.
9. UI может предоставлять несколько видов сокетов и presentation policies, но
   их public names описывают универсальную capability/geometry/interaction
   role. Предметный смысл и style mapping задаёт consumer.
10. Формулы placement/routing для fixed, adaptive и явно собранного смешанного
    представления принадлежат пакетам `nodes` и не копируются в Bulk,
    Hamiltonian или сторонний проект.
11. Нодовое представление Bulk принадлежит `Space`/`Display`, не HUD, и
    обсуждается отдельно в `BLK-002`. Отключённый текущий HUD Node View является
    неудавшимся экспериментом и не задаёт архитектуру `nodes`.

## Общие принципы, которые нужно сохранить

Это исходные ограничения обсуждения, а не уже выбранная структура модулей:

* producer владеет domain identity нод, портов и semantic edges;
* edge заканчивается в exact socket конкретной parameter row;
* capability сокета, тип соединения, состояние и фактическое направление
  сообщения являются разными признаками;
* один физический двусторонний transport не обязан становиться двумя edges;
* направление живого сообщения может показываться движением marker по одному
  edge;
* одинаковый serializable input даёт детерминированную geometry;
* renderer не меняет semantic topology и exact endpoints;
* fixed и adaptive представления используют одну совместимую смысловую основу,
  но не обязаны импортировать layout/UI/interaction реализацию друг друга.

## Принятая физическая граница

Владелец 13 августа 2026 года разрешил реализацию следующего package graph:

1. `nodes` — лёгкое ядро: serializable model, validation, containment,
   positioned-geometry helpers и Worker transport. Корневой barrel не
   реэкспортирует renderer, HUD или числовой layout package.
2. `@nodes/layout` — чистая числовая геометрия и routing. Она не знает карточки,
   HUD, Hamiltonian, Bulk или renderer.
3. `@nodes/ui` — HUD-free WebGPU primitives, viewport, edge/flow presentation,
   универсальный card preset и явно названный fixed-port card adapter. Любая
   предметная палитра приходит через consumer-provided resolver.
4. `@nodes/hud` — необязательные HUD-компоненты вроде Inspector. Ни ядро, ни
   renderer не зависят от него.
5. Hamiltonian владеет transport catalog, его палитрой, легендой, lifecycle
   projection и composition этих универсальных частей. Необходимый перенос из
   `nodes` выполняется сейчас; дальнейшее собирание всего visual-кода в единую
   внутреннюю директорию принадлежит отдельной `HAM-002`.

Общий `NodeSystemDocument` остаётся единственным смысловым договором. Fixed и
будущий adaptive adapter выбирают placement socket, не создавая второй model.
`NodeSystemSurface` принимает уже positioned geometry, поэтому consumer со
своей adaptive policy не импортирует fixed adapter.

## Разрешённые зависимости

* `nodes -> @nodes/layout` только для числовых Worker types/transport;
* `@nodes/ui -> nodes + @nodes/layout + engine/ui primitives`;
* `@nodes/hud -> nodes + @ui/hud`;
* `Hamiltonian -> nodes + выбранные @nodes/* entrypoints`;
* запрещены `nodes -> @nodes/ui`, `nodes -> @nodes/hud`,
  `@nodes/ui -> @nodes/hud|@ui/hud` и любые imports из Hamiltonian в пакеты
  `nodes`.

Корневые barrels не восстанавливают запрещённые зависимости реэкспортом.

## Отложенные вопросы

1. Точная семантика, форма и side-selection будущего adaptive `inout` socket;
   она получает отдельную задачу после физического refactor.
2. Нужен ли кроме универсального card preset параметризуемый content adapter
   для проектов с другой внутренней анатомией ноды.
3. Какие interaction primitives нужны Bulk; решение принадлежит `BLK-002` и не
   расширяет текущий patch.
4. Абсолютный memory budget: текущий срез доказывает import graph и bundle
   composition; память измеряется только воспроизводимым методом отдельно.

## Подзадачи реализации

| ID | Срез | Состояние |
| --- | --- | --- |
| NODES-009.1 | Отделить ядро и явно назвать fixed card adapter | COMPLETE |
| NODES-009.2 | Отделить HUD и универсализировать visual style resolver | COMPLETE |
| NODES-009.3 | Перенести Hamiltonian catalog из `nodes` и мигрировать consumer | COMPLETE |
| NODES-009.4 | Доказать package graph, browser bundles и отсутствие регрессии | COMPLETE |
| NODES-009.5 | Обновить и доказать Service Worker после пакетного рефакторинга | COMPLETE |

NODES-009.1–NODES-009.3 меняют независимые владельцы файлов и сходятся перед
NODES-009.4. Подготовительный baseline: `c6b74258000a38812b49f2fe65c2e8ae2e1d0786`.

### NODES-009.5 — Обновить и доказать Service Worker после пакетного рефакторинга

Live-проверка 13 августа 2026 года подтвердила новый browser source revision:
старая открытая вкладка сохраняла `source:703202966b…`, а чистая вкладка после
запуска `main@9c569e9c9` получила `source:0c71d7b217…`. Новый WebGPU-граф
непуст, console capture чист, Service Worker активен, host identity подтверждён,
Oracle/Force peer находится в `connected` и счётчики сообщений растут.

При этом executable Service Worker version осталась `1.1.2`, как и в
подготовительном commit `9ae82ba1d`. Владелец требует завершить refactor с явно
обновлённой SW version. Срез повышает её до `1.1.3`, выполняет полный restart
Hamiltonian, проверяет новый bundle hash, активную runtime incarnation,
`workerUpdateRequired=false`, актуальный source revision и живую сцену. После
этого NODES-009.1–NODES-009.5 получают закрывающую live-проверку; родительская
NODES-009 остаётся `IN_PROGRESS` для дальнейшей работы владельца.

Result NODES-009.5:

* executable version повышена `1.1.2 → 1.1.3`, новый bundle SHA-256 —
  `8f337ddb2d8a92f57f3c5433cd02a60b7b32ae0f5889ae407795ddbc28031045`;
* после полного restart активна новая runtime incarnation
  `f5c188b2-4d21-4596-a9c2-97b85c400284`, identity подтверждена,
  `workerUpdateRequired=false`, waiting/installing Worker отсутствует;
* обе открытые вкладки получили один актуальный browser revision
  `source:7bfdf82e3f545de9d7123eb4c660185fbdfab39c8293158f94dbcc5fadc9d27c`
  и находятся в retained topology одного Chrome;
* peer `connected`, native channels `oracle`/`force` действуют, счётчики после
  update выросли с `3/3` до `9/9`, console capture — `0` entries;
* финальный WebGPU-кадр содержит обе актуальные page realm, Service Worker
  `1.1.3`, серверный контур и обе RTC-линии без stale/error realm.

## Поведение процесса

Задача принята в исполнение. Текущий patch меняет физические границы и переносит
уже существующее поведение без проектирования новой формы socket. `inout` не
считается принятым adaptive-дизайном только из-за сохранения compatibility.

## Границы

* Не менять смысл действующего runtime и принятой визуальной сцены.
* Не продолжать визуальный дизайн `MF-424.2`, Bulk или MetaFor в этом patch.
  Bulk-specific cleanup и новая нодовая система принадлежат `BLK-002`.
* Не проектировать формы всех сокетов до решения физической границы пакетов.
* Не обещать экономию памяти или bundle size без воспроизводимого измерения.
* Не ослаблять exact-socket routing, containment, clearance, deterministic
  layout и существующую edge-hover семантику.

## Критерии готовности

1. Зафиксирован текущий и итоговый import/dependency graph и измерена стоимость
   fixed-adapter consumer и custom-positioned consumer, способного использовать
   внешнюю adaptive policy.
2. Реализован принятый package/module graph с однозначным владельцем model,
   validation, layout policy, Worker adapter, UI и HUD integration.
3. Доказано, что fixed consumer не включает adaptive реализацию, а adaptive
   consumer не обязан импортировать fixed policy.
4. Общие принципы выражены одним public contract без копирования типов.
5. Определены независимые entrypoints, разрешённые направления импортов и
   автоматические проверки нарушений границы.
6. Записаны budgets и воспроизводимый способ сравнения bundle, cold import,
   layout и memory cost.
7. Подготовлен порядок миграции MetaFor/Bulk, Hamiltonian и стороннего consumer
   без временного монолитного fallback.
8. Отдельная `HAM-002` зарегистрирована зависимой задачей; формы и поведение
   новых socket types не реализованы скрыто внутри package refactor.

## Проверка результата

Для архитектурного решения потребуются:

* проверка package/import graph;
* два минимальных consumer fixtures: fixed и adaptive;
* production-like browser builds обоих fixtures с отчётом состава и размера;
* повторяемые измерения cold import/layout и, если методика надёжна, памяти;
* package tests, typecheck и browser-export checks;
* независимая проверка границ до принятия реализации.

## Результат реализации

13 августа 2026 года подготовлен result для review:

1. Корневой `nodes` больше не зависит от `@nodes/ui` и не реэкспортирует
   renderer или `@nodes/layout`. Validation-only browser fixture собирается в
   `3,045` bytes (`1,044` gzip) вместо прежних `283,140` bytes через root barrel.
2. Card-specific adapter перенесён в явный
   `@nodes/ui/fixed-card-layout`; public API называется
   `FixedNodeSystemCardLayouter`/`FixedNodeSystemCardWorkerLayouter` без
   MetaFor branding.
3. `@nodes/ui` не зависит от HUD. Inspector вынесен в отдельный optional
   workspace `@nodes/hud`.
4. Hamiltonian transport catalog и его палитра перенесены к consumer. Generic
   surface принимает один `NodeSystemConnectionColorResolver` и одинаково
   применяет его к socket, edge и flow marker.
5. Public `edge-particle` переименован в универсальный `edge-flow-marker`, не
   смешивающий UI-анимацию с доменным понятием MetaFor Particle.
6. Автоматический package-boundary test проверяет source imports, реальные
   exports, отсутствие product vocabulary и три независимые browser-сборки.
7. Hamiltonian мигрирован на новые entrypoints без compatibility barrel.

Проверено на итоговом дереве:

* `bun test pkg/nodes` — `91 pass / 0 fail`, `1686 expect()`;
* `bun run test` в `hamiltonian` — `203 pass / 0 fail`, `4006 expect()`;
* root, `nodes`, `@nodes/ui` и `@nodes/hud` typecheck — успешно;
* `hamiltonian/browser-build.spec.ts` — production browser orchestration и
  isolated Worker bundles собираются;
* `bun run docs:layout` и `git diff --check` — успешно.

Runtime не перезапускался и live visual acceptance не выполнялась: этот result
доказывает package/import equivalence, tests и browser build. Structural
реорганизация всей Hamiltonian visualization остаётся в зависимой `HAM-002`.

## Артефакты

Воспроизводимые fixtures находятся в `pkg/nodes/fixtures/`, проверки — в
`pkg/nodes/package-boundary.test.ts`, а размеры и границы доказательства — в
[`project/artifacts/NODES-009/README.md`](../artifacts/NODES-009/README.md).
