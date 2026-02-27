# 🗂️ Структура буферов Matrix

**Версия:** 2.x
**Компоненты:** `GPUBackend`, `StringAtlas`, `evolution.wgsl`

---

## 📊 Обзор архитектуры

Matrix использует **10 GPU-буферов** для вычисления эволюции суперпозиций:

```text
┌───────────────────────────────────────────────────────────────┐
│                    GPU Device (VRAM)                          │
│                                                               │
│  ┌──────────────────┐  ┌──────────────────┐  ┌─────────────┐  │
│  │ braneDescriptors │  │      heap        │  │   states    │  │
│  │   (Storage)      │  │   (Storage)      │  │  (Storage)  │  │
│  └──────────────────┘  └──────────────────┘  └─────────────┘  │
│                                                               │
│  ┌──────────────────┐  ┌──────────────────┐  ┌─────────────┐  │
│  │   newStates      │  │    bytecode      │  │  uniforms   │  │
│  │   (Storage)      │  │   (Storage)      │  │  (Uniform)  │  │
│  └──────────────────┘  └──────────────────┘  └─────────────┘  │
│                                                               │
│  ┌──────────────────┐  ┌──────────────────┐                   │
│  │ stringRegistry   │  │   stringHeap     │                   │
│  │   (Storage)      │  │   (Storage)      │                   │
│  └──────────────────┘  └──────────────────┘                   │
│                                                               │
│  ┌──────────────────┐                                         │
│  │ stagingBuffer    │  ← CPU Readback (MAP_READ)              │
│  │   (Readback)     │                                         │
│  └──────────────────┘                                         │
└───────────────────────────────────────────────────────────────┘
```

---

## 🔬 Детальное описание буферов

### 1. braneDescriptors

**Кратко:** Таблица соответствия бран — где находятся их данные и правила.

**Тип:** `GPUBufferUsage.STORAGE`
**Формат:** `Uint32Array`
**Размер:** `braneCount × 2 × 4` байта
**BindGroup Binding:** `0`

**Структура:**

```text
┌──────────────┬────────────────────┬──────────────┬────────────────────┐
│ block_ptr[0] │ bytecode_offset[0] │ block_ptr[1] │ bytecode_offset[1] │
│ (u32)        │ (u32)              │ (u32)        │ (u32)              │
├──────────────┴────────────────────┴──────────────┴────────────────────┤
│ ...                                                                   │
└───────────────────────────────────────────────────────────────────────┘
```

**Описание:**

| Поле                | Тип    | Описание                              |
|:--------------------|:-------|:--------------------------------------|
| `block_ptr[i]`      | `u32`  | Смещение блока i-й браны в `heap`     |
| `bytecode_offset[i]`| `u32`  | Смещение bytecode для i-й браны       |

**Пример:**

```typescript
// 2 браны
braneDescriptors = new Uint32Array([
  1,      // brane 0: block_ptr = 1
  0,      // brane 0: bytecode_offset = 0
  100,    // brane 1: block_ptr = 100
  512,    // brane 1: bytecode_offset = 512
])
```

---

### 2. heap

**Кратко:** Основное хранилище данных — содержит значения полей всех бран, строки и массивы.

**Тип:** `GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST`
**Формат:** `Uint32Array`
**Размер:** `heapSize × 4` байта (динамически вычисляется + резерв для ARRAY)
**BindGroup Binding:** `1`

**Назначение:** Хранит данные всех бран (params, строки, массивы).

**Структура блока браны:**

```text
┌────────────────────────────────────────────────────────────────┐
│ Brane Block (heap[block_ptr ... block_ptr + blockSize])        │
├────────────────────────────────────────────────────────────────┤
│ HEADER                                                         │
├───────────────┬───────────────┬───────────────┬────────────────┤
│ local_count   │ entangled_cnt │ field_id[0]   │ packed_meta[0] │
│ (u32)         │ (u32)         │ (u32)         │ (u32)          │
├───────────────┴───────────────┴───────────────┴────────────────┤
│ field_id[1]   │ packed_meta[1]  │ ...                          │
│ (u32)         │ (u32)           │                              │
├────────────────────────────────────────────────────────────────┤
│ BODY                                                           │
├───────────────┬───────────────┬───────────────┬────────────────┤
│ entangled_ptr │ entangled_ptr │ value[0]      │ value[1]       │
│ (u32)         │ (u32)         │ (...)         │ (...)          │
└───────────────┴───────────────┴───────────────┴────────────────┘
```

**Формат packed_meta:**

```text
┌───────────┬───────────┬────────────────────────────┐
│ type      │ size      │ offset                     │
│ 8 бит     │ 8 бит     │ 16 бит                     │
│ [31:24]   │ [23:16]   │ [15:0]                     │
└───────────┴───────────┴────────────────────────────┘
```

**Распаковка:**

```typescript
const type = (packed_meta >>> 24) & 0xFF    // Тип поля
const size = (packed_meta >>> 16) & 0xFF    // Размер в словах
const offset = packed_meta & 0xFFFF         // Смещение в блоке
```

**Типы полей:**

| Код | Тип          | Размер    | Описание                     |
|:---:|:-------------|:----------|:-----------------------------|
| `0` | `FLOAT`      | 1 слово   | Число с плавающей точкой     |
| `1` | `UINT`       | 1 слово   | Целое число (enum)           |
| `2` | `BOOL`       | 1 слово   | Булево значение (0 или 1)    |
| `3` | `STRING`     | 2 слова   | `[string_id, hash]`          |
| `4` | `ARRAY`      | 2 слова   | `[heap_offset, reserved]`    |

**Пример блока с 2 полями:**

```text
heap[offset]:

 0: 2           ← local_field_count = 2
 1: 0           ← entangled_count = 0
 2: 0           ← field_id = 0 (hp)
 3: 0x00010004  ← packed_meta: type=FLOAT(0), size=1, offset=4
 4: 100.0       ← value: hp = 100.0 (битовое представление)
 5: 1           ← field_id = 1 (active)
 6: 0x00020005  ← packed_meta: type=BOOL(2), size=1, offset=5
 7: 1           ← value: active = true
```

**Строка в heap (STRING_PTR):**

```text
┌───────────────┬───────────────┐
│ string_id     │ hash          │
│ (u32)         │ (u32)         │
└───────────────┴───────────────┘
```

**Массив в heap (ARRAY_PTR):**

```text
┌───────────────┬───────────────┬───────────────┬────────────┐
│ length        │ element[0]    │ element[1]    │ ...        │
│ (u32)         │ (u32)         │ (u32)         │ (u32)      │
└───────────────┴───────────────┴───────────────┴────────────┘
```

**⚠️ Важно:** Данные массивов хранятся во временной зоне heap и **очищаются после каждого `update()`**.

---

### 3. states

**Кратко:** Текущие состояния всех бран — индексы состояний.

**Тип:** `GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC`
**Формат:** `Uint32Array`
**Размер:** `braneCount × 4` байта
**BindGroup Binding:** `2`

**Назначение:** Текущие состояния бран.

**Структура:**

```text
┌───────────────┬───────────────┬───────────────┬────────────┐
│ state[0]      │ state[1]      │ state[2]      │ ...        │
│ (u32)         │ (u32)         │ (u32)         │ (u32)      │
└───────────────┴───────────────┴───────────────┴────────────┘
```

**Пример:**

```typescript
// 3 браны в состояниях 0, 1, 2
states = new Uint32Array([0, 1, 2])
```

---

### 4. newStates

**Кратко:** Буфер для записи новых состояний после шага эволюции (compute pass).

**Тип:** `GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC`
**Формат:** `Uint32Array`
**Размер:** `braneCount × 4` байта
**BindGroup Binding:** `3`

**Назначение:** Новые состояния после шага эволюции (compute pass).

**Процесс обновления:**

```text
1. Compute Shader пишет в newStates
2. GPU: copy(newStates → states)
3. CPU: read(states) через stagingBuffer
```

---

### 5. bytecode

**Кратко:** Скомпилированные правила переходов — программа для VM на GPU.

**Тип:** `GPUBufferUsage.STORAGE`
**Формат:** `Uint32Array`
**Размер:** `totalBytecodeLength × 4` байта
**BindGroup Binding:** `4`

**Назначение:** Скомпилированные правила переходов (VM-код).

**Структура bytecode:**

```text
┌─────────────────────────────────────────────────────────────────┐
│ Bytecode для одной суперпозиции                                 │
├─────────────────────────────────────────────────────────────────┤
│ STATE TABLE                                                     │
├──────────────┬──────────────┬──────────────┬────────────────────┤
│ state_ptr[0] │ state_ptr[1] │ state_ptr[2] │ ...                │
│ (u32)        │ (u32)        │ (u32)        │ (u32)              │
├─────────────────────────────────────────────────────────────────┤
│ STATE BLOCKS                                                    │
├──────────────┬──────────────┬──────────────┬────────────────────┤
│ tr_count     │ target[0]    │ cond_ptr[0]  │ target[1]...       │
│ (u32)        │ (u32)        │ (u32)        │ (u32)              │
├─────────────────────────────────────────────────────────────────┤
│ CONDITION BLOCKS                                                │
├──────────────┬──────────────┬───────────────┬───────────────────┤
│ cond_count   │ type         │ field_id      │ op                │
│ (u32)        │ (u32)        │ (u32)         │ (u32)             │
├──────────────┴──────────────┴───────────────┴───────────────────┤
│ val_encoded  │ type         │ field_id      │ op                │
│ (u32)        │ (u32)        │ (u32)         │ (u32)             │
├──────────────┴──────────────┴───────────────┴───────────────────┤
│ val_encoded  │ ...                                              │
│ (u32)        │                                                  │
├─────────────────────────────────────────────────────────────────┤
│ HEAP (для IN/NOT_IN)                                            │
├──────────────┬──────────────┬──────────────┬────────────────────┤
│ item_count   │ item[0]      │ item[1]      │ ...                │
│ (u32)        │ (u32)        │ (u32)        │ (u32)              │
└──────────────┴──────────────┴──────────────┴────────────────────┘
```

**Формат инструкции условия (4 слова):**

```text
┌──────────────┬──────────────┬──────────────┬──────────────┐
│ type         │ field_id     │ op           │ val_encoded  │
│ (u32)        │ (u32)        │ (u32)        │ (u32)        │
└──────────────┴──────────────┴──────────────┴──────────────┘
```

**Операторы (OP):**

| Код  | Оператор      | Описание                       |
|:----:|:--------------|:-------------------------------|
| `0`  | `EQ`          | Равно (`==`)                   |
| `1`  | `NEQ`         | Не равно (`!=`)                |
| `2`  | `GT`          | Больше (`>`)                   |
| `3`  | `LT`          | Меньше (`<`)                   |
| `4`  | `GTE`         | Больше или равно (`>=`)        |
| `5`  | `LTE`         | Меньше или равно (`<=`)        |
| `6`  | `IN`          | Входит в список                |
| `7`  | `NOT_IN`      | Не входит в список             |
| `8`  | `INCLUDE`     | Массив содержит элемент        |
| `9`  | `NOT_INCLUDE` | Массив не содержит элемент     |
| `10` | `LENGTH`      | Длина массива                  |
| `11` | `IS_EMPTY`    | Массив пуст                    |

**Пример bytecode:**

```typescript
// Переход из состояния 0 → 1 при hp > 50
bytecode = new Uint32Array([
  // State Table (offset 0)
  4,              // state_ptr[0] = 4 (смещение блока состояния 0)
  20,             // state_ptr[1] = 20 (смещение блока состояния 1)

  // State Block для состояния 0 (offset 4)
  1,              // tr_count = 1
  1,              // target = 1 (состояние 1)
  8,              // cond_ptr = 8 (смещение условий)

  // Condition Block (offset 8)
  1,              // cond_count = 1
  0,              // type = FLOAT
  0,              // field_id = 0 (hp)
  2,              // op = GT
  0x42480000,     // val_encoded = 50.0 (bitcast)
])
```

---

### 6. uniforms

**Кратко:** Параметры для шейдера — количество бран для обработки.

**Тип:** `GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST`
**Формат:** `Uint32Array`
**Размер:** `16` байт (4 × u32)
**BindGroup Binding:** `5`

**Структура:**

```text
┌──────────────┬──────────────┬──────────────┬──────────────┐
│ braneCount   │ _pad0        │ _pad1        │ _pad2        │
│ (u32)        │ (u32)        │ (u32)        │ (u32)        │
└──────────────┴──────────────┴──────────────┴──────────────┘
```

**Описание:**

| Поле         | Тип   | Описание                             |
|:-------------|:------|:-------------------------------------|
| `braneCount` | `u32` | Количество бран для обработки        |
| `_pad0`      | `u32` | Padding для выравнивания до 16 байт  |
| `_pad1`      | `u32` | Padding для выравнивания до 16 байт  |
| `_pad2`      | `u32` | Padding для выравнивания до 16 байт  |

---

### 7. bytecodeOffsets

**Кратко:** Таблица смещений bytecode для каждой браны.

**Тип:** `GPUBufferUsage.STORAGE`
**Формат:** `Uint32Array`
**Размер:** `braneCount × 4` байта
**BindGroup Binding:** `6`

**Назначение:** Смещения bytecode для каждой браны.

**Структура:**

```text
┌──────────────┬──────────────┬──────────────┬──────────────┐
│ offset[0]    │ offset[1]    │ offset[2]    │ ...          │
│ (u32)        │ (u32)        │ (u32)        │ (u32)        │
└──────────────┴──────────────┴──────────────┴──────────────┘
```

---

### 8. stringRegistry

**Кратко:** Таблица метаданных строк — хранит указатели, длины и хэши всех интернированных строк.

**Тип:** `GPUBufferUsage.STORAGE`
**Формат:** `Uint32Array`
**Размер:** `stringCount × 3 × 4` байта
**BindGroup Binding:** `7`

**Назначение:** Таблица метаданных строк (StringAtlas).

**Структура:**

```text
┌──────────────┬──────────────┬──────────────┬──────────────┐
│ ptr[0]       │ len[0]       │ hash[0]      │ ptr[1]       │
│ (u32)        │ (u32)        │ (u32)        │ (u32)        │
├──────────────┴──────────────┴──────────────┴──────────────┤
│ len[1]       │ hash[1]      │ ...                         │
│ (u32)        │ (u32)        │                             │
└───────────────────────────────────────────────────────────┘
```

**Описание:**

| Поле     | Тип   | Описание                      |
|:---------|:------|:------------------------------|
| `ptr[i]` | `u32` | Смещение строки в `stringHeap`|
| `len[i]` | `u32` | Длина строки в кодовых точках |
| `hash[i]`| `u32` | FNV-1a хэш строки             |

---

### 9. stringHeap

**Кратко:** Хранилище данных строк — UTF-32 кодовые точки всех интернированных строк.

**Тип:** `GPUBufferUsage.STORAGE`
**Формат:** `Uint32Array`
**Размер:** `totalCodePoints × 4` байта
**BindGroup Binding:** `8`

**Назначение:** Хранит данные строк (UTF-32).

**Структура:**

```text
┌──────────────┬──────────────┬──────────────┬──────────────┐
│ codepoint[0] │ codepoint[1] │ codepoint[2] │ ...          │
│ (u32)        │ (u32)        │ (u32)        │ (u32)        │
└──────────────┴──────────────┴──────────────┴──────────────┘
```

**⚠️ Важно:** StringAtlas использует UTF-32 (не UTF-8), что обеспечивает:

- Прямой доступ по индексу: `string_heap[ptr + i]`
- Отсутствие thread divergence при сравнении
- Предсказуемую производительность на GPU

---

### 10. stagingBuffer

**Кратко:** Буфер для чтения данных из GPU в CPU.

**Тип:** `GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST`
**Формат:** `Uint32Array`
**Размер:** `braneCount × 4` байта
**CPU-доступ:** Да (только чтение)

**Назначение:** Readback состояний из GPU в CPU.

**Процесс чтения:**

```text
1. GPU: copy(states → stagingBuffer)
2. CPU: mapAsync(stagingBuffer)
3. CPU: read(stagingBuffer.getMappedRange())
4. CPU: unmap(stagingBuffer)
```

---

## 🔄 Поток данных

### Инициализация (write)

```text
┌─────────────────────────────────────────────────────────┐
│ matrix.write(data)                                      │
├─────────────────────────────────────────────────────────┤
│ 1. validateData(data)                                   │
│    └─→ Проверка полей и бран                            │
│                                                         │
│ 2. prepareData(data)                                    │
│    ├─→ findEntangledGroups()                             │
│    ├─→ compileEnsemble() → bytecode                     │
│    ├─→ buildHeap() → heap                               │
│    └─→ getStringAtlas().intern() → stringRegistry/Heap  │
│                                                         │
│ 3. GPUBackend.init()                                    │
│    ├─→ Создание GPU-буферов                             │
│    └─→ Запись данных в VRAM                             │
└─────────────────────────────────────────────────────────┘
```

### Шаг эволюции (update)

```text
┌─────────────────────────────────────────────────────────┐
│ matrix.update(braneIndex, fieldIndex, value)             │
├─────────────────────────────────────────────────────────┤
│ 1. encodeFieldUpdate(value, field)                       │
│    ├─→ Для STRING: atlas.intern()                       │
│    └─→ Для ARRAY: аллокация в heap (временная)          │
│                                                         │
│ 2. writeValueToHeap()                                   │
│    └─→ Обновление heap[fieldOffset]                      │
│                                                         │
│ 3. GPUBackend.updateHeap()                              │
│    └─→ writeBuffer(heap)                                │
│                                                         │
│ 4. GPUBackend.run()                                     │
│    ├─→ dispatchWorkgroups()                             │
│    │   └─→ evolution.wgsl: main()                       │
│    │       ├─→ Чтение states[i]                         │
│    │       ├─→ Чтение heap[block_ptr]                   │
│    │       ├─→ Выполнение bytecode                      │
│    │       └─→ Запись newStates[i]                      │
│    └─→ copy(newStates → states)                         │
│                                                         │
│ 5. GPUBackend.read()                                    │
│    └─→ return states                                    │
│                                                         │
│ 6. Сброс heapAllocOffset                                │
│    └─→ heapAllocOffset = heap.length - arrayReserveSize │
└─────────────────────────────────────────────────────────┘
```

### Чтение состояний

```text
┌─────────────────────────────────────────────────────────┐
│ GPUBackend.read()                                       │
├─────────────────────────────────────────────────────────┤
│ 1. copy(states → stagingBuffer)                         │
│ 2. mapAsync(stagingBuffer)                              │
│ 3. read(stagingBuffer.getMappedRange())                 │
│ 4. unmap(stagingBuffer)                                 │
│ 5. return Uint32Array                                   │
└─────────────────────────────────────────────────────────┘
```

---

## 📦 Пример: Конфигурация для 2 бран

**Входные данные:**

```typescript
await write({
  fields: [
    { type: FieldType.F32 },  // 0: hp
    { type: FieldType.BOOL }, // 1: active
  ],
  branes: [
    {
      params: [[0, 100], [1, true]],
      state: 0,
      collapses: [
        [[1, { 0: { gt: 50 } }]],  // Из 0 → 1 при hp > 50
        [null],                     // Терминальное состояние
      ],
    },
    {
      params: [[0, 30], [1, false]],
      state: 0,
      collapses: [
        [[1, { 0: { gt: 50 } }]],
        [null],
      ],
    },
  ],
})
```

**GPU-буферы после инициализации:**

```text
braneDescriptors (16 байт):
┌──────┬──────┬──────┬──────┐
│  1   │  0   │ 20   │ 32   │
└──────┴──────┴──────┴──────┘
  │      │      │      │
  │      │      │      └───── bytecode offset для brane 1
  │      │      └──────────── block_ptr для brane 1
  │      └─────────────────── bytecode offset для brane 0
  └────────────────────────── block_ptr для brane 0

heap (динамический размер + резерв для ARRAY):
┌──────┬──────┬──────┬────────┬──────┬──────┬────────┬──────┐
│  2   │  0   │  0   │ 0x000  │ 100  │  1   │ 0x020  │  1   │
│      │      │      │ 104    │      │      │ 005    │      │
└──────┴──────┴──────┴────────┴──────┴──────┴────────┴──────┘
  │      │      │      │        │      │      │      │
  │      │      │      │        │      │      │      └───── active = true
  │      │      │      │        │      │      └──────────── packed_meta: BOOL
  │      │      │      │        │      └─────────────────── field_id = 1
  │      │      │      │        └────────────────────────── hp = 100.0
  │      │      │      └─────────────────────────────────── packed_meta: F32
  │      │      └────────────────────────────────────────── field_id = 0
  │      └───────────────────────────────────────────────── entangled_count = 0
  └──────────────────────────────────────────────────────── local_count = 2

states (8 байт):
┌──────┬──────┐
│  0   │  0   │
└──────┴──────┘
  │      │
  │      └───── brane 1: state = 0
  └──────────── brane 0: state = 0

bytecode (48 байт):
┌──────┬──────┬──────┬──────┬──────┬──────┬──────┬──────┐
│  4   │ 20   │  1   │  1   │  8   │  1   │  0   │  0   │
└──────┴──────┴──────┴──────┴──────┴──────┴──────┴──────┘
  │      │      │      │      │      │      │      │
  │      │      │      │      │      │      │      └──── field_id = 0
  │      │      │      │      │      │      └──────────── type = F32
  │      │      │      │      │      └─────────────────── cond_count = 1
  │      │      │      │      └────────────────────────── cond_ptr = 8
  │      │      │      └───────────────────────────────── target = 1
  │      │      └──────────────────────────────────────── tr_count = 1
  │      └─────────────────────────────────────────────── state_ptr[1] = 20
  └────────────────────────────────────────────────────── state_ptr[0] = 4

uniforms (16 байт):
┌──────┬──────┬──────┬──────┐
│  2   │  0   │  0   │  0   │
└──────┴──────┴──────┴──────┘
  │
  └────────────────────────── braneCount = 2
```

---

## 🛠️ Утилиты для отладки

Утилиты доступны в модуле [`debug.ts`](./debug.ts).

### Подключение

```typescript
import { dumpHeap, dumpBytecode, dumpStringAtlas, dumpMatrix } from "./debug"
```

### Дамп heap

```typescript
import { dumpHeap } from "./debug"

const blockPtr = braneBlockPtrs[0]!
dumpHeap(heap, blockPtr)

// Вывод:
// Block @ 1, local=2, entangled=0
//   Field 0: type=0(FLOAT), size=1, offset=4
//   Field 1: type=2(BOOL), size=1, offset=5
```

### Дамп bytecode

```typescript
import { dumpBytecode } from "./debug"

const offset = bytecodeOffsets[0]!
dumpBytecode(bytecode, offset)

// Вывод:
// Bytecode @ 0
//   State table size: 2
//   State 0: ptr=4
//     transitions=1
//     Transition 0: target=1, cond_ptr=8
//       conditions=1
//         Cond 0: type=0(FLOAT), field=0, op=2(GT), val=50
```

### Дамп StringAtlas

```typescript
import { dumpStringAtlas } from "./debug"
import { getStringAtlas } from "./StringAtlas"

const atlas = getStringAtlas()
dumpStringAtlas(atlas)

// Вывод:
// StringAtlas: 3 strings
//   [0] "hero" (len=4, hash=0x1a2b3c4d)
//   [1] "monster" (len=7, hash=0x5e6f7a8b)
```

### Полный дамп Matrix

```typescript
import { dumpMatrix } from "./debug"
import { write } from "./index"

await write({
  fields: [...],
  branes: [...],
})

// Дамп всех буферов
await dumpMatrix(heap, bytecode, bytecodeOffsets, braneBlockPtrs)

// Вывод:
// === MATRIX DEBUG DUMP ===
// 
// Branes: 2
// 
// === BRANE 0 ===
// --- HEAP BLOCK ---
// Block @ 1, local=2, entangled=0
//   Field 0: type=0(FLOAT), size=1, offset=4
// ...
```

---

## 📖 Связанные документы

- [`index.ts`](./index.ts) — Основное API matrix
- [`gpu/Backend.ts`](./gpu/Backend.ts) — GPU драйвер
- [`gpu/evolution.wgsl`](./gpu/evolution.wgsl) — WGSL шейдер эволюции
- [`StringAtlas.ts`](./StringAtlas.ts) — Система интернирования строк
- [`heap.ts`](./heap.ts) — Управление heap памятью
- [`superposition.ts`](./superposition.ts) — Компиляция bytecode
- [`debug.ts`](./debug.ts) — Утилиты для отладки
