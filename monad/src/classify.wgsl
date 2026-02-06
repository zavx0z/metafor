// === CONSTANTS ===
const OP_EQ: u32 = 0u;
const OP_NEQ: u32 = 1u;
const OP_GT: u32 = 2u;
const OP_LT: u32 = 3u;
const OP_GTE: u32 = 4u;
const OP_LTE: u32 = 5u;

const TYPE_FLOAT: u32 = 0u;
const TYPE_UINT: u32 = 1u;
const TYPE_BOOL: u32 = 2u;

// === BINDINGS ===
@group(0) @binding(0)
var<storage, read> globalFloats: array<f32>;
@group(0) @binding(1)
var<storage, read> globalUints: array<u32>;
@group(0) @binding(2)
var<storage, read> states: array<u32>;
@group(0) @binding(3)
var<storage, read_write> newStates: array<u32>;
@group(0) @binding(4)
var<storage, read> contextMap: array<u32>;
// [monadId * stride + localIdx] -> globalIdx
@group(0) @binding(5)
var<storage, read> bytecode: array<u32>;

struct Params {
    monadCount: u32,
    mapStride: u32,
    tableOffset: u32,
}

@group(0) @binding(6)
var<uniform> params: Params;

// === MAIN ===
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let id = global_id.x;
    if (id >= params.monadCount) {
        return;
    }

    let currentState = states[id];
    var nextState = currentState;

    // 1. Get State Descriptor
    // bytecode[tableOffset + stateID] -> ptr to StateBlock
    let stateBlockPtr = bytecode[params.tableOffset + currentState];
    let transitionCount = bytecode[stateBlockPtr];

    // 2. Iterate Transitions
    var i = 0u;
    loop {
        if (i >= transitionCount) {
            break;
        }

        // Transition Block: [targetState, conditionsPtr]
        let trBase = stateBlockPtr + 1u + (i * 2u);
        let targetState = bytecode[trBase];
        let condPtr = bytecode[trBase + 1u];

        // 3. Check Conditions
        let checkCount = bytecode[condPtr];
        var passed = true;
        var j = 0u;

        loop {
            if (j >= checkCount) {
                break;
            }

            // Check Block: [type, localIdx, op, refVal]
            let chkBase = condPtr + 1u + (j * 4u);
            let dtype = bytecode[chkBase];
            let localIdx = bytecode[chkBase + 1u];
            let op = bytecode[chkBase + 2u];
            let refRaw = bytecode[chkBase + 3u];

            // Resolve Global Index
            let mapIdx = id * params.mapStride + localIdx;
            let globalIdx = contextMap[mapIdx];

            var isMatch = false;
            if (dtype == TYPE_FLOAT) {
                let val = globalFloats[globalIdx];
                let valRef = bitcast<f32>(refRaw);
                if (op == OP_EQ) {
                    isMatch = val == valRef;
                }
                else if (op == OP_NEQ) {
                    isMatch = val != valRef;
                }
                else if (op == OP_GT) {
                    isMatch = val > valRef;
                }
                else if (op == OP_LT) {
                    isMatch = val < valRef;
                }
                else if (op == OP_GTE) {
                    isMatch = val >= valRef;
                }
                else if (op == OP_LTE) {
                    isMatch = val <= valRef;
                }
            }
            else {
                // UINT or BOOL (stored as uint)
                let val = globalUints[globalIdx];
                let valRef = refRaw;
                if (op == OP_EQ) {
                    isMatch = val == valRef;
                }
                else if (op == OP_NEQ) {
                    isMatch = val != valRef;
                }
                else if (op == OP_GT) {
                    isMatch = val > valRef;
                }
                else if (op == OP_LT) {
                    isMatch = val < valRef;
                }
                else if (op == OP_GTE) {
                    isMatch = val >= valRef;
                }
                else if (op == OP_LTE) {
                    isMatch = val <= valRef;
                }
            }

            if (!isMatch) {
                passed = false;
                break;
            }
            j = j + 1u;
        }

        if (passed) {
            nextState = targetState;
            break;
        }
        i = i + 1u;
    }

    newStates[id] = nextState;
}
