import { OP, TYPE, type CompiledRules } from "./common"

// Simplified types to avoid complex imports from MetaFor
type ConditionValue = number | boolean | string | { [key: string]: any }
type Wave = Record<string, ConditionValue>
type Transitions = Record<string, Wave | null>
type Superposition = Record<string, Transitions | null>

export class RulesCompiler {
  private bytecode: number[] = []
  private states: string[] = []
  private fields: Record<string, { type: number; index: number }> = {}
  private fieldCounters = { float: 0, uint: 0 }

  compile(superposition: Superposition, contextSchema: Record<string, any>): CompiledRules {
    this.bytecode = []
    this.states = Object.keys(superposition)
    this.buildFieldMap(contextSchema)

    // 1. Reserve space for State Table
    const stateTableOffset = this.bytecode.length
    // Placeholder for each state's offset
    for (let i = 0; i < this.states.length; i++) this.bytecode.push(0)

    // 2. Compile each state
    for (let i = 0; i < this.states.length; i++) {
      const stateName = this.states[i]
      const transitions = superposition[stateName] || {}

      // Save pointer to this state block in the table
      const stateBlockPtr = this.bytecode.length
      this.bytecode[stateTableOffset + i] = stateBlockPtr

      const transitionKeys = Object.keys(transitions)
      this.bytecode.push(transitionKeys.length) // transitionCount

      for (const targetName of transitionKeys) {
        const targetIdx = this.states.indexOf(targetName)
        if (targetIdx === -1) throw new Error(`Unknown target state: ${targetName}`)

        const conditions = transitions[targetName] || {}

        // Transition Header
        this.bytecode.push(targetIdx)

        // We need to jump to conditions block. We'll push a placeholder, compile conditions, then fix it.
        // Actually, we can just compile conditions *after* the transition list, but for cache locality
        // it's often better to put them close. Let's append conditions immediately after.
        // But wait, the format expects [target, condPtr].
        // So we push target, then placeholder for condPtr.
        const condPtrIdx = this.bytecode.length
        this.bytecode.push(0)

        // But since we are iterating, we can't easily put blocks "after".
        // Let's use a separate buffer for conditions or just append to end of bytecode array later?
        // Simpler: Just append conditions NOW and link.
        // Oh wait, if I append now, the next transition header will be after the conditions.
        // That's fine. The bytecode is a flat array, pointers are absolute indices.
      }

      // Now fill the condition blocks for this state's transitions
      let transitionIdx = 0
      for (const targetName of transitionKeys) {
        const conditions = transitions[targetName] || {}

        // The location of the transition definition:
        // stateBlockPtr + 1 (count) + transitionIdx * 2
        const trBase = stateBlockPtr + 1 + transitionIdx * 2

        // Start condition block
        const condBlockPtr = this.bytecode.length
        this.bytecode[trBase + 1] = condBlockPtr // Link from transition to here

        this.compileConditions(conditions)
        transitionIdx++
      }
    }

    return {
      bytecode: new Uint32Array(this.bytecode),
      stateTableOffset,
      fieldMap: this.fields,
      stateMap: Object.fromEntries(this.states.map((s, i) => [s, i])),
    }
  }

  private buildFieldMap(schema: Record<string, any>) {
    // Naive schema mapping. In reality, should parse Zavx0z Schema.
    // Assuming schema is { key: "number" | "boolean" | ... }
    for (const key in schema) {
      const typeStr = String(schema[key]) // simplistic
      if (typeStr.includes("number")) {
        this.fields[key] = { type: TYPE.FLOAT, index: this.fieldCounters.float++ }
      } else {
        // bools, strings (interned), enums -> UINT
        this.fields[key] = { type: TYPE.UINT, index: this.fieldCounters.uint++ }
      }
    }
  }

  private compileConditions(wave: Wave) {
    const entries = Object.entries(wave)
    this.bytecode.push(entries.length)

    for (const [key, cond] of entries) {
      const field = this.fields[key]
      if (!field) throw new Error(`Unknown field in conditions: ${key}`)

      const checks = this.parseCondition(cond)
      for (const check of checks) {
        this.bytecode.push(field.type)
        this.bytecode.push(field.index)
        this.bytecode.push(check.op)
        this.bytecode.push(this.encodeValue(field.type, check.val))
      }
    }
  }

  private parseCondition(cond: ConditionValue): { op: number; val: any }[] {
    if (typeof cond !== "object" || cond === null) {
      return [{ op: OP.EQ, val: cond }]
    }

    const checks: { op: number; val: any }[] = []
    // Handle complex object { gt: 5, lte: 10 }
    for (const [k, v] of Object.entries(cond)) {
      switch (k) {
        case "eq":
          checks.push({ op: OP.EQ, val: v })
          break
        case "ne":
        case "notEq":
        case "neq":
          checks.push({ op: OP.NEQ, val: v })
          break
        case "gt":
          checks.push({ op: OP.GT, val: v })
          break
        case "lt":
          checks.push({ op: OP.LT, val: v })
          break
        case "gte":
          checks.push({ op: OP.GTE, val: v })
          break
        case "lte":
          checks.push({ op: OP.LTE, val: v })
          break
      }
    }
    return checks
  }

  private encodeValue(type: number, val: any): number {
    if (type === TYPE.FLOAT) {
      const buf = new Float32Array([Number(val)])
      return new Uint32Array(buf.buffer)[0]
    }
    if (type === TYPE.BOOL) {
      return val ? 1 : 0
    }
    // UINT / Strings
    if (typeof val === "string") {
      // TODO: Implement String Interning or HashMap
      return 0 // Placeholder
    }
    return Number(val)
  }
}
