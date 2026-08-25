# Документация MetaFor

Это единственный вход в действующую документацию реализации. Для обычной
работы достаточно этого репозитория: внешний Concept не нужно клонировать,
читать или изменять. Если исследовательская идея становится рабочим решением,
сначала она формулируется здесь как короткий проверяемый закон.

## Что является источником истины

1. Документ-владелец домена задаёт смысл, жизненный цикл и инварианты.
1. Public types задают точную форму данных.
1. Код реализует контракт, тесты доказывают конкретные сценарии.
1. TSDoc рядом с public contracts объясняет техническое устройство кода и связывает его с
   подтверждающими проверками.
1. `TODO` хранит только отложенную работу. Он не описывает уже действующее
   поведение.

Если эти уровни расходятся, расхождение нужно назвать явно. Нельзя молча
объявлять код новым законом или подгонять код под устаревший текст.

## Карта документов

* [Агентные Вселенные](AGENT_UNIVERSES.md) — Agent Atom, окружающие Tool,
  Device и Service Atoms, предметное изменение Fields и будущий интерфейс Bulk.
* [Архитектура runtime](ARCHITECTURE.md) — состав contour и связи доменов.
* [Dark](DARK.md) — Oracle, Force, декларации, причинное время и границы
  публичного наблюдения.
* [Force](FORCE.md) — Dark Force: единый Particle channel, complete post-cut
  history, relay и fail-stop внутри Dark process.
* [Immutable checkpoints](CHECKPOINTS.md) — coherent Boundary+Mass capture,
  отдельный Git provenance и forward-only replay.
* [Boundary](../quantum/boundary/DOMAIN.md) — каноническое состояние, identity,
  materialization и commit.
* [Matrix](../quantum/matrix/README.md) — жизненный цикл State, Transition и Process,
  включая рождение, блокировку, перестройку и ошибки.
* [Energy](domains/ENERGY.md) — Process, Mass, Energy и lifecycle живых
  ресурсов.
* [Bulk Store и Visual projection](../quantum/bulk/VISUAL.md) — единый browser Store,
  локальные Force handlers и принадлежащая `pkg/visual` геометрия.
* [Visual layouts](../pkg/visual/CONTRACT.md) — именованные способы показать
  один полный Bulk scene snapshot.
* [Engine](https://github.com/zavx0z/engine/blob/main/packages/core/contract.md) —
  координаты и единицы сцены, обычные и скелетные mesh и материалы renderer.
* [Layout](https://github.com/zavx0z/layout/blob/main/ARCHITECTURE.md) —
  `UiRuntime`, `UiSurface`, HUD, пространственные Displays, input и FlexBox.
* [UI elements](https://github.com/zavx0z/ui/blob/main/packages/elements/requirements.md) —
  визуальные primitives, controlled editing, theme и icons поверх Layout.
* [UI components](https://github.com/zavx0z/ui/blob/main/packages/components/requirements.md) —
  универсальные WebGPU-поля и составные controls, пригодные внутри node editor и вне него.
* [Production delivery UI](https://github.com/zavx0z/ui/blob/main/docs/delivery.md) —
  независимые ESM subpath imports и одна module identity каждого связанного package.
* `@zavx0z/storybook` (далее — shared Storybook) владеет typed route tree,
  пятизонным FlexBox Workbench, no-HMR server и static manifest для отдельных
  repository-owned Storybook applications. [UI Storybook](https://github.com/zavx0z/ui/blob/main/packages/storybook/requirements.md)
  сохраняет собственные catalog pages, routes, lifecycle и acceptance, не
  становясь владельцем общей инфраструктуры.
* [Web Push](../pkg/web-push/CONTRACT.md) — runtime-разделённые permission,
  подписка, доставка, receipt и необязательные lifecycle hooks без встроенного
  transport наблюдения.
* [Внешний уровень исполнения Cosmos](../cosmos/README.md) задаёт общий закон
  запуска, выпуска и инфраструктуры. [Устойчивый запуск
  выпуска](../cosmos/startup/README.md#как-начинается-работа) принадлежит
  `@cosmos/startup` (далее — startup), [подготовка полного
  выпуска](../cosmos/release/README.md#что-называется-выпуском) —
  `@cosmos/release` (далее — release), [закон внутренних
  пакетов](../cosmos/internal/README.md#внутренний-пакет-и-его-возможность) —
  пространству `@internal/*` (далее — internal-пакеты), а [готовая визуальная
  среда Cosmos](../cosmos/internal/visual/README.md#визуальная-среда-main) —
  `@internal/visual` (далее — visual).
* [Node system](https://github.com/zavx0z/node/blob/main/README.md) — живой runtime-граф `@nodes/core`
  `NodeTree → Frame / Node → Parameter → Socket → Link`, Parameter-store,
  производные view-проекции и отдельно сохранённое layout-ядро
  `@nodes/layout` (далее — layout).
  Node Editor и его
  FlexBox/view законы
  принадлежат [`@nodes/ui`](https://github.com/zavx0z/node/blob/main/packages/ui/requirements.md) (далее — node UI),
  runtime/snapshot/projection граница —
  [`@nodes/core`](https://github.com/zavx0z/node/blob/main/packages/core/requirements.md),
  universal authoring-команды —
  [`@nodes/editor`](https://github.com/zavx0z/node/blob/main/packages/editor/requirements.md),
  единый dev-каталог всех package pages —
  [`@nodes/storybook`](https://github.com/zavx0z/node/blob/main/packages/storybook/requirements.md),
  а алгоритмические законы
  разделены на [общие](https://github.com/zavx0z/node/blob/main/packages/layout/requirements/common.md),
  [adaptive side-selection](https://github.com/zavx0z/node/blob/main/packages/layout/requirements/adaptive.md),
  [`RIGHT`](https://github.com/zavx0z/node/blob/main/packages/layout/requirements/right.md) и
  [`DOWN`](https://github.com/zavx0z/node/blob/main/packages/layout/requirements/down.md).
* [Протоколы сил](proto/) — справочное чтение wire-потоков; при конфликте
  приоритет имеет контракт домена и public type.
* [Работа с Meta-пакетами](META_PACKAGES.md) — граница внешних репозиториев в
  `cluster/`.
* [Все правила Create MetaFor](../create-metafor/rules/metafor.md) — законы
  авторинга `meta.ts` и канонический смысловой контракт клиентских
  RPC-проекций.
* [Разработка](DEVELOPMENT.md) и [вклад](CONTRIBUTING.md) — запуск и проверки.

## Сохранённые project-материалы

`project/` остаётся в репозитории как сохранённый набор прежних планов и
артефактов. Он не является текущим рабочим процессом, обязательной очередью или
источником действующих контрактов; обращаться к нему нужно только по прямому
запросу пользователя.

`create-metafor/templates/TODO.md` является содержимым создаваемого шаблона, а
не рабочим списком самого MetaFor.

## Как менять документацию

* Менять один документ-владелец, а не копировать один закон в несколько обзоров.
* Писать коротко и проверяемо: событие → владелец решения → наблюдаемый результат.
* Пример использовать только для пояснения закона, не вместо закона.
* Использовать один термин для одной сущности и не подменять им соседние
  понятия внутри одного закона.
* Первое полное scoped-имя каждого пакета прямо в предложении объявляет короткое
  имя: `@scope/name` (далее — `name`). Все следующие упоминания в том же
  документе используют короткое имя. Namespace объявляется во множественном
  числе, а уже короткое unscoped-имя не получает alias самому себе.
* Включать перекрёстную ссылку в предложение с проверяемым законом и точным
  владельцем. Текст ссылки называет предмет закона, а не файл или документацию;
  предложение сохраняет смысл без Markdown-разметки.
* В обычной документации описывать устройство системы понятным языком:
  жизненный цикл, возможные случаи и границы ответственности.
* Не перечислять в обычной документации внутренние файлы, модули, структуры
  памяти, способы вычисления и расположение проверок.
* Технические подробности хранить в TSDoc рядом с типами и кодом. Там же
  давать ссылки на конкретные проверки пользовательских случаев.
* Документация для разработки может содержать команды запуска и проверки, но
  не должна становиться вторым описанием внутренней архитектуры.
* Не хранить здесь статус сессии, историю коммитов и неподтверждённые планы.
* После изменения перечитать diff и выполнить `git diff --check`.
