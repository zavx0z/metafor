# 🗂️ Структура буферов Matrix

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
│      read_write                                               │
│  ┌──────────────────┐  ┌──────────────────┐  ┌─────────────┐  │
│  │    bytecode      │  │    uniforms      │  │ dirtyFlags  │  │
│  │   (Storage)      │  │   (Uniform)      │  │  (Storage)  │  │
│  └──────────────────┘  └──────────────────┘  └─────────────┘  │
│                                               atomic<u32>     │
│  ┌──────────────────┐  ┌──────────────────┐                   │
│  │ stringRegistry   │  │   stringHeap     │                   │
│  │   (Storage)      │  │   (Storage)      │                   │
│  └──────────────────┘  └──────────────────┘                   │
│                                                               │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │              stagingBuffer (2× braneCount)               │ │
│  │              (MAP_READ | COPY_DST)                       │ │
│  └──────────────────────────────────────────────────────────┘ │
│     [dirtyFlags copy][         states copy        ]           │
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

**Тип:** `GPUBufferUsage.STORAGE \| GPUBufferUsage.COPY_DST`
**Формат:** `Uint32Array`
**Размер:** `heapSize × 4` байта (динамически вычисляется + резерв для ARRAY)
**BindGroup Binding:** `1`

**Назначение:** Хранит данные всех бран (значения, строки, массивы).

**Структура блока браны:**

```text
┌────────────────────────────────────────────────────────────────┐
│ Brane Block (heap[block_ptr ... block_ptr + blockSize])        │
├────────────────────────────────────────────────────────────────┤
│ HEADER                                                         │
├───────────────┬───────────────┬──────────┬─────────────────────┤
│ local_count   │ entangled_cnt │ lock     │ field_idx[0]        │
│ (u32)         │ (u32)         │ (u32)    │ (u32)               │
├───────────────┴───────────────┴──────────┴─────────────────────┤
│ packed_meta[0]  │ field_idx[1]  │ packed_meta[1]  │ ...        │
│ (u32)           │ (u32)         │ (u32)           │            │
├────────────────────────────────────────────────────────────────┤
│ BODY                                                           │
├───────────────┬───────────────┬───────────────┬────────────────┤
│ entangled_ptr │ entangled_ptr │ value[0]      │ value[1]       │
│ (u32)         │ (u32)         │ (...)         │ (...)          │
└───────────────┴───────────────┴───────────────┴────────────────┘
```

**Заголовок блока:**

| Слово | Поле | Описание |
| ----- | ---- | -------- |
| 0 | `local_count` | Количество локальных полей |
| 1 | `entangled_count` | Количество ссылок на entangled блоки |
| 2 | `lock` | Флаг блокировки переходов (0 = разблокирована, 1 = заблокирована) |

**Примечание:** Флаг `lock` управляется третьим элементом кортежа в `update()` (`[braneIndex, fieldUpdates, lock?]`). Значение `true` устанавливает `lock = 1`, `false` — `lock = 0`, `undefined` — не меняет текущее состояние lock.

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
 2: 0           ← lock = 0 (разблокирована)
 3: 0           ← field_idx = 0 (hp)
 4: 0x00010004  ← packed_meta: type=FLOAT(0), size=1, offset=4
 5: 100.0       ← value: hp = 100.0 (битовое представление)
 6: 1           ← field_idx = 1 (active)
 7: 0x00020005  ← packed_meta: type=BOOL(2), size=1, offset=5
 8: 1           ← value: active = true
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

**Тип:** `GPUBufferUsage.STORAGE \| GPUBufferUsage.COPY_DST \| GPUBufferUsage.COPY_SRC`
**Режим доступа WGSL:** `var<storage, read_write>`
**Формат:** `Uint32Array`
**Размер:** `braneCount × 4` байта
**BindGroup Binding:** `2`

**Назначение:** Текущие состояния бран. **Обновляется in-place** напрямую из compute shader.

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

**Режим доступа:** `var<storage, read_write>` (in-place обновление).

---

### 4. bytecode

**Кратко:** Скомпилированные правила переходов — программа для VM на GPU.

**Тип:** `GPUBufferUsage.STORAGE`
**Формат:** `Uint32Array`
**Размер:** `totalBytecodeLength × 4` байта
**BindGroup Binding:** `3`

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
│ cond_count   │ type         │ field_idx      │ op                │
│ (u32)        │ (u32)        │ (u32)         │ (u32)             │
├──────────────┴──────────────┴───────────────┴───────────────────┤
│ val_encoded  │ type         │ field_idx      │ op                │
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
│ type         │ field_idx     │ op           │ val_encoded  │
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
  0,              // field_idx = 0 (hp)
  2,              // op = GT
  0x42480000,     // val_encoded = 50.0 (bitcast)
])
```

---

### 5. uniforms

**Кратко:** Параметры для шейдера — количество бран для обработки.

**Тип:** `GPUBufferUsage.UNIFORM \| GPUBufferUsage.COPY_DST`
**Формат:** `Uint32Array`
**Размер:** `16` байт (4 × u32)
**BindGroup Binding:** `4`

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

### 6. bytecodeOffsets

**Кратко:** Таблица смещений bytecode для каждой браны.

**Тип:** `GPUBufferUsage.STORAGE`
**Формат:** `Uint32Array`
**Размер:** `braneCount × 4` байта
**BindGroup Binding:** `5`

**Назначение:** Смещения bytecode для каждой браны.

**Структура:**

```text
┌──────────────┬──────────────┬──────────────┬──────────────┐
│ offset[0]    │ offset[1]    │ offset[2]    │ ...          │
│ (u32)        │ (u32)        │ (u32)        │ (u32)        │
└──────────────┴──────────────┴──────────────┴──────────────┘
```

---

### 7. stringRegistry

**Кратко:** Таблица метаданных строк — хранит указатели, длины и хэши всех интернированных строк.

**Тип:** `GPUBufferUsage.STORAGE`
**Формат:** `Uint32Array`
**Размер:** `stringCount × 3 × 4` байта
**BindGroup Binding:** `6`

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

### 8. stringHeap

**Кратко:** Хранилище данных строк — UTF-32 кодовые точки всех интернированных строк.

**Тип:** `GPUBufferUsage.STORAGE`
**Формат:** `Uint32Array`
**Размер:** `totalCodePoints × 4` байта
**BindGroup Binding:** `7`

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

### 9. dirtyFlags

**Кратко:** Атомарные флаги изменений — отслеживает какие браны изменили состояние.

**Тип:** `GPUBufferUsage.STORAGE \| GPUBufferUsage.COPY_SRC \| GPUBufferUsage.COPY_DST`
**Формат:** `array<atomic<u32>>` (WGSL) / `Uint32Array` (CPU)
**Размер:** `braneCount × 4` байта (1 u32 на брану)
**BindGroup Binding:** `8`

**Назначение:** Атомарная установка флага при изменении состояния браны.

**WGSL объявление:**

```wgsl
@group(0) @binding(8)
var<storage, read_write> dirty_flags: array<atomic<u32>>;
```

**Использование в шейдере:**

```wgsl
// В main() после вычисления next_state:
states[idx] = next_state;  // In-place запись

if (next_state != current_state) {
    atomicStore(&dirty_flags[idx], 1u);  // Установка флага
}
```

**Процесс сброса (перед compute pass):**

```typescript
// В GPUBackend.run():
const cmd = this.device.createCommandEncoder()
cmd.clearBuffer(this.buffers.dirtyFlags, 0, this.buffers.dirtyFlags.size)
```

**Чтение флагов (в readChanges):**

```typescript
// Копируем dirtyFlags в stagingBuffer
cmd.copyBufferToBuffer(
    this.buffers.dirtyFlags, 0,
    this.stagingBuffer, 0,
    braneCount * 4
)
```

**Преимущества:**

| Метрика | Значение |
| ------- | -------- |
| Размер на брану | 4 байта (1 u32) |
| overhead при 0% изменений | 0 (быстро копируется) |
| overhead при 100% изменений | 4 байта на брану |
| Экономия readback | 98% при 1% изменений |

---

### 10. stagingBuffer

**Кратко:** Буфер для чтения данных из GPU в CPU.

**Тип:** `GPUBufferUsage.MAP_READ \| GPUBufferUsage.COPY_DST`
**Формат:** `Uint32Array`
**Размер:** `braneCount × 8` байт (dirtyFlags + states)
**CPU-доступ:** Да (только чтение)

**Структура stagingBuffer:**

```text
┌──────────────────────────────────────────────────────────────┐
│ stagingBuffer (braneCount × 8 байт)                          │
├──────────────────────────────────────────────────────────────┤
│ [0 .. braneCount-1]        ← Копия dirtyFlags                │
│ [braneCount .. 2×count-1]  ← Копия states                    │
└──────────────────────────────────────────────────────────────┘
```

**Процесс чтения (readChanges):**

```text
1. GPU: copy(dirtyFlags → stagingBuffer[0:count])
2. GPU: copy(states → stagingBuffer[count:2×count])
3. CPU: mapAsync(stagingBuffer)
4. CPU: read(stagingBuffer.getMappedRange())
5. CPU: filter by dirtyFlags, return only changed
6. CPU: unmap(stagingBuffer)
```

**Пример:**

```typescript
async readChanges(): Promise<[number, number][]> {
    const braneCount = this.buffers.states.size / 4
    const cmd = this.device.createCommandEncoder()

    // Копируем dirtyFlags и states в stagingBuffer
    cmd.copyBufferToBuffer(this.buffers.dirtyFlags, 0, this.stagingBuffer, 0, braneCount * 4)
    cmd.copyBufferToBuffer(this.buffers.states, 0, this.stagingBuffer, braneCount * 4, braneCount * 4)

    this.device.queue.submit([cmd.finish()])

    await this.stagingBuffer.mapAsync(GPUMapMode.READ)
    const data = new Uint32Array(this.stagingBuffer.getMappedRange().slice(0))

    const dirtyFlags = data.slice(0, braneCount)
    const states = data.slice(braneCount, braneCount * 2)

    const changes: [number, number][] = []
    for (let i = 0; i < braneCount; i++) {
        if (dirtyFlags[i]) {
            changes.push([i, states[i]!])
        }
    }

    this.stagingBuffer.unmap()
    return changes  // Только изменённые состояния
}
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
│    ├─→ allocateHeap для ARRAY полей                     │
│    └─→ getStringAtlas().intern() → stringRegistry/Heap  │
│                                                         │
│ 3. GPUBackend.init()                                    │
│    ├─→ Создание GPU-буферов (10 шт)                     │
│    ├─→ dirtyFlags: 1 u32 на брану                       │
│    └─→ Запись данных в VRAM                             │
│                                                         │
│ 4. backend.readChanges()                                │
│    └─→ Чтение изменений после инициализации             │
│       (обычно пусто до первого update())               │
└─────────────────────────────────────────────────────────┘
```

### Шаг эволюции (update)

```text
┌─────────────────────────────────────────────────────────┐
│ matrix.update([[braneIndex, fieldUpdates, lock?], ...]) │
├─────────────────────────────────────────────────────────┤
│ 1. encodeFieldUpdate(value, field)                       │
│    ├─→ Для STRING: atlas.intern()                       │
│    └─→ Для ARRAY: аллокация в heap (временная)          │
│                                                         │
│ 2. writeValueToHeap()                                   │
│    └─→ Обновление heap[fieldOffset]                      │
│                                                         │
│ 3. Обновление lock-флагов (если lock передан в кортеже) │
│    └─→ heap[block_ptr + 2] = lock ? 1 : 0               │
│                                                         │
│ 4. GPUBackend.updateHeapFields()                        │
│    └─→ writeBuffer(heap, offset, data)                  │
│                                                         │
│ 5. GPUBackend.run()                                     │
│    ├─→ clearBuffer(dirtyFlags) ← Сброс флагов           │
│    ├─→ dispatchWorkgroups()                             │
│    │   └─→ evolution.wgsl: main()                       │
│    │       ├─→ Проверка lock: heap[block_ptr + 2]       │
│    │       ├─→ Если lock == 1: сброс в 0, return        │
│    │       ├─→ Чтение states[idx]                       │
│    │       ├─→ Чтение heap[block_ptr]                   │
│    │       ├─→ Выполнение bytecode                      │
│    │       ├─→ Запись states[idx] = next_state          │
│    │       └─→ atomicStore(&dirty_flags[idx], 1u)        │
│    └─→ НЕТ копирования (in-place обновление)            │
│                                                         │
│ 6. GPUBackend.readChanges()                             │
│    ├─→ copy(dirtyFlags → stagingBuffer)                 │
│    ├─→ copy(states → stagingBuffer)                     │
│    ├─→ mapAsync(stagingBuffer)                          │
│    ├─→ Filter by dirtyFlags                             │
│    └─→ return [[braneIndex, newState], ...]             │
│                                                         │
│ 7. Сброс heapAllocOffset                                │
│    └─→ heapAllocOffset = heap.length - arrayReserveSize │
│    └─→ arrayDataInvalidated = true                      │
└─────────────────────────────────────────────────────────┘
```

### Чтение изменённых состояний (readChanges)

```text
┌─────────────────────────────────────────────────────────┐
│ GPUBackend.readChanges()                                │
├─────────────────────────────────────────────────────────┤
│ 1. copy(dirtyFlags → stagingBuffer[0:count])            │
│ 2. copy(states → stagingBuffer[count:2×count])          │
│ 3. mapAsync(stagingBuffer)                              │
│ 4. dirtyFlags = data.slice(0, count)                    │
│ 5. states = data.slice(count, 2×count)                  │
│ 6. changes = []                                         │
│    for i in 0..count:                                   │
│      if dirtyFlags[i]:                                  │
│        changes.push([i, states[i]])                     │
│ 7. unmap(stagingBuffer)                                 │
│ 8. return changes  // Только изменённые                 │
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

**GPU-буферы после инициализации (до runtime-step):**

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
  │      │      │      │        │      │        │       │
  │      │      │      │        │      │        │       └── active = true
  │      │      │      │        │      │        └────────── packed_meta: BOOL
  │      │      │      │        │      └─────────────────── field_idx = 1
  │      │      │      │        └────────────────────────── hp = 100.0
  │      │      │      └─────────────────────────────────── packed_meta: F32
  │      │      └────────────────────────────────────────── field_idx = 0
  │      └───────────────────────────────────────────────── entangled_count = 0
  └──────────────────────────────────────────────────────── local_count = 2

states (8 байт):
┌──────┬──────┐
│  0   │  0   │
└──────┴──────┘
  │      │
  │      └───── brane 1: state = 0
  └──────────── brane 0: state = 0

dirtyFlags (8 байт) — после write():
┌──────┬──────┐
│  0   │  0   │  ← runtime-шаг ещё не выполнялся
└──────┴──────┘

bytecode (48 байт):
┌──────┬──────┬──────┬──────┬──────┬──────┬──────┬──────┐
│  4   │ 20   │  1   │  1   │  8   │  1   │  0   │  0   │
└──────┴──────┴──────┴──────┴──────┴──────┴──────┴──────┘
  │      │      │      │      │      │      │      │
  │      │      │      │      │      │      │      └──── field_idx = 0
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

stagingBuffer (16 байт) — после readChanges() в write():
┌──────┬──────┬──────┬──────┐
│  0   │  0   │  0   │  0   │
└──────┴──────┴──────┴──────┘
  │      │      │      │
  │      │      │      └───── states[1] = 0
  │      │      └──────────── states[0] = 0
  │      └─────────────────── dirtyFlags[1] = 0
  └────────────────────────── dirtyFlags[0] = 0

readChanges() в write() обычно возвращает: []  // До первого update()
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

### Дамп dirtyFlags

```typescript
import { GPU } from "./device"

const device = GPU._device
const dirtyFlags = await device.queue.readBuffer(backend.buffers.dirtyFlags)
console.log("Dirty flags:", new Uint32Array(dirtyFlags))

// Вывод:
// Dirty flags: [1, 0, 0, 1, 0, ...]
//   Браны 0 и 3 изменили состояние
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

## 🔒 Блокировка переходов

Механизм временной остановки FSM для отдельных бран без блокировки обновления полей.

### Принцип работы

1. **Установка/снятие флага:** В `update()` третье значение кортежа управляет lock для конкретной браны: `true` → `lock = 1`, `false` → `lock = 0`, `undefined` → lock не меняется.

2. **Проверка в шейдере:** `evolution.wgsl` проверяет флаг в начале `main()`:

   ```wgsl
   let lock = heap_safe(block_ptr + 2u);
   if (lock == 1u) {
       heap[block_ptr + 2u] = 0u;  // Сброс флага
       return;  // Пропустить переходы
   }
   ```

3. **Автосброс:** Флаг сбрасывается в `0` автоматически после выполнения шейдера.

### API

```typescript
// Заблокировать одну брану
await update([
  [0, [[0, 100]], true],
])

// Разблокировать эту же брану
await update([
  [0, [], false],
])

// Оставить lock без изменений (третий элемент не передаём)
await update([
  [0, [[0, 50]]],
])
```

### Применение

| Сценарий | Описание |
| -------- | -------- |
| **Отладка** | Зафиксировать состояние и менять поля по одному |
| **Пауза эволюции** | Временная остановка FSM для отдельных бран |
| **Контроль времени** | Применять переходы только в определённые моменты |

---

## 📖 Связанные документы

- [`index.ts`](./index.ts) — Основное API matrix
- [`gpu/Backend.ts`](./gpu/Backend.ts) — GPU драйвер
- [`gpu/evolution.wgsl`](./gpu/evolution.wgsl) — WGSL шейдер эволюции
- [`StringAtlas.ts`](./StringAtlas.ts) — Система интернирования строк
- [`heap.ts`](./heap.ts) — Управление heap памятью
- [`superposition.ts`](./superposition.ts) — Компиляция bytecode
- [`debug.ts`](./debug.ts) — Утилиты для отладки
- [`params.ts`](./params.ts) — Кодирование значений для GPU

---
