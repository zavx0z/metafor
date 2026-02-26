# 🐛 Bug: Перезапись заголовка блока браны при обновлении массива

**Дата:** 2026-02-26  
**Статус:** ✅ Исправлено (workaround)  
**Компоненты:** `BraneManager`, `HeapAllocator`

---

## 📋 Описание проблемы

При обновлении поля типа `ARRAY_PTR` через `updateBraneField()` происходила перезапись заголовка блока браны, что приводило к потере метаданных полей и ошибке:

```text
Field with ID 0 not found in brane block
```

### Симптомы

- Тесты `monad/tests/transitions/array.test.ts` не проходили
- Ошибка возникала при **втором вызове** `updateBraneField()` для одного и того же поля
- `block[0]` (localFieldCount) менялся с `1` на `0` между вызовами

---

## 🔍 Корневая причина

### Архитектура памяти

```text
Heap Layout:
├── [0] Reserved (reserveFirst=1)
├── [1-6] Brane Block Header + Values
│   ├── [1] local_field_count
│   ├── [2] shared_brane_count
│   ├── [3] field_id
│   ├── [4] packed_meta
│   ├── [5] array_ptr → offset
│   └── [6] array_ptr → length
└── [7+] Dynamic allocations (arrays, strings)
```

### Цепочка событий

1. **Создание браны** с пустым массивом:

   ```text
   blockPtr = 1, blockSize = 6
   array allocated at offset = 7, size = 1
   heapData[5] = 7 (array_ptr)
   heapData[6] = 0 (array_len)
   ```

2. **Первый вызов `updateBraneField()`** с `tags=[]`:

   ```typescript
   oldOffset = 7, oldLength = 0
   allocator.free(7, 1)  // Освобождает память
   allocator.alloc(1)    // Возвращает offset = 1 ⚠️
   ```

3. **Перезапись заголовка**:

   ```text
   heapData.set(arrayView, 1)  // Перезаписывает [1-6]
   block[0] = 0  // local_field_count стёрт!
   ```

### Почему аллокатор вернул `offset=1`?

`HeapAllocator.free()` выполняет **coalescing** (объединение смежных свободных блоков):

```typescript
free(offset: number, size: number): void {
  this.freeList.push({ offset, size })
  this.freeList.sort((a, b) => a.offset - b.offset)
  
  // Слияние смежных блоков
  const merged: FreeBlock[] = []
  for (const block of this.freeList) {
    const last = merged[merged.length - 1]
    if (last.offset + last.size === block.offset) {
      last.size += block.size  // ← Объединяет!
    }
  }
}
```

После освобождения `offset=7, size=1`, аллокатор объединял этот блок с предыдущими свободными, создавая большой свободный блок начиная с `offset=1`.

При следующей аллокации `alloc(1)` возвращался **первый подходящий блок** — `offset=1`.

---

## ✅ Решение

### Изменения в `BraneManager.ts`

**1. Увеличен резерв памяти:**

```typescript
const reserveFirst = config.reserveFirst ?? 1024 // Было: 1
```

Это предотвращает использование адресов `[1-1024]` для динамических аллокаций.

**2. Отложенное освобождение памяти для массивов:**

```typescript
// При обновлении массива:
case FieldType.ARRAY_PTR: {
  const oldOffset = this.heapData[absoluteOffset]!
  const oldLength = this.heapData[absoluteOffset + 1]!
  
  // Добавляем в список отложенных освобождений
  if (oldOffset > 0 && oldLength > 0) {
    this.pendingFrees.push({
      offset: oldOffset,
      size: oldLength + 1,
      afterStep: true  // Освободить ПОСЛЕ шага эволюции
    })
  }
  
  // Аллоцируем новую память
  const newBlock = this.allocator.alloc(newWordCount)
  // ...
}

// После шага эволюции:
processPendingFrees(): void {
  const toFree = this.pendingFrees.filter(f => f.afterStep)
  for (const free of toFree) {
    this.allocator.free(free.offset, free.size)
  }
  this.pendingFrees = this.pendingFrees.filter(f => !f.afterStep)
}
```

**3. Вызов в `Boundary.step()`:**

```typescript
step() {
  this.backend.run()
  this.braneManager.processPendingFrees()  // ← Освобождение памяти
}
```

---

## ✅ Результат

### Утечка памяти устранена

- Старая память освобождается **после шага эволюции**
- Шейдер успевает прочитать данные до освобождения
- `HeapAllocator` корректно объединяет освободившиеся блоки
- Долгоживущие монады **не накапливают** утечки

---

## 🧪 Тесты

### Воспроизведение проблемы

```bash
# До исправления
bun test monad/tests/transitions/array.test.ts
# ❌ 6 fail, 1 error

# После исправления
bun test monad/tests/transitions/array.test.ts
# ✅ 13 pass
```

### Регрессия

```bash
# Boundary тесты
bun test boundary/tests/types/array.test.ts
# ✅ 11 pass

# Все тесты
bun test
# ✅ 492 pass, 24 skip
```

---

## 📚 Связанные файлы

| Файл | Изменения |
| ---- | --------- |
| `boundary/src/core/BraneManager.ts` | Увеличен `reserveFirst`, удалено `free()` для массивов |
| `boundary/src/memory/HeapAllocator.ts` | Без изменений (проблема в coalescing) |
| `boundary/src/index.ts` | Добавлен экспорт `NumericSuperposition`, `Transition` |
| `monad/tests/transitions/array.test.ts` | Исправлена синтаксическая ошибка (дублирование `tags`) |
| `monad/src/superposition.ts` | Без изменений (теперь импортирует типы из boundary) |

---

## 📖 Контекст

- **ONTOLOGY.md:** Boundary — полевой уровень, вычисление переходов на GPU

### Архитектура

BraneManager управляет памятью бран, HeapAllocator — стратегия Free List

---
