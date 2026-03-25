/**
 * Compute-шейдер эволюции полей (v2 — с поддержкой STRING/ARRAY).
 *
 * Вычисляет переходы между состояниями суперпозиции на основе правил,
 * закодированных в байт-коде. Каждый поток GPU обрабатывает одно поле.
 *
 * **Терминология:**
 * - **Field (Поле)** — квантовое поле с браной и суперпозицией
 * - **Brane (Брана)** — данные поля в куче (heap)
 * - **Superposition** — граф возможных переходов между состояниями
 * - **State** — текущее наблюдаемое состояние поля
 *
 * **Формат Uniform-буфера:**
 * Структура занимает ровно 16 байт (4 × u32),
 * что соответствует минимальному требованию WebGPU для uniform buffers.
 * Padding-поля обязательны — GPU ожидает кратность 16 байтам.
 *
 * @see https://www.w3.org/TR/WGSL/#alignment-and-size
 */

// ============================================================================
// КОНСТАНТЫ
// ============================================================================
/** Размер uniform-буфера в u32 (16 байт / 4 = 4 слова). */
const UNIFORM_SIZE: u32 = 4u;

/** Размер workgroup для compute shader. */
const WORKGROUP_SIZE: u32 = 64u;

/** Padding для выравнивания uniform-буфера до 16 байт. */
const UNIFORM_PADDING: u32 = 3u;

// ============================================================================
// UNIFORM STRUCT
// ============================================================================
struct Uniforms {
  /**
   * Количество полей (field) в текущем батче.
   *
   * Используется в `main()` для защиты от out-of-bounds доступа:
   * compute-шейдер запускается с фиксированным числом workgroups,
   * и потоки с `id.x >= braneCount` досрочно завершаются.
   */
  braneCount: u32,
  /** Padding для выравнивания до 16 байт. Значение игнорируется GPU. */
  _pad0: u32,
  /** Padding для выравнивания до 16 байт. Значение игнорируется GPU. */
  _pad1: u32,
  /** Padding для выравнивания до 16 байт. Значение игнорируется GPU. */
  _pad2: u32,
}

@group(0) @binding(0)
var<storage, read> brane_block_ptrs: array<u32>;
@group(0) @binding(1)
var<storage, read_write> heap: array<u32>;
@group(0) @binding(2)
var<storage, read_write> states: array<u32>;  // ← read_write для in-place обновления
@group(0) @binding(3)
var<storage, read> bytecode: array<u32>;
@group(0) @binding(4)
var<uniform> u: Uniforms;
@group(0) @binding(5)
var<storage, read> bytecode_offsets: array<u32>;
@group(0) @binding(6)
var<storage, read> string_registry: array<u32>;
@group(0) @binding(7)
var<storage, read> string_heap: array<u32>;
@group(0) @binding(8)
var<storage, read_write> dirty_flags: array<atomic<u32>>;  // ← атомарные флаги изменений

// ============================================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ БЕЗОПАСНОГО ДОСТУПА
// ============================================================================

/**
 * Безопасный доступ к heap с проверкой границ.
 * Возвращает 0 при out-of-bounds доступе.
 */
fn heap_safe(index: u32) -> u32 {
  if (index >= arrayLength(&heap)) {
    return 0u;
  }
  return heap[index];
}

/**
 * Безопасный доступ к brane_block_ptrs с проверкой границ.
 */
fn brane_block_ptrs_safe(index: u32) -> u32 {
  if (index >= arrayLength(&brane_block_ptrs)) {
    return 0u;
  }
  return brane_block_ptrs[index];
}

/**
 * Безопасный доступ к string_registry с проверкой границ.
 */
fn string_registry_safe(index: u32) -> u32 {
  if (index >= arrayLength(&string_registry)) {
    return 0u;
  }
  return string_registry[index];
}

/**
 * Безопасный доступ к string_heap с проверкой границ.
 */
fn string_heap_safe(index: u32) -> u32 {
  if (index >= arrayLength(&string_heap)) {
    return 0u;
  }
  return string_heap[index];
}

/**
 * Безопасный доступ к bytecode с проверкой границ.
 */
fn bytecode_safe(index: u32) -> u32 {
  if (index >= arrayLength(&bytecode)) {
    return 0u;
  }
  return bytecode[index];
}

// ============================================================================
// Вспомогательные функции для работы с кучей (из браны)
// ============================================================================

// ============================================================================
// Функции для работы со строками (StringAtlas)
// ============================================================================

/**
 * Получить хэш строки по её ID.
 * Формат string_registry: [ptr0, len0, hash0, ptr1, len1, hash1, ...]
 */
fn get_string_hash(string_id: u32) -> u32 {
  let registry_index = string_id * 3u + 2u;
  return string_registry_safe(registry_index);
}

/**
 * Получить длину строки по её ID.
 */
fn get_string_length(string_id: u32) -> u32 {
  let registry_index = string_id * 3u + 1u;
  return string_registry_safe(registry_index);
}

/**
 * Получить указатель на строку в string_heap по её ID.
 */
fn get_string_pointer(string_id: u32) -> u32 {
  let registry_index = string_id * 3u;
  return string_registry_safe(registry_index);
}

/**
 * Двухступенчатое сравнение строк.
 *
 * Использует флаг вместо раннего выхода для предотвращения thread divergence на GPU.
 */
fn string_equals(id_a: u32, id_b: u32) -> bool {
  if (id_a == id_b) {
    return true;
  }
  let hash_a = get_string_hash(id_a);
  let hash_b = get_string_hash(id_b);
  if (hash_a != hash_b) {
    return false;
  }
  let len_a = get_string_length(id_a);
  let len_b = get_string_length(id_b);
  if (len_a != len_b) {
    return false;
  }
  let ptr_a = get_string_pointer(id_a);
  let ptr_b = get_string_pointer(id_b);

  // Используем флаг вместо раннего return для предотвращения thread divergence
  var equal = true;
  for (var i = 0u; i < len_a; i = i + 1u) {
    if (string_heap_safe(ptr_a + i) != string_heap_safe(ptr_b + i)) {
      equal = false;
    }
  }
  return equal;
}

/**
 * Проверить, входит ли строка в список строк.
 */
fn string_in_list(string_id: u32, abs_list_ptr: u32) -> bool {
  let count = bytecode_safe(abs_list_ptr);
  for (var i = 0u; i < count; i = i + 1u) {
    let list_string_id = bytecode_safe(abs_list_ptr + 1u + i);
    if (string_equals(string_id, list_string_id)) {
      return true;
    }
  }
  return false;
}

fn get_field_block_ptr(brane_index: u32) -> u32 {
  return brane_block_ptrs_safe(brane_index);
}

fn get_local_field_count(block_ptr: u32) -> u32 {
  return heap_safe(block_ptr);
}

fn get_entangled_count(block_ptr: u32) -> u32 {
  return heap_safe(block_ptr + 1u);
}

fn find_field(block_ptr: u32, target_field_idx: u32) -> vec4<u32> {
  let local_count = heap_safe(block_ptr);
  // Дескрипторы полей начинаются сразу после заголовка (3 слова: local_count, entangled_count, lock)
  let header_base = block_ptr + 3u;

  var i: u32 = 0u;
  loop {
    if (i >= local_count) {
      break;
    }

    let field_idx = heap_safe(header_base + i * 2u);
    let meta_data = heap_safe(header_base + i * 2u + 1u);

    if (field_idx == target_field_idx) {
      let offset_words = meta_data & 0xFFFFu;
      let value_ptr = block_ptr + offset_words;
      return vec4<u32>(1u, field_idx, meta_data, value_ptr);
    }

    i = i + 1u;
  }

  return vec4<u32>(0u, 0u, 0u, 0u);
}

fn get_field_value_recursive(brane_index: u32, target_field_idx: u32) -> f32 {
  // Ищем в локальном блоке поля
  let block_ptr = get_field_block_ptr(brane_index);
  let result = find_field(block_ptr, target_field_idx);

  if (result.x == 1u) {
    let meta_data = result.z;
    let field_type = (meta_data >> 24u) & 0xFFu;

    if (field_type == 0u) {
      // F32
      return bitcast<f32>(heap_safe(result.w));
    }

    return f32(heap_safe(result.w));
  }

  // Если не нашли, ищем в entangled блоках
  let local_count = heap_safe(block_ptr);
  let entangled_count = heap_safe(block_ptr + 1u);

  var i: u32 = 0u;
  loop {
    if (i >= entangled_count) {
      break;
    }

    // Получаем указатель на entangled блок (после заголовка + field descriptors)
    let entangled_ptrs_offset = block_ptr + 3u + local_count * 2u;
    let entangled_ptr = heap_safe(entangled_ptrs_offset + i);

    if (entangled_ptr == 0u) {
      i = i + 1u;
      continue;
    }

    let entangled_result = find_field(entangled_ptr, target_field_idx);
    if (entangled_result.x == 1u) {
      let meta_data = entangled_result.z;
      let field_type = (meta_data >> 24u) & 0xFFu;

      if (field_type == 0u) {
        // F32
        return bitcast<f32>(heap_safe(entangled_result.w));
      }

      return f32(heap_safe(entangled_result.w));
    }

    i = i + 1u;
  }

  return 0.0;
}

/**
 * Получить сырое значение поля как u32.
 * Для строк возвращает string_id, для скаляров - битовое представление.
 *
 * @see cpu/transition.ts:readFieldValueRaw() — TypeScript-эквивалент
 */
fn get_field_value_raw(brane_index: u32, target_field_idx: u32) -> u32 {
  // Ищем в локальном блоке поля
  let block_ptr = get_field_block_ptr(brane_index);
  let result = find_field(block_ptr, target_field_idx);

  if (result.x == 1u) {
    return heap_safe(result.w);
  }

  // Если не нашли, ищем в entangled блоках
  let local_count = heap_safe(block_ptr);
  let entangled_count = heap_safe(block_ptr + 1u);

  var i: u32 = 0u;
  loop {
    if (i >= entangled_count) {
      break;
    }

    // Получаем указатель на entangled блок (после заголовка + field descriptors)
    let entangled_ptrs_offset = block_ptr + 3u + local_count * 2u;
    let entangled_ptr = heap_safe(entangled_ptrs_offset + i);

    if (entangled_ptr == 0u) {
      i = i + 1u;
      continue;
    }

    let entangled_result = find_field(entangled_ptr, target_field_idx);
    if (entangled_result.x == 1u) {
      return heap_safe(entangled_result.w);
    }

    i = i + 1u;
  }

  return 0u;
}

// ============================================================================
// Основные функции для работы с правилами FSM
// ============================================================================

/**
 * Проверка условия для поля (EQ/NEQ/GT/LT/GTE/LTE/IN/NOT_IN/INCLUDE/NOT_INCLUDE/LENGTH/IS_EMPTY).
 *
 * @param op - Код операции (OP.EQ, OP.NEQ, OP.IN, ...)
 * @param field_type - Тип поля (TYPE.FLOAT=0, TYPE.UINT=1, TYPE.BOOL=2, TYPE.STRING=3, TYPE.ARRAY=4)
 * @param val_a_raw - Сырое значение поля из кучи (для строк = string_id)
 * @param val_b_raw - Значение из байткода или указатель на список
 * @param cond_values_base - База секции значений в cond-блоке (первое слово первой инструкции)
 * @returns true если условие выполнено
 *
 * @see cpu/transition.ts:evaluateCondition() — TypeScript-эквивалент
 */
fn check_cond(op: u32, field_type: u32, val_a_raw: u32, val_b_raw: u32, cond_values_base: u32) -> bool {
  // Для ARRAY поддерживаем скалярные сравнения по длине.
  // op: EQ/NEQ/GT/LT/GTE/LTE, val_b_raw: ожидаемая длина.
  if (field_type == 4u && op <= 5u) {
    let heap_ptr = val_a_raw;
    let len = select(0u, heap_safe(heap_ptr), heap_ptr != 0u);

    if (op == 0u) {
      return len == val_b_raw;
    }
    if (op == 1u) {
      return len != val_b_raw;
    }
    if (op == 2u) {
      return len > val_b_raw;
    }
    if (op == 3u) {
      return len < val_b_raw;
    }
    if (op == 4u) {
      return len >= val_b_raw;
    }
    return len <= val_b_raw;
  }

  // Строковые операции (TYPE.STRING = 3)
  if (field_type == 3u) {
    // val_a_raw = string_id из heap
    // val_b_raw = string_id из bytecode (для EQ/NEQ) или ptr на список (для IN/NOT_IN)

    // EQ / NEQ для строк — используем полное сравнение строк
    if (op == 0u) {
      return string_equals(val_a_raw, val_b_raw);
    }
    if (op == 1u) {
      return !string_equals(val_a_raw, val_b_raw);
    }

    // IN / NOT_IN для строк
    if (op == 6u || op == 7u) {
      let abs_list_ptr = cond_values_base + val_b_raw;
      let found = string_in_list(val_a_raw, abs_list_ptr);
      if (op == 6u) {
        return found;
      }
      return !found;
    }

    // Строки не поддерживают >, <, >=, <=
    return false;
  }

  // Базовые скалярные сравнения (FLOAT, UINT, BOOL)
  if (op <= 5u) {
    var val_a = f32(val_a_raw);
    var val_b = f32(val_b_raw);
    if (field_type == 0u) {
      // Для операторов с плавающей точкой используем bitcast.
      val_a = bitcast<f32>(val_a_raw);
      val_b = bitcast<f32>(val_b_raw);
    }
    if (op == 0u) {
      return val_a == val_b;
    }
    if (op == 1u) {
      return val_a != val_b;
    }
    if (op == 2u) {
      return val_a > val_b;
    }
    if (op == 3u) {
      return val_a < val_b;
    }
    if (op == 4u) {
      return val_a >= val_b;
    }
    if (op == 5u) {
      return val_a <= val_b;
    }
  }

  // Списки (IN / NOT_IN) для скаляров
  // val_b_raw — указатель на список в байткоде: [count, item1, item2...]
  if (op == 6u || op == 7u) {
    let abs_list_ptr = cond_values_base + val_b_raw;
    let count = bytecode_safe(abs_list_ptr);
    var found = false;
    for (var i = 0u; i < count; i = i + 1u) {
      let item_raw = bytecode_safe(abs_list_ptr + 1u + i);
      var item_val = f32(item_raw);
      var val_a = f32(val_a_raw);
      if (field_type == 0u) {
        item_val = bitcast<f32>(item_raw);
        val_a = bitcast<f32>(val_a_raw);
      }
      if (val_a == item_val) {
        found = true;
        break;
      }
    }
    if (op == 6u) {
      return found;
      // IN
    }
    if (op == 7u) {
      return !found;
      // NOT_IN
    }
  }

  // Операторы массивов (INCLUDE / LENGTH / IS_EMPTY)
  // val_a_raw = указатель на массив в куче (heap). Формат: [длина, элемент1, элемент2...]
  // val_b_raw = значение для поиска или сравнения (закодировано как u32).
  if (op >= 8u && op <= 11u) {
    let heap_ptr = val_a_raw;
    if (heap_ptr == 0u) {
      // Null указатель = пустой массив.
      if (op == 11u) {
        return val_b_raw == 1u;
        // IS_EMPTY: true если ожидаем пустой.
      }
      if (op == 10u) {
        return 0u == val_b_raw;
        // LENGTH: 0 == ожидаемая длина.
      }
      return false;
    }
    let len = heap_safe(heap_ptr);
    if (op == 10u) {
      return len == val_b_raw;
      // LENGTH.
    }
    if (op == 11u) {
      let is_empty = (len == 0u);
      let expected = (val_b_raw == 1u);
      return is_empty == expected;
      // IS_EMPTY.
    }
    if (op == 8u || op == 9u) {
      // INCLUDE / NOT_INCLUDE: линейный поиск в куче.
      var found = false;
      for (var i = 0u; i < len; i = i + 1u) {
        let item_raw = heap_safe(heap_ptr + 1u + i);
        if (item_raw == val_b_raw) {
          found = true;
          break;
        }
      }
      if (op == 8u) {
        return found;
        // INCLUDE.
      }
      if (op == 9u) {
        return !found;
        // NOT_INCLUDE.
      }
    }
  }

  return false;
}

// WORKGROUP_SIZE = 64 (константа определена выше, но @workgroup_size требует literal)

/**
 * Главная функция compute shader — вычисляет переходы для всех бран.
 *
 * Алгоритм:
 * 1. Проверка lock-флага (пропуск если заблокирована)
 * 2. Чтение текущего состояния из states buffer
 * 3. Итерация по переходам из bytecode
 * 4. Проверка условий через check_cond()
 * 5. Запись нового состояния в states buffer (in-place)
 * 6. Установка dirty-флага если состояние изменилось
 *
 * @see cpu/transition.ts:evaluateBraneNextState() — TypeScript-эквивалент логики переходов
 */
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let idx = id.x;
  if (idx >= u.braneCount) {
    return;
  }

  // Получаем указатель на блок браны
  let block_ptr = brane_block_ptrs_safe(idx);

  // Проверка флага блокировки (3-е слово заголовка)
  let lock = heap_safe(block_ptr + 2u);
  if (lock == 1u) {
    return;  // Пропустить переходы, состояние не менять
  }

  let current_state = states[idx];
  var next_state = current_state;

  // Смещение bytecode хранится в отдельном специализированном буфере.
  let bytecode_base = bytecode_offsets[idx];

  // Таблица состояний всегда в начале bytecode (offset 0)
  let state_ptr = bytecode[bytecode_base + current_state];
  let tr_count = bytecode[bytecode_base + state_ptr];

  for (var i = 0u; i < tr_count; i = i + 1u) {
    let tr_offset = bytecode_base + state_ptr + 1u + i * 2u;
    let target_state = bytecode[tr_offset];
    let cond_ptr = bytecode[tr_offset + 1u];
    let cond_count = bytecode[bytecode_base + cond_ptr];
    var passed = true;

    for (var k = 0u; k < cond_count; k = k + 1u) {
      let c_base = bytecode_base + cond_ptr + 1u + k * 4u;
      let field_type = bytecode[c_base];
      let target_field_idx = bytecode[c_base + 1u];
      let op = bytecode[c_base + 2u];
      let val_encoded = bytecode[c_base + 3u];
      let real_val_raw = get_field_value_raw(idx, target_field_idx);

      let cond_values_base = bytecode_base + cond_ptr + 1u;
      if (!check_cond(op, field_type, real_val_raw, val_encoded, cond_values_base)) {
        passed = false;
        break;
      }
    }

    if (passed) {
      next_state = target_state;
      break;
    }
  }

  // In-place обновление состояния
  states[idx] = next_state;

  // Атомарная установка флага изменения + авто-блокировка.
  if (next_state != current_state) {
    atomicStore(&dirty_flags[idx], 1u);
    heap[block_ptr + 2u] = 1u;
  }
}
