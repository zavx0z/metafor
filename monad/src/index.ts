import { GPUBackend } from "./backend"
import { RulesCompiler } from "./compiler"
import { TYPE } from "./common"

export class MonadSystem {
  private backend: GPUBackend
  private compiler = new RulesCompiler()

  // Maps
  private stateMap: Record<string, number> = {}
  private reverseStateMap: string[] = []
  private fieldMap: Record<string, { type: number; index: number }> = {}

  constructor(device: GPUDevice) {
    this.backend = new GPUBackend(device)
  }

  async init(config: {
    statesConfig: any // Superposition
    contextSchema: any
    monads: Array<{ id: string; state: string; context: any }>
    globalContextSize: { floats: number; uints: number }
  }) {
    // 1. Compile Rules
    const compiled = this.compiler.compile(config.statesConfig, config.contextSchema)
    this.stateMap = compiled.stateMap
    this.reverseStateMap = Object.keys(compiled.stateMap)
    this.fieldMap = compiled.fieldMap

    // 2. Prepare Data Buffers
    const monadCount = config.monads.length
    const states = new Uint32Array(monadCount)

    // Context Map: monad -> local indices -> global indices
    // We need to know how many fields per monad. Assuming all monads share the Schema.
    const fieldsCount = Object.keys(this.fieldMap).length
    const contextMap = new Uint32Array(monadCount * fieldsCount)

    // Init Monads Data
    config.monads.forEach((m, idx) => {
      states[idx] = this.stateMap[m.state] ?? 0

      // Here we map local fields to global slots.
      // In a real scenario, 'm.context' might contain pointers or we allocate slots now.
      // Simplification: We assume CPU orchestrator manages Global Context Allocation separately
      // and passes us the indices.
      // For this demo, let's assume m.context IS the list of global indices.

      // Example: m.context = { hp: 10, pos: 15 } where 10 and 15 are global indices.
      for (const [key, globalIdx] of Object.entries(m.context)) {
        const field = this.fieldMap[key]
        if (field) {
          contextMap[idx * fieldsCount + field.index] = Number(globalIdx)
        }
      }
    })

    // 3. Init Backend
    await this.backend.init({
      monadCount,
      mapStride: fieldsCount,
      bytecode: compiled.bytecode,
      states,
      contextMap,
      globalFloats: new Float32Array(config.globalContextSize.floats),
      globalUints: new Uint32Array(config.globalContextSize.uints),
      tableOffset: compiled.stateTableOffset,
    })
  }

  updateContext(globalUpdates: Record<number, number | boolean>, type: "float" | "uint") {
    // In production, buffer writes
    // For now, we update one by one or create a big array.
    // API requires array.
    // Simplified wrapper:
    for (const [idx, val] of Object.entries(globalUpdates)) {
      const arr = type === "float" ? new Float32Array([Number(val)]) : new Uint32Array([Number(val)])
      this.backend.writeGlobal(Number(idx) * 4, arr, type)
    }
  }

  step() {
    this.backend.run()
  }

  async getStates(): Promise<string[]> {
    const raw = await this.backend.read()
    return Array.from(raw).map((id) => this.reverseStateMap[id])
  }
}
