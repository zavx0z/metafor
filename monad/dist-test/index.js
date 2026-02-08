// monad/src/classify.wgsl
var classify_default = `struct Uniforms {
  monadCount : u32,
  floatFieldCount : u32,  // Количество полей типа FLOAT на агента
  uintFieldCount : u32,   // Количество полей типа UINT на агента
  tableOffset : u32,
};

@group(0) @binding(0) var<storage, read_write> floats : array<f32>;
@group(0) @binding(1) var<storage, read_write> uints : array<u32>;
@group(0) @binding(2) var<storage, read> states : array<u32>;
@group(0) @binding(3) var<storage, read_write> newStates : array<u32>;
// contextMap удален - используется блочная модель памяти
@group(0) @binding(5) var<storage, read> bytecode : array<u32>;
@group(0) @binding(6) var<uniform> u : Uniforms;

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
}`;

// monad/src/backend.ts
class GPUBackend {
  device;
  pipeline = null;
  bindGroup = null;
  buffers = {};
  stagingBuffer = null;
  constructor(device) {
    this.device = device;
  }
  async init(params) {
    const module = this.device.createShaderModule({ code: classify_default });
    this.pipeline = this.device.createComputePipeline({
      layout: "auto",
      compute: { module, entryPoint: "main" }
    });
    this.buffers.floats = this.createStorageBuffer(params.contextDataFloats);
    this.buffers.uints = this.createStorageBuffer(params.contextDataUints);
    this.buffers.states = this.createStorageBuffer(params.states, true);
    this.buffers.newStates = this.createStorageBuffer(new Uint32Array(params.monadCount), true);
    this.buffers.bytecode = this.createStorageBuffer(params.bytecode);
    const uniforms = new Uint32Array([
      params.monadCount,
      params.floatFieldCount,
      params.uintFieldCount,
      params.tableOffset
    ]);
    this.buffers.uniforms = this.createBuffer(uniforms, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);
    this.stagingBuffer = this.device.createBuffer({
      size: params.states.byteLength,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
    });
    this.bindGroup = this.device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.buffers.floats } },
        { binding: 1, resource: { buffer: this.buffers.uints } },
        { binding: 2, resource: { buffer: this.buffers.states } },
        { binding: 3, resource: { buffer: this.buffers.newStates } },
        { binding: 5, resource: { buffer: this.buffers.bytecode } },
        { binding: 6, resource: { buffer: this.buffers.uniforms } }
      ]
    });
  }
  run() {
    if (!this.pipeline || !this.bindGroup)
      return;
    const cmd = this.device.createCommandEncoder();
    const pass = cmd.beginComputePass();
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    const count = this.buffers.newStates.size / 4;
    pass.dispatchWorkgroups(Math.ceil(count / 64));
    pass.end();
    cmd.copyBufferToBuffer(this.buffers.newStates, 0, this.buffers.states, 0, this.buffers.newStates.size);
    this.device.queue.submit([cmd.finish()]);
  }
  async read() {
    const cmd = this.device.createCommandEncoder();
    cmd.copyBufferToBuffer(this.buffers.states, 0, this.stagingBuffer, 0, this.buffers.states.size);
    this.device.queue.submit([cmd.finish()]);
    await this.stagingBuffer.mapAsync(GPUMapMode.READ);
    const copy = new Uint32Array(this.stagingBuffer.getMappedRange().slice(0));
    this.stagingBuffer.unmap();
    return copy;
  }
  writeContextValue(bufferIndex, value, isFloat) {
    const buffer = isFloat ? this.buffers.floats : this.buffers.uints;
    const wordSize = 4;
    const offset = bufferIndex * wordSize;
    const data = isFloat ? new Float32Array([value]) : new Uint32Array([value]);
    this.device.queue.writeBuffer(buffer, offset, data);
  }
  createBuffer(data, usage) {
    const buffer = this.device.createBuffer({
      size: Math.ceil(data.byteLength / 4) * 4,
      usage,
      mappedAtCreation: true
    });
    if (data instanceof Float32Array)
      new Float32Array(buffer.getMappedRange()).set(data);
    else
      new Uint32Array(buffer.getMappedRange()).set(data);
    buffer.unmap();
    return buffer;
  }
  createStorageBuffer(data, extraCopy = false) {
    let usage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST;
    if (extraCopy)
      usage |= GPUBufferUsage.COPY_SRC;
    return this.createBuffer(data, usage);
  }
}

// monad/src/common.ts
var OP = {
  EQ: 0,
  NEQ: 1,
  GT: 2,
  LT: 3,
  GTE: 4,
  LTE: 5
};
var TYPE = {
  FLOAT: 0,
  UINT: 1,
  BOOL: 2,
  STRING: 3,
  ARRAY: 4
};

// monad/src/compiler.ts
class RulesCompiler {
  bytecode = [];
  states = [];
  fields = {};
  fieldCounters = { float: 0, uint: 0 };
  compile(superposition, contextSchema) {
    this.bytecode = [];
    this.states = Object.keys(superposition);
    this.buildFieldMap(contextSchema);
    const stateTableOffset = this.bytecode.length;
    for (let i = 0;i < this.states.length; i++)
      this.bytecode.push(0);
    for (let i = 0;i < this.states.length; i++) {
      const stateName = this.states[i];
      const transitions = superposition[stateName] || {};
      const stateBlockPtr = this.bytecode.length;
      this.bytecode[stateTableOffset + i] = stateBlockPtr;
      const transitionKeys = Object.keys(transitions);
      this.bytecode.push(transitionKeys.length);
      for (const targetName of transitionKeys) {
        const targetIdx = this.states.indexOf(targetName);
        if (targetIdx === -1)
          throw new Error(`Unknown target state: ${targetName}`);
        const conditions = transitions[targetName] || {};
        this.bytecode.push(targetIdx);
        const condPtrIdx = this.bytecode.length;
        this.bytecode.push(0);
      }
      let transitionIdx = 0;
      for (const targetName of transitionKeys) {
        const conditions = transitions[targetName] || {};
        const trBase = stateBlockPtr + 1 + transitionIdx * 2;
        const condBlockPtr = this.bytecode.length;
        this.bytecode[trBase + 1] = condBlockPtr;
        this.compileConditions(conditions);
        transitionIdx++;
      }
    }
    return {
      bytecode: new Uint32Array(this.bytecode),
      stateTableOffset,
      fieldMap: this.fields,
      stateMap: Object.fromEntries(this.states.map((s, i) => [s, i])),
      fieldCount: Object.keys(this.fields).length
    };
  }
  buildFieldMap(schema) {
    for (const key in schema) {
      const typeStr = String(schema[key]);
      if (typeStr.includes("number")) {
        this.fields[key] = { type: TYPE.FLOAT, index: this.fieldCounters.float++ };
      } else {
        this.fields[key] = { type: TYPE.UINT, index: this.fieldCounters.uint++ };
      }
    }
  }
  compileConditions(wave) {
    const entries = Object.entries(wave);
    this.bytecode.push(entries.length);
    for (const [key, cond] of entries) {
      const field = this.fields[key];
      if (!field)
        throw new Error(`Unknown field in conditions: ${key}`);
      const checks = this.parseCondition(cond);
      for (const check of checks) {
        this.bytecode.push(field.type);
        this.bytecode.push(field.index);
        this.bytecode.push(check.op);
        this.bytecode.push(this.encodeValue(field.type, check.val));
      }
    }
  }
  parseCondition(cond) {
    if (typeof cond !== "object" || cond === null) {
      return [{ op: OP.EQ, val: cond }];
    }
    const checks = [];
    for (const [k, v] of Object.entries(cond)) {
      switch (k) {
        case "eq":
          checks.push({ op: OP.EQ, val: v });
          break;
        case "ne":
        case "notEq":
        case "neq":
          checks.push({ op: OP.NEQ, val: v });
          break;
        case "gt":
          checks.push({ op: OP.GT, val: v });
          break;
        case "lt":
          checks.push({ op: OP.LT, val: v });
          break;
        case "gte":
          checks.push({ op: OP.GTE, val: v });
          break;
        case "lte":
          checks.push({ op: OP.LTE, val: v });
          break;
        case "notGt":
          checks.push({ op: OP.LTE, val: v });
          break;
        case "notGte":
          checks.push({ op: OP.LT, val: v });
          break;
        case "notLt":
          checks.push({ op: OP.GTE, val: v });
          break;
        case "notLte":
          checks.push({ op: OP.GT, val: v });
          break;
        case "between":
          if (Array.isArray(v) && v.length === 2) {
            checks.push({ op: OP.GTE, val: v[0] });
            checks.push({ op: OP.LTE, val: v[1] });
          }
          break;
      }
    }
    return checks;
  }
  encodeValue(type, val) {
    if (type === TYPE.FLOAT) {
      const buf = new Float32Array([Number(val)]);
      return new Uint32Array(buf.buffer)[0];
    }
    if (type === TYPE.BOOL) {
      return val ? 1 : 0;
    }
    if (typeof val === "string") {
      return 0;
    }
    return Number(val);
  }
}

// monad/src/index.ts
class MonadSystem {
  backend;
  compiler = new RulesCompiler;
  stateMap = {};
  reverseStateMap = [];
  fieldMap = {};
  constructor(device) {
    this.backend = new GPUBackend(device);
  }
  async init(config) {
    const compiled = this.compiler.compile(config.statesConfig, config.contextSchema);
    this.stateMap = compiled.stateMap;
    this.reverseStateMap = Object.keys(compiled.stateMap);
    this.fieldMap = compiled.fieldMap;
    const monadCount = config.monads.length;
    const states = new Uint32Array(monadCount);
    const fieldCount = compiled.fieldCount;
    const floatFields = Object.values(this.fieldMap).filter((f) => f.type === 0).length;
    const uintFields = fieldCount - floatFields;
    const blockStride = fieldCount;
    const contextDataFloats = new Float32Array(monadCount * floatFields);
    const contextDataUints = new Uint32Array(monadCount * uintFields);
    config.monads.forEach((m, agentIdx) => {
      states[agentIdx] = this.stateMap[m.state] ?? 0;
      for (const [key, value] of Object.entries(m.context)) {
        const field = this.fieldMap[key];
        if (!field)
          continue;
        if (field.type === 0) {
          const floatIdx = agentIdx * floatFields + field.index;
          contextDataFloats[floatIdx] = Number(value);
        } else {
          const uintIdx = agentIdx * uintFields + field.index;
          contextDataUints[uintIdx] = Number(value);
        }
      }
    });
    await this.backend.init({
      monadCount,
      floatFieldCount: floatFields,
      uintFieldCount: uintFields,
      bytecode: compiled.bytecode,
      states,
      contextDataFloats,
      contextDataUints,
      tableOffset: compiled.stateTableOffset
    });
  }
  updateContext(agentIndex, fieldName, value) {
    const field = this.fieldMap[fieldName];
    if (!field) {
      console.warn(`Unknown field: ${fieldName}`);
      return;
    }
    const isFloat = field.type === 0;
    const fieldCountOfType = field.type === 0 ? Object.values(this.fieldMap).filter((f) => f.type === 0).length : Object.values(this.fieldMap).filter((f) => f.type !== 0).length;
    const absoluteIndex = agentIndex * fieldCountOfType + field.index;
    this.backend.writeContextValue(absoluteIndex, Number(value), isFloat);
  }
  step() {
    this.backend.run();
  }
  async getStates() {
    const raw = await this.backend.read();
    return Array.from(raw).map((id) => this.reverseStateMap[id]);
  }
}
export {
  MonadSystem
};
