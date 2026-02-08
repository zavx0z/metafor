struct Uniforms {
    monadCount: u32,
    floatFieldCount: u32,
    // Количество полей типа FLOAT на агента
    uintFieldCount: u32,
    // Количество полей типа UINT на агента
    tableOffset: u32,
}

@group(0) @binding(0)
var<storage, read_write> floats: array<f32>;
@group(0) @binding(1)
var<storage, read_write> uints: array<u32>;
@group(0) @binding(2)
var<storage, read> states: array<u32>;
@group(0) @binding(3)
var<storage, read_write> newStates: array<u32>;
@group(0) @binding(5)
var<storage, read> bytecode: array<u32>;
@group(0) @binding(6)
var<uniform> u: Uniforms;

// Блочная модель памяти: каждый агент имеет фиксированный блок памяти
// FLOAT поля всех агентов хранятся последовательно в буфере floats
// UINT поля всех агентов хранятся последовательно в буфере uints
// Доступ: buffer[agentId * поля_на_агента + локальный_индекс_поля]

fn get_val(dtype: u32, fieldIdx: u32, agentId: u32) -> f32 {
    // FLOAT поля: индекс = (агент * количество_float_полей) + локальный_индекс_поля
    if (dtype == 0u) {
        return floats[agentId * u.floatFieldCount + fieldIdx];
    }
    // UINT/BOOL поля: индекс = (агент * количество_uint_полей) + локальный_индекс_поля
    else {
        return f32(uints[agentId * u.uintFieldCount + fieldIdx]);
    }
}

fn check_cond(op: u32, val_a: f32, val_b_raw: u32, dtype: u32) -> bool {
    // Базовые скалярные сравнения
    if (op <= 5u) {
        var val_b = f32(val_b_raw);
        if (dtype == 0u) {
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
    // val_b_raw здесь — это указатель на список в bytecode: [count, item1, item2...]
    if (op == 6u || op == 7u) {
        let _ptr = val_b_raw;
        let count = bytecode[_ptr];
        var found = false;

        for (var i = 0u; i < count; i = i + 1u) {
            let item_raw = bytecode[_ptr + 1u + i];
            var item_val = f32(item_raw);
            if (dtype == 0u) {
                item_val = bitcast<f32>(item_raw);
            }

            if (val_a == item_val) {
                found = true;
                break;
            }
        }

        if (op == 6u) {
            return found;
        }
        // IN
        if (op == 7u) {
            return !found;
        }
        // NOT_IN
    }

    // Операторы массивов (INCLUDE / LENGTH / IS_EMPTY)
    // val_a = указатель на массив в буфере uints (heap)
    // val_b = значение для поиска или сравнения
    if (op >= 8u && op <= 11u) {
        let heap_ptr = u32(val_a);
        // Защита от нулевого указателя (0 = null)
        if (heap_ptr == 0u) {
            // Если массив null, длина 0.
            // isEmpty (11) -> true (если val_b == 1)
            // length (10) -> сравниваем 0 с val_b
            if (op == 11u) {
                return val_b_raw == 1u;
            }
            if (op == 10u) {
                return 0u == val_b_raw;
            }
            return false;
        }

        let len = uints[heap_ptr];

        // OP.LENGTH (10)
        if (op == 10u) {
            return len == val_b_raw;
        }

        // OP.IS_EMPTY (11)
        if (op == 11u) {
            let is_empty = (len == 0u);
            let expected = (val_b_raw == 1u);
            return is_empty == expected;
        }

        // OP.INCLUDE (8) / OP.NOT_INCLUDE (9)
        // Линейный поиск в куче
        if (op == 8u || op == 9u) {
            var found = false;
            for (var i = 0u; i < len; i = i + 1u) {
                let item_raw = uints[heap_ptr + 1u + i];
                var item_val = f32(item_raw);
                // Если массив float, элементы в куче bitcast-нуты.
                // Нам нужно привести их к f32 для сравнения с val_b (который тоже f32, даже если закодирован как u32)
                // НО! val_b_raw приходит уже как биты.
                // Если мы сравниваем биты (u32), то bitcast не нужен, если мы уверены в точности.
                // Однако check_cond принимает val_a: f32.
                // Для универсальности, сравним сырые биты для точного совпадения (EQ).

                // Если подтип float, нужно ли декодировать?
                // val_b (искомое) передается как аргумент.
                // Если это INCLUDE <float>, то val_b уже сконвертирован в f32 (аргумент функции).
                // А item_raw - это u32.

                if (dtype == 0u) {
                    // dtype здесь - это тип САМОГО ПОЛЯ (ARRAY). Это 4.
                    // Мы не знаем subType внутри шейдера (он не передан).
                    // Эвристика: мы сравниваем item_raw (u32) с val_b_raw (u32).
                    // Так как компилятор кодирует оба значения одинаково (bitcast),
                    // прямое сравнение u32 корректно для EQ.
                }

                if (item_raw == val_b_raw) {
                    found = true;
                    break;
                }
            }
            if (op == 8u) {
                return found;
            }
            if (op == 9u) {
                return !found;
            }
        }
    }

    return false;
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let idx = id.x;
    if (idx >= u.monadCount) {
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
            let type_ = bytecode[c_base];
            let field_idx = bytecode[c_base + 1u];
            let op = bytecode[c_base + 2u];
            let val_encoded = bytecode[c_base + 3u];

            let real_val = get_val(type_, field_idx, idx);
            if (!check_cond(op, real_val, val_encoded, type_)) {
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