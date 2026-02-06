struct Uniforms {
  monadCount : u32,
  mapStride : u32,
  tableOffset : u32,
};

@group(0) @binding(0) var<storage, read_write> floats : array<f32>;
@group(0) @binding(1) var<storage, read_write> uints : array<u32>;
@group(0) @binding(2) var<storage, read> states : array<u32>;
@group(0) @binding(3) var<storage, read_write> newStates : array<u32>;
@group(0) @binding(4) var<storage, read> contextMap : array<u32>;
@group(0) @binding(5) var<storage, read> bytecode : array<u32>;
@group(0) @binding(6) var<uniform> u : Uniforms;

fn get_val(dtype: u32, idx: u32, mid: u32) -> f32 {
    let global_idx = contextMap[mid * u.mapStride + idx];
    if (dtype == 0u) {
        return floats[global_idx];
    } else {
        return f32(uints[global_idx]);
    }
}

fn check_cond(op: u32, val_a: f32, val_b_raw: u32, dtype: u32) -> bool {
    var val_b = f32(val_b_raw);
    if (dtype == 0u) { val_b = bitcast<f32>(val_b_raw); }
    
    if (op == 0u) { return val_a == val_b; }
    if (op == 1u) { return val_a != val_b; }
    if (op == 2u) { return val_a > val_b; }
    if (op == 3u) { return val_a < val_b; }
    if (op == 4u) { return val_a >= val_b; }
    if (op == 5u) { return val_a <= val_b; }
    return false;
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id : vec3<u32>) {
    let idx = id.x;
    if (idx >= u.monadCount) { return; }

    let current_state = states[idx];
    var next_state = current_state;

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