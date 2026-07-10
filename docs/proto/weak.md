# Weak

Weak отвечает за переход, claim, исполнение связанного процесса и возврат
результата. Общий Force contract задан в [FORCE.md](../FORCE.md).

## Каналы

- `Z boson` — нейтральная медиция и выбор исполнителя;
- `W boson` — завершение активного прохождения как `w+` или `w-`.

`Photon` остаётся наблюдаемым state signal. Он запускает Weak process flow,
но не становится W/Z channel.

## Declaration

Dark переносит process declaration через Inflaton. Boundary хранит canonical
process declaration вместе с:

- state binding;
- env;
- action source/import/wrapper;
- action read fields;
- success/error read/write fields;
- finally/before handler.

Boundary передаёт каждый process descriptor отдельным declaration Graviton.
Energy инкрементально индексирует descriptors с success/error handlers и
finally descriptor с `before`. Для finally Energy выполняет
`before({mass})` и возвращает `w+` с пустым write-set либо `w-` с ошибкой.
Matrix не получает ни один из этих descriptors.

## Runtime protocol

```text
Matrix -> photon/replace or photon/test
Energy -> z test
Matrix -> z copy
Energy -> execute cached descriptor
Energy -> w+ or w-
Matrix -> apply result, unlock, continue
```

Все сообщения идут через один Force transport как обычные `{parts}`.
`BroadcastChannel("force")` и direct Boundary read не являются частью
протокола.

### Photon

При обычном state Matrix испускает:

```ts
{part: "photon", op: "replace", path: 17, value: "ready"}
```

При process-bound state Matrix:

1. ставит lock;
2. сохраняет frozen actor fields;
3. испускает:

```ts
{part: "photon", op: "test", path: 17, value: "ready"}
```

Matrix store знает только process-bound marker по state. Process descriptor в
Matrix не передаётся.

### Claim через Z

Energy находит descriptor по `actor -> WIMP` и `WIMP + state`, проверяет
env и отправляет:

```ts
{part: "z", op: "test", path: 17, value: {energy: "energy-local"}}
```

Matrix принимает первого подходящего исполнителя и отвечает:

```ts
{
  part: "z",
  op: "copy",
  path: 17,
  from: "energy-local",
  value: {fields: {"2": "commit"}}
}
```

`z copy` содержит frozen fields и не содержит process descriptor.
Повторные claims после выбора игнорируются.

### Execution и W

Energy исполняет descriptor из своего локального store. Action получает:

```ts
{field, value, mass, self}
```

`value` адресован field keys, хотя Force runtime particles адресуют fields по
`fieldId`. `mass` принадлежит Energy и не переносится в Matrix.

Успех:

```ts
{
  part: "w+",
  op: "replace",
  path: 17,
  value: {fields: {"3": "done"}}
}
```

Ошибка:

```ts
{
  part: "w-",
  op: "replace",
  path: 17,
  value: {error: "failed", fields: {"4": "failed"}}
}
```

Success/error handler может записать только fields, объявленные в его
`writeFields`. Без handler или `update(...)` write-set остаётся пустым.
После результата Matrix применяет write-set, снимает lock и продолжает
transition.

## Addressing

- `path = actor ID`;
- fields находятся в `value.fields[fieldId]`;
- Energy identity находится в `z test.value.energy` и `z copy.from`;
- `processId`, `wimpId`, `executorId`, `token` не добавляются как
  top-level поля;
- `/field/...` не является Weak path.

## Данные инструментов

Weak частицы несут только управляющий результат и компактный write-set.
Текущая in-memory Energy mass подходит для compact process-local data.
Содержимое файлов, stdout/stderr и другие большие tool results должны
сохраняться в filesystem-backed operation mass/artifacts. Matrix и Force не
превращаются в хранилище результата.

## Чтение по доменам

### Dark

- process/reaction declaration;
- deterministic local declaration IDs;
- отсутствие runtime claim и execution.

### Boundary

- отдельные canonical process entities;
- state/process binding;
- поштучные actor/process consequences после commit.

### Matrix

- state transition;
- lock и frozen fields;
- первый accepted Energy;
- применение `w+`/`w-`.

### Energy

- инкрементальный actor/process store;
- actor/WIMP/process и parent-child индексы;
- env check;
- `z test`;
- action/handler execution;
- runtime mass;
- `w+`/`w-`.

### Bulk

- наблюдаемое проявление state/process/result без исполнения action.

## Силовые различия

- Weak не переносит state как сигнал — это Photon.
- Weak не меняет ordinary field как Strong — это Gluon.
- Weak не меняет topology — это Higgs boson.
- Weak не материализует структуру — это Boundary/Graviton.
