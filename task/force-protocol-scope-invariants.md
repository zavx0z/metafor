# Инварианты области действия Force-патча

Дата: 2026-06-30. Ветка: `energy`.

Этот документ уточняет `task/force-protocol-research.md` после обсуждения адресации.
Он фиксирует главный закон ближайшего протокола: публичный `path` выбирает
область действия патча, а конкретные внутренние элементы адресуются ID внутри
`value`.

## 1. Главный закон

`path` не должен дробиться до отдельных полей, Fuzzy, MACHO, Axion, process или
Bulk field particle.

Публичный `path` имеет два устойчивых вида:

```text
path = WIMP SRC  // область декларации / структуры класса
path = actor ID  // область конкретного WIMP instance / runtime actor
```

`part` выбирает физику изменения.

`value` содержит минимальный объектный патч внутри выбранной области.

Коротко:

```text
class patch    = part + WIMP SRC + value
instance patch = part + actor ID + value
```

И ещё короче:

```text
path  = scope id
value = минимальный patch внутри scope
part  = carrier / force semantics
op    = операция
```

## 2. Почему не FieldParticleId, FuzzyId, MACHOId, AxionId в публичном path

Публичный Force-патч должен начинаться с логической области, а не с leaf-узла.

Для structural-патча областью является WIMP SRC. Такой патч может затронуть все
actor instance этого WIMP, и это нормально: получатель сам собирает affected
actors через связь `actor.wimp = WIMP SRC`.

Для runtime-патча областью является actor ID. Actor уже связан с WIMP SRC,
текущими значениями, состоянием, дочерними topology nodes и Bulk-проекцией.
Поэтому поиск всегда может идти так:

```text
actor ID -> actor instance -> WIMP SRC -> internal ids from value -> exact target
```

Если вынести `FieldParticleId`, `FuzzyId`, `MACHOId`, `AxionId` или `ProcessId`
в публичный `path`, протокол начнёт плодить множество публичных адресных
пространств и потеряет главное упрощение: единый scope-поиск.

Эти ID могут и должны существовать внутри Boundary, Energy, Bulk и resolver cache,
но они не являются публичным Force `path`.

## 3. Везде ID, не key

Ключи (`key`) могут структурно изменяться. Поэтому key не должен быть стабильным
адресом в протоколе.

Инвариант:

```text
Ключи — изменяемая метаинформация.
Адреса протокола и внутренних элементов — ID.
```

Следовательно, внутри `value` тоже нужно адресовать изменяемые элементы по ID:

```jsonc
{
  "fields": {
    "1": {
      "key": "method",
      "type": "enum",
      "values": ["native", "css"],
      "label": "Метод"
    }
  }
}
```

Здесь:

```text
"1"              = стабильный ID поля / структурного элемента
"key": "method" = изменяемое свойство этого элемента
```

Если поле переименовывается, ID остаётся тем же:

```jsonc
{
  "part": "graviton",
  "op": "replace",
  "path": "zavx0z/full-screen",
  "value": {
    "fields": {
      "1": {
        "key": "mode"
      }
    }
  }
}
```

## 4. Class-scope patch: path = WIMP SRC

Structural-патчи идут по WIMP SRC.

Они могут менять:

- metadata WIMP;
- ordinary field declarations;
- Fuzzy declarations;
- MACHO declarations;
- Axion declarations;
- superposition;
- process declarations;
- reaction declarations;
- matter/connectivity plan;
- binding/source declaration.

Пример изменения structural field / Fuzzy-compatible declaration:

```jsonc
{
  "part": "higgs",
  "op": "replace",
  "path": "zavx0z/full-screen",
  "value": {
    "fields": {
      "1": {
        "key": "method",
        "type": "enum",
        "values": ["native", "css"],
        "label": "Метод"
      }
    }
  }
}
```

Получатель делает:

```text
path -> WIMP SRC
value.fields[1] -> structural element id внутри WIMP declaration
WIMP SRC -> все actor instance этого WIMP, если нужен projection/runtime refresh
```

Такой class-scope patch позволяет не рассылать N одинаковых патчей по каждому
actor instance.

## 5. Instance-scope patch: path = actor ID

Runtime-патчи идут по actor ID.

Они могут менять:

- значения StringField / NumberField / BooleanField;
- runtime-выбор Fuzzy;
- runtime-множественность MACHO;
- runtime-результат Axion;
- состояние actor instance;
- claim/release процесса;
- результат процесса;
- локальные write-set эффекты.

Пример ordinary field value:

```jsonc
{
  "part": "gluon",
  "op": "replace",
  "path": 17,
  "value": {
    "fields": {
      "2": "request failed"
    }
  }
}
```

Получатель делает:

```text
path 17 -> actor instance
actor.wimp -> WIMP SRC
value.fields[2] -> field id внутри WIMP declaration
part gluon -> ordinary value update
```

Пример Fuzzy selection / enum compatibility:

```jsonc
{
  "part": "higgs",
  "op": "replace",
  "path": 17,
  "value": {
    "fields": {
      "1": "native"
    }
  }
}
```

Получатель делает:

```text
path 17 -> actor instance
actor.wimp -> WIMP SRC
value.fields[1] -> Fuzzy/enum slot id внутри WIMP declaration
part higgs -> connectivity/runtime topology update
```

## 6. Что лежит внутри value

`value` является минимальным объектным патчем внутри выбранной области.

Для class scope:

```jsonc
{
  "fields": {
    "1": { "key": "title", "type": "string" }
  },
  "superposition": {
    "1": { "name": "idle" }
  },
  "processes": {
    "1": { "key": "loading" }
  },
  "matter": {
    "1": { "kind": "fuzzy" }
  }
}
```

Для instance scope:

```jsonc
{
  "fields": {
    "1": "hello",
    "2": null
  },
  "state": "ready"
}
```

Форма должна передавать только реально изменившиеся элементы.

## 7. Исправленная матрица v0

| Действие | `part` | `path` | `value` |
|---|---|---|---|
| Создать / изменить WIMP declaration | `graviton` | WIMP SRC | минимальная декларация / structural patch |
| Изменить ordinary field schema | `graviton` | WIMP SRC | `{ fields: { [fieldId]: schemaPatch } }` |
| Изменить Fuzzy declaration | `higgs` | WIMP SRC | `{ fields/connectivity: { [id]: patch } }` |
| Изменить MACHO declaration | `higgs` | WIMP SRC | `{ fields/connectivity: { [id]: patch } }` |
| Изменить Axion declaration | `higgs` | WIMP SRC | `{ connectivity/matter: { [id]: patch } }` |
| Изменить superposition | `graviton` | WIMP SRC | `{ superposition: { [stateId]: patch } }` |
| Изменить process declaration | `graviton` | WIMP SRC | `{ processes: { [processId]: patch } }` |
| Изменить reaction declaration | `graviton` | WIMP SRC | `{ reactions: { [reactionId]: patch } }` |
| Изменить matter/connectivity plan | `higgs` | WIMP SRC | `{ matter: { [matterId]: patch } }` |
| Создать actor instance | `graviton` | actor ID | `{ src: WIMP SRC, parent? }` |
| Изменить ordinary value | `gluon` | actor ID | `{ fields: { [fieldId]: value } }` |
| Изменить Fuzzy selection | `higgs` | actor ID | `{ fields: { [fuzzyFieldId]: selectedVariantIdOrValue } }` |
| Изменить MACHO multiplicity | `higgs` | actor ID | `{ fields: { [machoFieldId]: multiplicityPatch } }` |
| Изменить Axion runtime result | `higgs` | actor ID | `{ axion/connectivity/fields: { [id]: value } }` |
| State transition | `photon` | actor ID | `"state"` или `{ state }` |
| Process claim/release | `z` | actor ID | `{ action, token? }` |
| Process success | `w+` | actor ID | `{ fields?, state?, token? }` |
| Process error | `w-` | actor ID | `{ fields?, error?, state?, token? }` |

## 8. Что нужно исправить в основном исследовании

В `task/force-protocol-research.md` нужно убрать или переписать формулировки,
которые предлагают будущий публичный переход к:

```text
gluon.path = FieldParticleId
higgs.path = FuzzyId | MACHOId | AxionId
w.path = ProcessRunId как обязательный public path
```

Правильная формулировка:

```text
Публичный Force path имеет два устойчивых scope:
- WIMP SRC для class/structure patches;
- actor ID для instance/runtime patches.

Field/Fuzzy/MACHO/Axion/process/runtime ids являются internal resolver ids.
Они используются внутри `value` или projection cache, но не становятся публичным
Force path по умолчанию.
```

Также нужно заменить все формулировки вида:

```text
fieldKey или order/key
WIMPId + fieldKey
ActorId + fieldKey
field key -> field id
```

на:

```text
fieldId
WIMP SRC + fieldId
ActorId + fieldId
key is mutable metadata, not address
```

## 9. Итог

Минимализм протокола не в том, чтобы сделать `path` максимально точным до leaf-ID.
Минимализм в том, чтобы `path` был корнем изменения, а `value` содержал только
те внутренние ID и данные, которые реально изменились.

Финальный закон:

```text
path = WIMP SRC | actor ID
value.* = Record<ID, patch>
key/name/label/type = mutable properties inside patch
```
