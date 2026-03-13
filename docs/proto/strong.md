# Strong

`strong.md` разворачивает протокольное чтение `Strong`.
Общие различения силы, `Boson`, подтипа канала и `Impulse` заданы в [корневом протоколе](../PROTOCOL.md).

## Сила и канал

`Strong` отвечает за удержание, сцепление, связность, компактизацию и устойчивость формы.
`Gluon` является подтипом `Boson` и каналом `Strong`.
Он изменяет значения ordinary `Field`, не разрушая связность формы.

`Gluon` описывает силовой механизм такого изменения, но не подменяет архитектурные обязанности `Boundary × Strong`.
Каноникализация, дедупликация, интернирование и уплотнение остаются за границей.

## Чтение по доменам

### Dark

- удержание скрытой непрерывности,
- согласованность схем,
- историческая связность зафиксированных состояний,
- изменение значений ordinary `Field` внутри удерживаемой структуры.

### Boundary

- каноническое изменение значений ordinary `Field`,
- связность компактной формы,
- подготовка устойчивого представления на границе,
- удержание канонической структурной рамки.

### Bulk

- применяемое изменение значений ordinary `Field`,
- устойчивость составной проявленной структуры,
- связность процессо-несущих конфигураций,
- удержание привязки и сцепления в исполнении.

## Граница действия `Gluon`

`Strong` работает только с ordinary data-fields.
Он не является каналом topology change.

Это означает:

- `string`, `number` и `boolean` относятся к ordinary data-fields,
- `enum` и `array` не относятся к ordinary data-fields,
- `enum` и `array` принадлежат topology-fields по своей типовой природе,
- topology-fields обслуживаются не `Gluon`, а `Higgs boson`.

Такое различие первично по отношению к AST.
AST может разворачивать `enum` и `array` в конкретных контрактах, но не делает их ordinary fields.

## Ordinary Field Protocol

В MetaFor ordinary `Field` является носителем значения.
Если изменяется ordinary value, это изменение проводится через `Gluon`.

Иначе говоря:

- `Field` — носитель ordinary value,
- `Value` — текущее содержимое ordinary field,
- `Gluon` — переносчик изменения этого значения,
- `Strong` — сила, которая удерживает такое изменение и не даёт ему разрушить форму.

## Каноническое соответствие

Ниже дана согласованная раскладка для ordinary data-fields.

| Класс глюона | Состояние глюона | Вид `Field` | Семантическая роль     |
| ------------ | ---------------- | ----------- | ---------------------- |
| Colored      | `red-antigreen`  | `string`    | free text scalar       |
| Colored      | `blue-antired`   | `number`    | free numeric scalar    |
| Colored      | `green-antiblue` | `boolean`   | free boolean scalar    |

## Почему `enum` и `array` выведены из `Strong`

Раньше `enum` и `array` могли читаться как специальные формы значения.
Текущее онтологическое различение строже:

- `enum` всегда задаёт branch selection,
- `array` всегда задаёт branch multiplicity / branch expansion,
- topology branch не является ordinary value,
- topology change не должен смешиваться с изменением значения внутри уже существующей ветви.

Именно поэтому:

- `Photon` не подменяет `Gluon`,
- `Gluon` не подменяет `Higgs boson`,
- ordinary field update и topology-field change читаются как разные события.

## Примеры ordinary updates

Пример 1. Обновление строки:

```js
update({ title: "MetaFor" })
```

Здесь изменение проходит через `red-antigreen gluon`, потому что обновляется ordinary `string`.

Пример 2. Обновление числа:

```js
update({ priority: 3 })
```

Здесь работает `blue-antired gluon`, потому что обновляется ordinary `number`.

Пример 3. Обновление булева значения:

```js
update({ visible: true })
```

Здесь действует `green-antiblue gluon`, потому что обновляется ordinary `boolean`.

## Протокольные различия

- `Strong` не переносит `State`; это делает `Photon`.
- `Strong` не изменяет topology-fields; это делает `Higgs boson`.
- `Strong` не удерживает скрытую геометрию и адресуемость; это делает `Graviton`.
- `Strong` удерживает ordinary определённость значения внутри уже существующей структуры.
