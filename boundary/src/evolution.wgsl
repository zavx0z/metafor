/**
 * Compute-шейдер эволюции полей.
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
struct Uniforms {
  /**
   * Количество полей (field) в текущем батче.
   * 
   * Используется в `main()` для защиты от out-of-bounds доступа:
   * compute-шейдер запускается с фиксированным числом workgroups,
   * и потоки с `id.x >= fieldCount` досрочно завершаются.
   */
  fieldCount: u32,
  /** Padding для выравнивания до 16 байт. Значение игнорируется GPU. */
  _pad0: u32,
  /** Padding для выравнивания до 16 байт. Значение игнорируется GPU. */
  _pad1: u32,
  /** Padding для выравнивания до 16 байт. Значение игнорируется GPU. */
  _pad2: u32,
}

@group(0) @binding(0)
var<storage, read> field_descriptors: array<u32>;
@group(0) @binding(1)
var<storage, read> heap: array<u32>;
@group(0) @binding(2)
var<storage, read> states: array<u32>;
@group(0) @binding(3)
var<storage, read_write> newStates: array<u32>;
@group(0) @binding(4)
var<storage, read> bytecode: array<u32>;
@group(0) @binding(5)
var<uniform> u: Uniforms;
@group(0) @binding(6)
var<storage, read> bytecode_offsets: array<u32>;
@group(0) @binding(7)
var<storage, read> string_registry: array<u32>;
@group(0) @binding(8)
var<storage, read> string_heap: array<u32>;

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
  return string_registry[registry_index];
}

/**
 * Получить длину строки по её ID.
 */
fn get_string_length(string_id: u32) -> u32 {
  let registry_index = string_id * 3u + 1u;
  return string_registry[registry_index];
}

/**
 * Получить указатель на строку в string_heap по её ID.
 */
fn get_string_pointer(string_id: u32) -> u32 {
  let registry_index = string_id * 3u;
  return string_registry[registry_index];
}

/**
 * Двухступенчатое сравнение строк.
 * 
 * 1. Быстрое сравнение хэшей (большинство случаев)
 * 2. При совпадении хэшей - посимвольное сравнение для гарантии корректности
 * 
 * @param id_a - ID первой строки
 * @param id_b - ID второй строки
 * @returns true если строки равны
 */
fn string_equals(id_a: u32, id_b: u32) -> bool {
  // Быстрый путь: одинаковые ID = одинаковые строки
  if (id_a == id_b) {
    return true;
  }
  
  // Быстрое сравнение хэшей
  let hash_a = get_string_hash(id_a);
  let hash_b = get_string_hash(id_b);
  
  if (hash_a != hash_b) {
    return false;
  }
  
  // Хэши совпали - нужна полная проверка
  // Это редкий случай (коллизия хэшей), но критичный для корректности
  let len_a = get_string_length(id_a);
  let len_b = get_string_length(id_b);
  
  if (len_a != len_b) {
    return false;
  }
  
  // Посимвольное сравнение
  let ptr_a = get_string_pointer(id_a);
  let ptr_b = get_string_pointer(id_b);
  
  for (var i = 0u; i < len_a; i = i + 1u) {
    if (string_heap[ptr_a + i] != string_heap[ptr_b + i]) {
      return false;
    }
  }
  
  return true;
}

/**
 * Проверить, входит ли строка в список строк.
 * 
 * @param string_id - ID строки для проверки
 * @param abs_list_ptr - Абсолютный указатель на список в bytecode: [count, id1, id2, ...]
 * @returns true если строка найдена в списке
 */
fn string_in_list(string_id: u32, abs_list_ptr: u32) -> bool {
  let count = bytecode[abs_list_ptr];
  
  for (var i = 0u; i < count; i = i + 1u) {
    let list_string_id = bytecode[abs_list_ptr + 1u + i];
    if (string_equals(string_id, list_string_id)) {
      return true;
    }
  }
  
  return false;
}

fn get_field_block_ptr(field_index: u32) -> u32 {
  // field_descriptors: [block_ptr0, bytecode_offset0, block_ptr1, bytecode_offset1, ...]
  return field_descriptors[field_index * 2u];
}

fn get_local_field_count(block_ptr: u32) -> u32 {
  return heap[block_ptr];
}

fn get_entangled_count(block_ptr: u32) -> u32 {
  return heap[block_ptr + 1u];
}

fn find_field(block_ptr: u32, target_field_id: u32) -> vec4<u32> {
  let local_count = heap[block_ptr];
  let header_base = block_ptr + 2u;

  var i: u32 = 0u;
  loop {
    if (i >= local_count) {
      break;
    }

    let field_id = heap[header_base + i * 2u];
    let meta_data = heap[header_base + i * 2u + 1u];

    if (field_id == target_field_id) {
      let offset_words = meta_data & 0xFFFFu;
      let value_ptr = block_ptr + offset_words;
      return vec4<u32>(1u, field_id, meta_data, value_ptr);
    }

    i = i + 1u;
  }

  return vec4<u32>(0u, 0u, 0u, 0u);
}

fn get_field_value_recursive(field_index: u32, target_field_id: u32) -> f32 {
  // Ищем в локальном блоке поля
  let block_ptr = get_field_block_ptr(field_index);
  let result = find_field(block_ptr, target_field_id);

  if (result.x == 1u) {
    let meta_data = result.z;
    let field_type = (meta_data >> 24u) & 0xFFu;

    if (field_type == 0u) {
      // F32
      return bitcast<f32>(heap[result.w]);
    }

    return f32(heap[result.w]);
  }

  // Если не нашли, ищем в entangled блоках
  let entangled_count = heap[block_ptr + 1u];

  var i: u32 = 0u;
  loop {
    if (i >= entangled_count) {
      break;
    }

    // Получаем указатель на entangled блок (после заголовка)
    let entangled_ptrs_offset = block_ptr + 2u + get_local_field_count(block_ptr) * 2u;
    let entangled_ptr = heap[entangled_ptrs_offset + i];

    if (entangled_ptr == 0u) {
      i = i + 1u;
      continue;
    }

    let entangled_result = find_field(entangled_ptr, target_field_id);
    if (entangled_result.x == 1u) {
      let meta_data = entangled_result.z;
      let field_type = (meta_data >> 24u) & 0xFFu;

      if (field_type == 0u) {
        // F32
        return bitcast<f32>(heap[entangled_result.w]);
      }

      return f32(heap[entangled_result.w]);
    }

    i = i + 1u;
  }

  return 0.0;
}

/**
 * Получить сырое значение поля как u32.
 * Для строк возвращает string_id, для скаляров - битовое представление.
 */
fn get_field_value_raw(field_index: u32, target_field_id: u32) -> u32 {
  // Ищем в локальном блоке поля
  let block_ptr = get_field_block_ptr(field_index);
  let result = find_field(block_ptr, target_field_id);

  if (result.x == 1u) {
    return heap[result.w];
  }

  // Если не нашли, ищем в entangled блоках
  let entangled_count = heap[block_ptr + 1u];

  var i: u32 = 0u;
  loop {
    if (i >= entangled_count) {
      break;
    }

    // Получаем указатель на entangled блок (после заголовка)
    let entangled_ptrs_offset = block_ptr + 2u + get_local_field_count(block_ptr) * 2u;
    let entangled_ptr = heap[entangled_ptrs_offset + i];

    if (entangled_ptr == 0u) {
      i = i + 1u;
      continue;
    }

    let entangled_result = find_field(entangled_ptr, target_field_id);
    if (entangled_result.x == 1u) {
      return heap[entangled_result.w];
    }

    i = i + 1u;
  }

  return 0u;
}

// ============================================================================
// Основные функции для работы с правилами FSM
// ============================================================================

/**
 * Проверка условия для поля.
 * 
 * @param op - Код операции (OP.EQ, OP.NEQ, OP.IN, ...)
 * @param field_type - Тип поля (TYPE.FLOAT=0, TYPE.UINT=1, TYPE.BOOL=2, TYPE.STRING=3, TYPE.ARRAY=4)
 * @param val_a_raw - Сырое значение поля из кучи (для строк = string_id)
 * @param val_b_raw - Значение из байткода или указатель на список
 * @param cond_values_base - База секции значений в cond-блоке (первое слово первой инструкции)
 * @returns true если условие выполнено
 */
fn check_cond(op: u32, field_type: u32, val_a_raw: u32, val_b_raw: u32, cond_values_base: u32) -> bool {
  // Для ARRAY поддерживаем скалярные сравнения по длине.
  // op: EQ/NEQ/GT/LT/GTE/LTE, val_b_raw: ожидаемая длина.
  if (field_type == 4u && op <= 5u) {
    let heap_ptr = val_a_raw;
    let len = select(0u, heap[heap_ptr], heap_ptr != 0u);

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
    // EQ / NEQ для строк
    if (op == 0u) {
      // EQ
      return string_equals(val_a_raw, val_b_raw);
    }
    if (op == 1u) {
      // NEQ
      return !string_equals(val_a_raw, val_b_raw);
    }
    
    // IN / NOT_IN для строк
    if (op == 6u || op == 7u) {
      let abs_list_ptr = cond_values_base + val_b_raw;
      let found = string_in_list(val_a_raw, abs_list_ptr);
      // IN = 6, NOT_IN = 7
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
    let count = bytecode[abs_list_ptr];
    var found = false;
    for (var i = 0u; i < count; i = i + 1u) {
      let item_raw = bytecode[abs_list_ptr + 1u + i];
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
    let len = heap[heap_ptr];
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
        let item_raw = heap[heap_ptr + 1u + i];
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

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let idx = id.x;
  if (idx >= u.fieldCount) {
    return;
  }

  let current_state = states[idx];
  var next_state = current_state;

  // Получаем указатель на блок браны и смещение bytecode для этого поля
  // field_descriptors: [block_ptr0, bytecode_offset0, block_ptr1, bytecode_offset1, ...]
  let block_ptr = field_descriptors[idx * 2u];
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
      let target_field_id = bytecode[c_base + 1u];
      let op = bytecode[c_base + 2u];
      let val_encoded = bytecode[c_base + 3u];
      let real_val_raw = get_field_value_raw(idx, target_field_id);
      
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

  newStates[idx] = next_state;
}
