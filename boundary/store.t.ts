/**
 * Типы для @boundary/boundary/store.
 *
 * @packageDocumentation
 */

/**
 * Данные общего хранилища (без методов).
 *
 * Используется для передачи состояния в `boundary$.restore()`.
 */
export interface BoundaryData {
  /**
   * Скомпилированные правила переходов между состояниями (FSM bytecode).
   *
   * Плоский массив инструкций для виртуальной машины на GPU.
   * Каждая инструкция — 4 слова u32: операция, поле, тип проверки, значение/цель.
   *
   * Индексация: `bytecode[bytecodeOffsets[braneIndex]...]` — инструкции для конкретной браны.
   *
   * ## Кто использует
   *
   * | Пакет | Что делает |
   * |-------|------------|
   * | `@boundary/fields`/`prepare()` → `compileEnsemble()` | Компилирует правила в bytecode |
   * | `@boundary/fields`/`write()` | Сохраняет через `boundary$.restore()` |
   * | `@boundary/matrix` | Загружает в GPU buffer при инициализации |
   */
  bytecode: Uint32Array

  /**
   * Смещения начала bytecode для каждой браны.
   *
   * Индекс массива = индекс браны.
   * Значение = позиция в массиве bytecode где начинаются инструкции этой браны.
   *
   * Нужно для построения `braneDescriptors` при инициализации GPU.
   *
   * ## Кто использует
   *
   * | Пакет | Что делает |
   * |-------|------------|
   * | `@boundary/fields`/`compileEnsemble()` | Вычисляет смещения для каждой браны |
   * | `@boundary/fields`/`write()` | Сохраняет через `boundary$.restore()` |
   * | `@boundary/matrix` | Использует для построения `braneDescriptors` |
   */
  bytecodeOffsets: Uint32Array

  /**
   * Начальные состояния для каждой браны после write().
   *
   * Индекс массива = индекс браны.
   * Значение = индекс начального состояния в state map этой браны.
   *
   * ## Кто использует
   *
   * | Пакет | Что делает |
   * |-------|------------|
   * | `@boundary/fields`/`prepareData()` | Вычисляет начальные состояния |
   * | `@boundary/fields`/`write()` | Сохраняет через `boundary$.restore()` |
   * | `@boundary/matrix` | Загружает в GPU buffer состояний |
   */
  initialStates: Uint32Array

  /**
   * Данные кучи (heap) для GPU.
   *
   * Плоский массив u32 содержащий:
   * - Заголовки блоков бран (`local_count`, `entangled_count`, `lock`)
   * - Значения полей бран
   * - Ссылки на entangled блоки
   * - Данные STRING и ARRAY полей
   *
   * ## Кто использует
   *
   * | Пакет | Что делает |
   * |-------|------------|
   * | `@boundary/fields`/`prepareData()` → `buildHeap()` | Строит heap из входных данных |
   * | `@boundary/fields`/`write()` | Сохраняет через `boundary$.restore()` |
   * | `@boundary/matrix` | Загружает в GPU buffer |
   * | `@boundary/monad` | Читает напрямую из `boundary$` для unlock() |
   */
  heap: Uint32Array

  /**
   * Смещения блоков бран в heap.
   *
   * Индекс массива = индекс браны.
   * Значение = позиция в heap где начинается блок этой браны.
   *
   * ## Кто использует
   *
   * | Пакет | Что делает |
   * |-------|------------|
   * | `@boundary/fields`/`prepareData()` → `buildHeap()` | Вычисляет смещения |
   * | `@boundary/fields`/`write()` | Сохраняет через `boundary$.restore()` |
   * | `@boundary/matrix` | Использует для GPU операций |
   * | `@boundary/monad` | Использует для unlock() |
   */
  braneBlockPtrs: number[]
}

/**
 * Состояние общего хранилища `@boundary/boundary` с методами управления.
 *
 * Хранит данные, которые используют несколько пакетов внутри `@metafor/boundary`:
 * - {@link BoundaryData.bytecode | bytecode}, {@link BoundaryData.bytecodeOffsets | bytecodeOffsets}, {@link BoundaryData.initialStates | initialStates} — для инициализации GPU
 * - {@link BoundaryData.heap | heap}, {@link BoundaryData.braneBlockPtrs | braneBlockPtrs} — для update() и unlock()
 *
 * ## Какие данные здесь НЕ хранятся
 *
 * Данные, которые использует ТОЛЬКО один пакет (например `fields`, `heapAllocOffset`),
 * хранятся в локальном хранилище этого пакета.
 *
 * ## Жизненный цикл
 *
 * 1. **write()** — `@boundary/fields` заполняет через `boundary$.restore()`
 * 2. **update()** — `@boundary/fields` читает напрямую из `boundary$`
 * 3. **GPU инициализация** — `@boundary/matrix` загружает данные в буферы
 * 4. **unlock()** — `@boundary/monad` читает `braneBlockPtrs` для снятия блокировки
 */
export interface BoundaryStore extends BoundaryData {
  /**
   * Сбрасывает состояние хранилища.
   */
  reset(): void

  /**
   * Восстанавливает состояние хранилища из переданных данных.
   * @param state - Данные для восстановления
   */
  restore(state: BoundaryData): void
}
