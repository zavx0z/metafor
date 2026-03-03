# `@boundary/fields`

Оркестрация данных для вычисления FSM в `BOUNDARY` (GPU-слой).

`@boundary/fields` отвечает за:

- валидацию и подготовку данных (`fields`, `branes`, `collapses`),
- инициализацию GPU-матрицы,
- инкрементальные обновления полей,
- выполнение runtime-шага эволюции и возврат изменённых состояний.

---

## Ключевая семантика

## `write()` — только инициализация (без runtime-step)

`write(data)`:

- подготавливает и записывает данные в GPU,
- инициализирует буферы и внутреннее состояние,
- **не выполняет шаг переходов FSM**,
- возвращает результат чтения изменений после инициализации (обычно `[]`).

Иными словами, переходы после `write()` не вычисляются автоматически.  
Первый реальный шаг переходов выполняется через `update()`.

## `update()` — runtime-эволюция

`update(updates)`:

- применяет изменения полей,
- при необходимости обновляет lock-флаги,
- выполняет один шаг FSM,
- возвращает только реально изменившиеся состояния: `[[braneIndex, newState], ...]`.

---

## API

## `write(data: Data): Promise<[number, number][]>`

Инициализирует матрицу.

```/dev/null/example.ts#L1-15
import { write, FieldType } from "@boundary/fields"

const initialChanges = await write({
  fields: [{ type: FieldType.F32 }],
  branes: [{
    params: [[0, 100]],
    state: 0,
    collapses: [
      [[1, { 0: { gt: 50 } }]],
      [null],
    ],
  }],
})
```

`initialChanges` после `write()` обычно пустой, пока не выполнен `update()`.

## `update(updates): Promise<[number, number][]>`

Выполняет runtime-шаг.

```/dev/null/example.ts#L17-36
import { update } from "@boundary/fields"

// Обновление поля и шаг FSM
const changes = await update([
  [0, [[0, 100]]],
])

// Принудительная блокировка перед шагом
await update([
  [0, [[0, 80]], true],
])

// Разблокировка без изменения полей
await update([
  [0, [], false],
])
```

---

## Блокировка переходов

Lock хранится на уровне браны и управляется третьим элементом update-кортежа:

- `true` — заблокировать переходы,
- `false` — разблокировать,
- `undefined` — оставить текущее значение lock как есть.

```/dev/null/lock.ts#L1-12
// Заблокировать брану
await update([[0, [[0, 100]], true]])

// Без lock-параметра состояние lock сохраняется
await update([[0, [[0, 50]]]])

// Явная разблокировка
await update([[0, [], false]])
```

---

## Минимальный рабочий сценарий

```/dev/null/flow.ts#L1-28
import { write, update, FieldType } from "@boundary/fields"

await write({
  fields: [{ type: FieldType.F32 }],
  branes: [{
    params: [[0, 30]],
    state: 0,
    collapses: [
      [[1, { 0: { gt: 50 } }]], // IDLE -> PATROL
      [null],
    ],
  }],
})

// Первый runtime-шаг: перехода нет (30 <= 50)
let changes = await update([[0, [[0, 30]]]])
// changes = []

// Следующий шаг: переход есть (80 > 50)
changes = await update([[0, [[0, 80]]]])
// changes = [[0, 1]]
```

---

## Примечания

- Возвращаются только изменённые состояния.
- Для `ARRAY`/`STRING` типов используются внутренние механизмы кодирования и памяти.
- `write()` и `update()` рассчитаны на пакетную обработку нескольких бран.

---

## Тесты

```/dev/null/commands.sh#L1-2
bun test boundary/fields/tests
```
