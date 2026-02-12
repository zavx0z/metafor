/**
 * Универсальные функции чтения из самоописываемых блоков.
 *
 * Формат блока в куче:
 * [HEADER]
 * ├── local_field_count: u32
 * ├── shared_context_count: u32
 * └── field_descriptors[local_field_count]:
 *     ├── field_id: u32
 *     └── packed_meta: u32  // (type << 24) | (size << 16) | offset
 *
 * [BODY]
 * ├── shared_ptrs[shared_context_count]: u32[]
 * └── field_values[]: значения полей (за которыми следуют выделения строк/массивов)
 */

// Типы полей (должны совпадать с FieldType в TypeScript)
const TYPE_F32: u32 = 0u;
const TYPE_U32: u32 = 1u;
const TYPE_BOOL: u32 = 2u;
const TYPE_STRING_PTR: u32 = 3u;
const TYPE_ARRAY_PTR: u32 = 4u;
const TYPE_SHARED_PTR: u32 = 5u;

// Буферы
@group(0) @binding(0)
var<storage, read> field_descriptors: array<u32>;

@group(0) @binding(1)
var<storage, read> heap: array<u32>;

// Uniforms
struct Uniforms {
  field_count: u32,
}

@group(0) @binding(2)
var<uniform> uniforms: Uniforms;

// ============================================================================
// Вспомогательные функции для работы с блоками
// ============================================================================

/**
 * Получить указатель на блок поля.
 *
 * @param field_index - Индекс поля
 * @return Указатель (смещение) на блок поля в куче
 */

fn get_field_block_ptr(field_index: u32) -> u32 {
  return field_descriptors[field_index];
}

/**
 * Получить количество локальных полей в блоке.
 */

fn get_local_field_count(block_ptr: u32) -> u32 {
  return heap[block_ptr];
}

/**
 * Получить количество shared указателей в блоке.
 */

fn get_shared_count(block_ptr: u32) -> u32 {
  return heap[block_ptr + 1u];
}

/**
 * Найти поле по ID в блоке.
 *
 * @param block_ptr - Указатель на блок
 * @param target_field_id - ID искомого поля
 * @return vec4<u32>:
 *   .x = 1 если найдено, 0 если нет.
 *   .y = field_id (если найдено).
 *   .z = packed_meta (если найдено).
 *   .w = абсолютное смещение значения в куче (если найдено).
 */

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
      // Распаковываем смещение из meta_data.
      let offset_words = meta_data & 0xFFFFu;
      let value_ptr = block_ptr + offset_words;

      return vec4<u32>(1u, field_id, meta_data, value_ptr);
    }

    i = i + 1u;
  }

  // Поле не найдено.
  return vec4<u32>(0u, 0u, 0u, 0u);
}

/**
 * Получить значение u32 поля.
 *
 * @param field_index - Индекс поля
 * @param target_field_id - ID поля
 * @return Значение поля (0 если не найдено)
 */

fn get_field_u32(field_index: u32, target_field_id: u32) -> u32 {
  let block_ptr = get_field_block_ptr(field_index);
  let result = find_field(block_ptr, target_field_id);

  if (result.x == 0u) {
    return 0u;
    // Поле не найдено.
  }

  return heap[result.w];
}

/**
 * Получить значение f32 поля.
 *
 * @param field_index - Индекс поля
 * @param target_field_id - ID поля
 * @return Значение поля (0.0 если не найдено)
 */

fn get_field_f32(field_index: u32, target_field_id: u32) -> f32 {
  let block_ptr = get_field_block_ptr(field_index);
  let result = find_field(block_ptr, target_field_id);

  if (result.x == 0u) {
    return 0.0;
  }

  // Проверяем тип поля.
  let meta_data = result.z;
  let field_type = (meta_data >> 24u) & 0xFFu;

  if (field_type == TYPE_F32) {
    return bitcast<f32>(heap[result.w]);
  }

  // Для других типов конвертируем в f32.
  return f32(heap[result.w]);
}

/**
 * Получить значение bool поля.
 *
 * @param field_index - Индекс поля
 * @param target_field_id - ID поля
 * @return Значение поля (false если не найдено)
 */

fn get_field_bool(field_index: u32, target_field_id: u32) -> bool {
  return get_field_u32(field_index, target_field_id) != 0u;
}

/**
 * Получить указатель на entangled брану.
 *
 * @param field_index - Индекс поля
 * @param entangled_idx - Индекс entangled браны (0, 1, ...)
 * @return Указатель на блок entangled браны в куче (0 если не найден)
 */

fn get_entangled_brane_ptr(field_index: u32, entangled_idx: u32) -> u32 {
  let block_ptr = get_field_block_ptr(field_index);
  let local_count = heap[block_ptr];
  let shared_count = heap[block_ptr + 1u];

  if (entangled_idx >= shared_count) {
    return 0u;
    // Индекс за границами.
  }

  // Entangled указатели начинаются после заголовка (2 + local_count * 2).
  let entangled_ptrs_offset = block_ptr + 2u + local_count * 2u;
  return heap[entangled_ptrs_offset + entangled_idx];
}

/**
 * Получить значение поля из entangled браны.
 *
 * Рекурсивно ищет поле в блоке поля, затем во всех его разделяемых блоках.
 *
 * @param field_index - Индекс поля
 * @param target_field_id - ID поля
 * @return Значение поля (0.0 если не найдено)
 */

fn get_field_value_recursive(field_index: u32, target_field_id: u32) -> f32 {
  // Сначала ищем в локальном блоке поля.
  let local_value = get_field_f32(field_index, target_field_id);
  if (local_value != 0.0 || find_field(get_field_block_ptr(field_index), target_field_id).x == 1u) {
    return local_value;
  }

  // Если не нашли, ищем в разделяемых блоках.
  let block_ptr = get_field_block_ptr(field_index);
  let shared_count = heap[block_ptr + 1u];

  var i: u32 = 0u;
  loop {
    if (i >= shared_count) {
      break;
    }

    let entangled_ptr = get_entangled_brane_ptr(field_index, i);
    if (entangled_ptr == 0u) {
      i = i + 1u;
      continue;
    }

    let entangled_result = find_field(entangled_ptr, target_field_id);
    if (entangled_result.x == 1u) {
      // Нашли в entangled блоке.
      let meta_data = entangled_result.z;
      let field_type = (meta_data >> 24u) & 0xFFu;

      if (field_type == TYPE_F32) {
        return bitcast<f32>(heap[entangled_result.w]);
      }

      return f32(heap[entangled_result.w]);
    }

    i = i + 1u;
  }

  // Поле не найдено нигде.
  return 0.0;
}
