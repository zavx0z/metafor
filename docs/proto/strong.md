# Strong

`strong.md` разворачивает силовое чтение `Strong`.
Общие различения силы, `Boson`, подтипа канала и `Impulse` заданы в [корневом Force](../FORCE.md).

## Сила и канал

`Strong` отвечает за удержание, сцепление, связность, компактизацию и устойчивость формы.
`Gluon` является подтипом `Boson` и каналом `Strong`.
Он изменяет значения обычных `Field`, не разрушая связность формы.

`Gluon` описывает силовой механизм такого runtime-изменения, но не подменяет
каноническую фиксацию declaration и локальную materialization в Boundary.

## Чтение по доменам

### Dark

- declaration обычных fields и их defaults как часть WIMP source;
- deterministic local declaration IDs;
- передача schema/defaults через Inflaton;
- отсутствие runtime atom values и Gluon mutation.

### Boundary

- canonical field declaration и defaults;
- materialized atom values, включая shared Value identity direct bindings;
- persisted source relation `child Atom/Field → parent Atom/Field`;
- устойчивое представление value records на границе;
- atom-addressed derived particles всех участников после одного commit и с
  одним `ts`.

### Matrix

- накопление compact values в локальном Matrix store;
- prepared entanglement только из canonical Boundary identity, не из равенства
  payload;
- применение atom-scoped `gluon` по `value.fields[fieldId]`;
- вычисление переходов после изменения обычного field;
- отсутствие прямого чтения Boundary.

### Bulk

- проявление runtime values без владения canonical store;
- наблюдаемое обновление обычных fields;
- сохранение привязки значения к проявленной atom projection.

## Граница действия `Gluon`

`Strong` работает только с обычными полями данных.
Он не является каналом изменения topology.

Это означает:

- `string`, `number` и `boolean` относятся к обычным полям данных,
- `enum` и `array` не относятся к обычным полям данных,
- `enum` и `array` принадлежат полям topology по своей типовой природе,
- поля topology обслуживаются не `Gluon`, а `Higgs boson`.

Такое различие первично по отношению к AST.
AST может разворачивать `enum` и `array` в конкретных контрактах, но не делает их обычными полями.

## Force обычного поля

В MetaFor обычный `Field` является носителем значения.
Если изменяется обычное значение, это изменение проводится через `Gluon`.

Точная прямая Matter-передача ordinary Field создаёт общую величину. Parent,
child и siblings могут иметь разные Field declaration identities, но их
materialized Atom/Field pairs указывают на один canonical Value. Запись любого
участника распространяется всем участникам одним параллельным time step.
Computed expression всегда создаёт новую независимую величину.

Иначе говоря:

- `Field` — носитель обычного значения,
- `Value` — текущее содержимое обычного поля,
- `Gluon` — переносчик изменения этого значения,
- `Strong` — сила, которая удерживает такое изменение и не даёт ему разрушить форму.

## Каноническое соответствие

Ниже дана согласованная раскладка для обычных полей данных.

| Класс глюона | Состояние глюона | Вид `Field` | Семантическая роль     |
| ------------ | ---------------- | ----------- | ---------------------- |
| Colored      | `red-antigreen`  | `string`    | free text scalar       |
| Colored      | `blue-antired`   | `number`    | free numeric scalar    |
| Colored      | `green-antiblue` | `boolean`   | free boolean scalar    |

## Почему `enum` и `array` выведены из `Strong`

Раньше `enum` и `array` могли читаться как специальные формы значения.
Текущее онтологическое различение строже:

- `enum` всегда задаёт выбор ветви и не является просто полем с ограниченным набором литералов,
- `array` всегда задаёт множественность ветвей и их разворачивание и не является обычной изменяемой коллекцией,
- ни `enum`, ни `array` не принадлежат режиму обычного обновления поля,
- ветвь topology не является обычным значением,
- изменение topology не должно смешиваться с изменением значения внутри уже существующей ветви.

Именно поэтому:

- `Photon` не подменяет `Gluon`,
- `Gluon` не подменяет `Higgs boson`,
- обычное обновление поля и изменение поля topology читаются как разные события.

## Примеры обычных обновлений

Пример 1. Обновление строки:

```js
update({ title: "MetaFor" })
```

Здесь изменение проходит через `red-antigreen gluon`, потому что обновляется обычный `string`.

Пример 2. Обновление числа:

```js
update({ priority: 3 })
```

Здесь работает `blue-antired gluon`, потому что обновляется обычный `number`.

Пример 3. Обновление булева значения:

```js
update({ visible: true })
```

Здесь действует `green-antiblue gluon`, потому что обновляется обычный `boolean`.

## Силовые различия

- `Strong` не переносит `State`; это делает `Photon`.
- `Strong` не изменяет поля topology; это делает `Higgs boson`.
- `Strong` не удерживает скрытую геометрию и адресуемость; это делает `Graviton`.
- `Strong` удерживает обычную определённость значения внутри уже существующей структуры.
