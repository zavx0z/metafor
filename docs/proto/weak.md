# Weak: Process protocol

Weak связывает State, выбор Energy, выполнение Process и канонический commit
результата. Доменные законы находятся в документации
[Matrix](../../matrix/README.md), [Energy](../domains/ENERGY.md) и
[Boundary](../../boundary/DOMAIN.md); точная форма сообщений опубликована в
TypeDoc Matrix.

## Один проход

```text
Matrix   -> photon/test                         (начало execution)
Energy   -> z/test                              (claim)
Matrix   -> z/copy                              (grant)
Energy   -> w+/w- replace                       (proposal)
Boundary -> gluon/higgs replace + w+/w- copy    (commit)
Matrix   -> снимает lock
```

Все частицы адресованы `path = atom ID`. У одного прохода есть созданный Matrix
`processExecutionId`; он связывает все сообщения и не переиспользуется после
перестройки Process.

## 1. Начало

Matrix ставит lock, замораживает читаемые Fields и сообщает process-bound State:

```ts
{
  part: "photon",
  op: "test",
  path: 17,
  from: "execution-uuid",
  value: "ready"
}
```

Boundary регистрирует execution вместе с текущими Atom, State и Process.
Energy находит descriptor по `atom -> WIMP` и `WIMP + state`. Matrix descriptor
не получает.

## 2. Claim и grant

Подходящая Energy отправляет:

```ts
{
  part: "z",
  op: "test",
  path: 17,
  value: {
    energy: "energy-local",
    processExecutionId: "execution-uuid"
  }
}
```

Matrix принимает только claim текущего locked execution и выбирает первого
исполнителя:

```ts
{
  part: "z",
  op: "copy",
  path: 17,
  from: "energy-local",
  value: {
    processExecutionId: "execution-uuid",
    fields: {"2": "commit"}
  }
}
```

Boundary запоминает выбранную Energy. Frozen Fields адресованы по canonical
`fieldId`; Energy перед вызовом action преобразует их в значения по field key.
Process descriptor через Z не передаётся.

## 3. Proposal

Energy исполняет локально сохранённый descriptor. Action получает:

```ts
{field, value, mass, energy, self, signal}
```

Success/error handler может записать только объявленные `writeFields`. Energy
отправляет предложение Boundary:

```ts
{
  part: "w+",
  op: "replace",
  path: 17,
  from: "energy-local",
  value: {
    processExecutionId: "execution-uuid",
    processId: 8,
    fields: {"3": "done"}
  }
}
```

Для ошибки используется `w-` и необязательный `error`. Это ещё не изменение
канонического мира и не команда Matrix снять lock.

## 4. Commit

Boundary проверяет в одной транзакции:

- execution существует и ещё pending;
- Atom, Process и выбранная Energy совпадают;
- State и Process declaration не изменились;
- write-set содержит только разрешённые Fields.

После записи Boundary выпускает по одной canonical consequence для изменённых
Atom (`gluon` для scalar Fields, `higgs` для topology Fields) и подтверждение:

```ts
{
  part: "w+",
  op: "copy",
  path: 17,
  from: "execution-uuid",
  value: {
    processExecutionId: "execution-uuid",
    processId: 8,
    energy: "energy-local"
  }
}
```

Matrix снимает lock только если identity подтверждения совпадает с её текущим
execution и выбранной Energy. Запоздалый proposal заменённого execution не
может изменить текущий мир или разблокировать новый Process.

## Runtime values

Mass handles и живые Energy-сущности остаются в локальных stores Energy и не
проходят через Force или Boundary. Mass bytes лежат в файловом каталоге, а
Matter binding передаёт только сериализуемые descriptors; child handles и
Energy values разрешаются локально из owning parent Atom.

Большие файлы, stdout/stderr и бинарные результаты также не следует переносить
в W payload. Process записывает их в объявленный Mass key через `MassHandle`, а
через Fields при необходимости передаёт компактную предметную identity.
