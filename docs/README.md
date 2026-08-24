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
* [Engine](../pkg/engine/CONTRACT.md) — координаты и единицы сцены, правила
  обычных и скелетных mesh и материалы renderer.
* [UI elements](../pkg/ui/elements/REQUIREMENTS.md) — обязательный Flex-закон
  всей UI-композиции и граница низкоуровневого drawing.
* [UI components](../pkg/ui/components/REQUIREMENTS.md) — универсальные
  WebGPU-поля и составные controls, пригодные внутри node editor и вне него.
* [Production delivery UI](../pkg/ui/DELIVERY.md) — независимые ESM subpath
  imports, один product-owned `UiRuntime` и shared Engine/Elements code без
  дублирования между динамически загружаемыми modules.
* [UI playground](../pkg/ui/playground/REQUIREMENTS.md) — общий typed router,
  historical five-panel FlexBox shell и no-HMR dev lifecycle для package-owned
  playground без consumer semantics.
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
* [Node system](../pkg/nodes/README.md) — Blender-подобная компонентная
  библиотека `NodeTree → Frame / Node → Parameter → Socket → Link`, universal
  fields и отдельно сохранённое layout-ядро `@nodes/layout` (далее — layout).
  Node Editor и его
  FlexBox/view законы
  принадлежат [`@nodes/ui`](../pkg/nodes/ui/REQUIREMENTS.md) (далее — node UI),
  временная semantic/measured/Worker граница —
  [`nodes`](../pkg/nodes/REQUIREMENTS.md),
  а алгоритмические законы
  разделены на [общие](../pkg/nodes/layout/requirements/COMMON.md),
  [adaptive side-selection](../pkg/nodes/layout/requirements/ADAPTIVE.md),
  [`RIGHT`](../pkg/nodes/layout/requirements/RIGHT.md) и
  [`DOWN`](../pkg/nodes/layout/requirements/DOWN.md).
* [Протоколы сил](proto/) — справочное чтение wire-потоков; при конфликте
  приоритет имеет контракт домена и public type.
* [Работа с Meta-пакетами](META_PACKAGES.md) — граница внешних репозиториев в
  `cluster/`.
* [Все правила Create MetaFor](../create-metafor/rules/metafor.md) — законы
  авторинга `meta.ts` и канонический смысловой контракт клиентских
  RPC-проекций.
* [Разработка](DEVELOPMENT.md) и [вклад](CONTRIBUTING.md) — запуск и проверки.

## Карта незавершённой работы

* [Универсальный рабочий процесс](../project/README.md) определяет единый способ
  вести работу и переносится между репозиториями.
* [Дорожная карта MetaFor](../project/ROADMAP.md) задаёт направления и крупный
  порядок развития.
* [Накопитель MetaFor](../project/BACKLOG.md) хранит ещё не принятую работу.
* [Граф исполнения MetaFor](../project/TODO.md) хранит приоритеты, зависимости,
  состояния и ссылки на живые карточки.

Других рабочих списков и отдельных аудитов в репозитории нет. Подробное
обсуждение находится только в `project/tasks/<ID>.md`, а исходные файлы — в
`project/artifacts/<ID>/`.

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
