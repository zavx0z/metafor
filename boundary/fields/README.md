# @boundary/fields

Оркестрация данных для GPU-эволюции суперпозиций.

## API

### `write(data: Data): Promise<[number, number][]>`

```typescript
import { write, FieldType } from "@boundary/fields"

const initialStates = await write({
  fields: [{ type: FieldType.F32 }],
  branes: [{
    params: [[0, 100]],
    state: 0,
    collapses: [[[1, { 0: { gt: 50 } }]], [null]],
  }],
})
```

### `update(updates): Promise<[number, number][]>`

```typescript
import { update } from "@boundary/fields"

// Обновление полей
await update([[0, [{ fieldIndex: 0, value: 100 }]]])

// С блокировкой переходов
await update([[0, [{ fieldIndex: 0, value: 100 }], true]])

// Разблокировать
await update([[0, [{ fieldIndex: 0, value: 100 }], false]])
```

## Блокировка переходов

```typescript
// Заблокировать брану на один update()
await update([[0, [{ fieldIndex: 0, value: 100 }], true]])

// Lock флаг сохраняется до явной смены
await update([[0, [{ fieldIndex: 0, value: 100 }]]])  // Всё ещё заблокирована

// Разблокировать
await update([[0, [{ fieldIndex: 0, value: 100 }], false]])
```

## Тесты

```bash
bun test
```
