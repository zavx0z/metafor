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
проявленные runtime-миры восстанавливаются из соответствующих проекций этой
границы.

Здесь важны три различения:

1. declaration не является materialized world;
2. граница не является только хранилищем — она фиксирует текущую действительность;
3. проекция не является ссылкой на скрытый источник — она несёт достаточно
   данных для своего домена.

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
declaration IDs и передаёт Inflaton stream Boundary через Force.

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
после атомарной фиксации.

### Matrix

Matrix — домен runtime-state, переходов, locks и actor/brane processing.
Он получает самодостаточную проекцию current world и не является
персистентной копией Boundary.

Matrix проводит допустимые переходы, фиксирует process-bound state, сохраняет
frozen fields для executor-а и принимает результаты исполнения.

### Energy

Energy — домен исполнения процессов.
Он получает process catalog и runtime context через Force, выбирает подходящий
execution runtime, исполняет action и возвращает результат.

Energy владеет рабочей mass процесса. Он не является внешним tool API и не
читает Boundary.

### Bulk

Bulk — домен проявления, объёма, композиции и наблюдаемой формы.
Он получает собственную runtime-проекцию и не становится вторым canonical
хранилищем.

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

В текущем protocol Graviton исходит из Boundary и переносит materialized
структуру current world. Dark declaration не является Graviton.

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

`Inflaton` — частица возможности формы и declaration stream:

```text
Dark -> inflaton -> Force -> Boundary
```

Он переносит `meta`/WIMP declaration с `path = meta SRC`.
Inflaton не является runtime actor patch, не создаёт actor и не подменяет
Graviton.

## Сущности

### WIMP declaration

WIMP declaration — source description класса формы. В него входят fields,
states, transitions, conditions, processes, reactions, matter, serializable
mass declaration и bulk declaration. Canonical form появляется после atomic
Boundary commit.

Declaration может приходить частями, но все части адресуются одним WIMP SRC.

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
- Boundary хранит canonical catalog;
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

- Graviton — materialized structure;
- Photon — state signal;
- Gluon — ordinary field change;
- Higgs boson — topology change;
- Z/W bosons — process mediation/result.

Boson не совпадает с силой и не совпадает с содержимым изменения.

### Impulse

Impulse — содержимое изменения. В сериализуемой проекции оно выражается
`Particle` с `op`, `path`, `value` и при необходимости `from`.

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

Отдельного публичного ID для всего materialization snapshot сейчас нет:
current world определяется согласованным набором Boundary-owned rows.

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
- какая самодостаточная проекция пересекает границу.
