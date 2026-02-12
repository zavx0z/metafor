struct Uniforms {
  quantaCount: u32,
  tableOffset: u32,
  _pad0: u32,
  _pad1: u32,
}

@group(0) @binding(0)
var<storage, read> quantum_descriptors: array<u32>;
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
// ============================================================================
// Вспомогательные функции для работы с кучей (из браны)
// ============================================================================

fn get_quantum_block_ptr(quantum_id: u32) -> u32 {
  return quantum_descriptors[quantum_id];
}

fn get_local_field_count(block_ptr: u32) -> u32 {
  return heap[block_ptr];
}

fn get_shared_count(block_ptr: u32) -> u32 {
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

fn get_field_value_recursive(quantum_id: u32, field_id: u32) -> f32 {
  // Ищем в локальном блоке кванта
  let block_ptr = get_quantum_block_ptr(quantum_id);
  let result = find_field(block_ptr, field_id);

  if (result.x == 1u) {
    let meta_data = result.z;
    let field_type = (meta_data >> 24u) & 0xFFu;

    if (field_type == 0u) {
      // F32
      return bitcast<f32>(heap[result.w]);
    }

    return f32(heap[result.w]);
  }

  // Если не нашли, ищем в разделяемых блоках
  let shared_count = heap[block_ptr + 1u];

  var i: u32 = 0u;
  loop {
    if (i >= shared_count) {
      break;
    }

    // Получаем указатель на разделяемый блок (после заголовка)
    let shared_ptrs_offset = block_ptr + 2u + get_local_field_count(block_ptr) * 2u;
    let shared_ptr = heap[shared_ptrs_offset + i];

    if (shared_ptr == 0u) {
      i = i + 1u;
      continue;
    }

    let shared_result = find_field(shared_ptr, field_id);
    if (shared_result.x == 1u) {
      let meta_data = shared_result.z;
      let field_type = (meta_data >> 24u) & 0xFFu;

      if (field_type == 0u) {
        // F32
        return bitcast<f32>(heap[shared_result.w]);
      }

      return f32(heap[shared_result.w]);
    }

    i = i + 1u;
  }

  return 0.0;
}

// ============================================================================
// Основные функции для работы с правилами FSM
// ============================================================================

fn check_cond(op: u32, field_type: u32, val_a: f32, val_b_raw: u32) -> bool {
  // Базовые скалярные сравнения
  if (op <= 5u) {
    var val_b = f32(val_b_raw);
    if (field_type == 0u) {
      // Для операторов с плавающей точкой используем bitcast.
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

  // Списки (IN / NOT_IN)
  // val_b_raw — указатель на список в байткоде: [count, item1, item2...]
  if (op == 6u || op == 7u) {
    let list_ptr = val_b_raw;
    let count = bytecode[list_ptr];
    var found = false;
    for (var i = 0u; i < count; i = i + 1u) {
      let item_raw = bytecode[list_ptr + 1u + i];
      var item_val = f32(item_raw);
      if (field_type == 0u) {
        item_val = bitcast<f32>(item_raw);
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
  // val_a = указатель на массив в куче (heap). Формат: [длина, элемент1, элемент2...]
  // val_b = значение для поиска или сравнения (закодировано как u32).
  if (op >= 8u && op <= 11u) {
    let heap_ptr = u32(val_a);
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
  if (idx >= u.quantaCount) {
    return;
  }

  let current_state = states[idx];
  var next_state = current_state;

  // Получаем блок условий для текущего состояния из таблицы состояний (которая находится в начале байткода)
  let state_ptr = bytecode[u.tableOffset + current_state];
  let tr_count = bytecode[state_ptr];

  for (var i = 0u; i < tr_count; i = i + 1u) {
    let tr_offset = state_ptr + 1u + i * 2u;
    let target_state = bytecode[tr_offset];
    let cond_ptr = bytecode[tr_offset + 1u];
    let cond_count = bytecode[cond_ptr];
    var passed = true;

    for (var k = 0u; k < cond_count; k = k + 1u) {
      let c_base = cond_ptr + 1u + k * 4u;
      let field_type = bytecode[c_base];
      let field_id = bytecode[c_base + 1u];
      let op = bytecode[c_base + 2u];
      let val_encoded = bytecode[c_base + 3u];
      let real_val = get_field_value_recursive(idx, field_id);
      if (!check_cond(op, field_type, real_val, val_encoded)) {
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
