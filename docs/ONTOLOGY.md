# Онтология

Этот документ фиксирует, что существует в MetaFor до файловой структуры.
Код является проекцией онтологии, а не её источником.

## Основная форма

MetaFor различает:

- домены;
- силы;
- сущности.

Система читается как многомерная структура:

`Домен × Сила × Сущность`

Она не сводится к дереву модулей или последовательности функций.

## Голографическое чтение

Текущая онтология MetaFor строится в призме голографического принципа.
Скрытая возможность формы получает каноническую запись на Boundary, а
проявленные runtime-миры постепенно складываются в локальных проекциях доменов
из причинного потока минимальных particles.

Здесь важны три различения:

1. declaration не является materialized world;
2. граница не является только хранилищем — она фиксирует текущую действительность;
3. локальная проекция не является ссылкой на скрытый источник и не приходит
   готовым снимком — домен наращивает её по одной адресованной entity и хранит
   собственные parent-child/dependency индексы.

Главный инвариант: одна изменённая сущность передаётся одним `ForceMessage` с
одной `Particle`. Reset проекции, полная рематериализация и пересоздание
неизменённых сущностей запрещены, в том числе при cold start и reconnect.

Это не утверждение, что MetaFor буквально симулирует физическую Вселенную.
Голографический принцип используется как архитектурный инвариант целостности,
границы и самодостаточного проявления.

## Домены

В текущей модели существуют пять доменов:

- Dark;
- Boundary;
- Matrix;
- Energy;
- Bulk.

Force не является шестым доменом. Это универсальный transport силовых
импульсов между доменами.

### Dark

Dark — домен скрытой связности, деклараций и возможности формы.
Он читает `meta`, нормализует WIMP/matter description, назначает local
declaration IDs и передаёт Boundary поток отдельных Inflaton particles через
Force. Внутренняя проекция Dark хранит declaration entities и parent-child
индексы, необходимые для точного diff.

Ключевой инвариант: Dark не имеет собственного проявленного пространства.
В нём есть связность и её declaration, но нет actor instances текущего мира.

Частицы связности Dark:

- `Wimp` — статическая опора;
- `Fuzzy` — условная связность;
- `Macho` — множественная связность;
- `Axion` — логическая связность.

Dark назначает deterministic declaration IDs, но не создаёт actor, topology
instance или value IDs.

### Boundary

Boundary — домен предела, фиксации, каноникализации и materialization.
На границе source declaration становится canonical current world.

Boundary удерживает:

- canonical WIMP declaration;
- fields, states, processes, reactions и matter;
- actor instances;
- topology instances;
- values;
- materialized current hierarchy.

Boundary владеет runtime/materialization identity и испускает проекции только
после атомарной фиксации. Каждый входной patch меняет одну entity, а после
commit Boundary испускает отдельными particles только её реальные локальные
последствия.

### Matrix

Matrix — домен runtime-state, переходов, locks и actor/brane processing.
Он поштучно принимает runtime entities и deltas, наращивает собственную
проекцию actors/branes/values и поддерживает parent-child индексы. Matrix не
является персистентной копией Boundary.

Matrix проводит допустимые переходы, фиксирует process-bound state, сохраняет
frozen fields для executor-а и принимает результаты исполнения.

### Energy

Energy — домен исполнения процессов.
Он получает actors и process descriptors отдельными particles, поддерживает
локальные actor/WIMP/process и parent-child индексы, выбирает подходящий
execution runtime, исполняет action и возвращает результат.

Energy владеет рабочей mass процесса. Он не является внешним tool API и не
читает Boundary.

### Bulk

Bulk — домен проявления, объёма, композиции и наблюдаемой формы.
Он наращивает собственную runtime-проекцию по одной visual/runtime entity,
хранит parent-child/layout индексы и не становится вторым canonical хранилищем.

В текущей визуальной метафоре `Wimp`/`Fuzzy`/`Macho`/`Axion` могут
проявляться как Dark Matter, а обычные fields — как полевые частицы.
Имена геометрии не создают новые онтологические сущности.

## Короткая формула доменов

```text
Dark       — возможность и скрытая связность.
Boundary   — каноническая действительность.
Matrix     — runtime-переход и состояние.
Energy     — исполнение процесса.
Bulk       — проявленная форма.
Force      — перенос импульсов между ними.
```

## Силы

MetaFor использует четыре универсальные силы и отдельный канал изменения поля
topology:

- Gravity;
- Electromagnetism;
- Strong;
- Weak;
- Higgs field change.

Сила задаёт характер преобразования. Она не является сообщением и не
принадлежит одному домену.

### Gravity

Gravity задаёт отношение, локализацию, адресуемость и структурную организацию.
Её канал — `Graviton`.

В текущем protocol Graviton исходит из Boundary и переносит одну materialized
entity или её локальную delta. Dark declaration не является Graviton.

### Electromagnetism

Electromagnetism отвечает за наблюдаемое распространение state.
Её канал — `Photon`.

### Strong

Strong удерживает связность и обычную определённость values.
Её канал — `Gluon`, изменяющий обычные fields.

### Weak

Weak проводит переход и исполнение связанного с ним процесса:

- `Z boson` — claim и нейтральная медиция;
- `W boson` — результат активного прохождения, `w+` или `w-`.

### Higgs field change

Topology fields изменяются через `Higgs boson`.
Этот канал не переносит state и не меняет обычное field value.

## Declaration particle: Inflaton

`Inflaton` — частица возможности формы и одного declaration change:

```text
Dark -> inflaton -> Force -> Boundary
```

Он переносит одну declaration entity с адресом
`<wimp src>/<section>/<local id>`; singleton sections адресуются без
`<local id>`.
Inflaton не является runtime actor patch, не создаёт actor и не подменяет
Graviton.

## Сущности

### WIMP declaration

WIMP declaration — source description класса формы. В него входят fields,
states, transitions, conditions, processes, reactions, matter, serializable
mass declaration и bulk declaration. Canonical form появляется после atomic
Boundary commit.

Каждая declaration entity приходит отдельным impulse. Один impulse не содержит
целую WIMP declaration, таблицу или вложенный подграф.

### Actor / Brane

Actor — materialized instance WIMP. Brane — носитель runtime configuration,
state и связности этого instance.

Dark знает declaration, Boundary создаёт actor, Matrix проводит его state,
Bulk проявляет форму.

### Field

Field — носитель внутренней определённости.

Обычные fields:

- `string`;
- `number`;
- `boolean`.

Они изменяются через Gluon.

Topology fields:

- `enum` — выбор ветви;
- `array` — множественность ветвей.

Они изменяются через Higgs boson. `array` не является обычной коллекцией,
не участвует в entanglement и не мутируется внешней reaction. Macho expansion
зависит от runtime value конкретного actor, поэтому выполняется Boundary.

### State

State — текущая конфигурация materialized actor:

- Boundary хранит canonical declaration и current imprint;
- Matrix вычисляет runtime transition;
- Photon делает state наблюдаемым;
- Bulk проявляет его форму.

### Transition и Condition

Transition — допустимый проход между states.
Condition — ограничение этого прохода по fields/topology.

Dark декларирует их, Boundary канонизирует, Matrix вычисляет.

### Process

Process — declaration исполняемого действия, привязанного к state.

- Dark переносит declaration;
- Boundary хранит отдельные canonical process entities;
- Matrix знает только process-bound marker и runtime lock;
- Energy получает descriptor, исполняет action и handlers;
- Bulk может проявлять intent и result, не исполняя action.

### Reaction

Reaction — декларативная связь внешнего события с read/write/state contract.
Она является частью WIMP declaration даже до появления полного runtime
executor-а reactions.

### Mass

MetaFor различает три проекции mass:

- WIMP mass declaration — serializable source data, которое Dark передаёт через
  Inflaton, а Boundary хранит как часть canonical declaration;
- Energy runtime mass — mutable process-local working memory; текущая
  реализация хранит её in-memory и не передаёт через Force или Matrix;
- operation mass/artifacts — filesystem-backed inputs, outputs, logs и большие
  tool results будущего внешнего adapter pipeline.

Большие данные принадлежат operation mass/artifacts. Они не должны становиться
Matrix fields, Force particles или содержимым in-memory Energy mass.

### Boson

Boson — тип силового канала:

- Graviton — одно локальное изменение materialized structure;
- Photon — state signal;
- Gluon — ordinary field change;
- Higgs boson — topology change;
- Z/W bosons — process mediation/result.

Boson не совпадает с силой и не совпадает с содержимым изменения.

### Impulse

Impulse — содержимое изменения. В сериализуемой проекции оно выражается
`Particle` с `op`, `path`, `value` и при необходимости `from`.

Один Impulse относится к одной entity. Он не является контейнером мира,
таблицы или подграфа. Каждый домен удерживает внутренний store своей проекции и
parent-child/dependency indices, применяя Impulse локально. Reset уничтожил бы
причинную непрерывность и поэтому не является допустимой операцией ни для
обычной работы, ни для cold start/reconnect.

## Идентичность

MetaFor различает declaration identity и runtime/materialization identity.

Declaration identity задаёт Dark:

```text
wimpSrc + localNumber внутри конкретной declaration table
```

Например field `1` и state `1` одного WIMP различимы table context.
Тип сущности не кодируется в ID.

Runtime identity задаёт Boundary:

- actor ID;
- topology instance ID;
- value ID;

Отдельного публичного ID для всего мира нет: current world определяется
согласованным набором Boundary-owned rows и причинной последовательностью
локальных commits. Он никогда не переносится или пересоздаётся целиком.

Runtime index Matrix/Bulk является локальной геометрией проекции и не
подменяет устойчивую identity.

## Проявление сил по доменам

| Проекция                     | Роль                                              |
| ---------------------------- | ------------------------------------------------- |
| Dark × Gravity               | declaration связности и локализации               |
| Boundary × Gravity           | materialization и адресуемый current world        |
| Matrix × Gravity             | runtime actor/brane addressing                    |
| Bulk × Gravity               | проявленная пространственная организация          |
| Boundary × Strong            | canonical values, deduplication, compact form     |
| Matrix × Strong              | удержание runtime values                          |
| Boundary/Matrix/Bulk × Higgs | фиксация, проведение и проявление topology change |
| Matrix × Electromagnetism    | испускание Photon при state change                |
| Matrix/Energy × Weak         | claim, execution result и продолжение transition  |

Одна сила читается в нескольких доменах, но домены не получают право читать
внутренности друг друга.

## Финальное правило

MetaFor должен позволять описывать и связывать приложения, инструменты,
агентов, память, процессы и пространства в одной модели. Новая область не
получает скрытого исключения: она входит через `meta`, получает canonical
Boundary-проекцию и действует через Force.

Онтология отвечает на четыре вопроса:

- что существует;
- где оно существует;
- через какую силу меняется;
- какая минимальная entity или delta пересекает границу.
