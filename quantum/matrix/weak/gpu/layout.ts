import { createStringAtlasExport } from "./string-pack"
import type { WeakStepMode } from "@matrix/types/weak"
import { StepMode } from "../constants"

export function createUniforms(braneCount: number, mode: WeakStepMode = StepMode.Full): Uint32Array {
  return new Uint32Array([braneCount, mode, 0, 0])
}

export function resolveStringTableBuffers(stringTable: string[]): { registry: Uint32Array; heap: Uint32Array } {
  const atlasExport = createStringAtlasExport(stringTable)
  return {
    registry: atlasExport.registry.length > 0 ? atlasExport.registry : new Uint32Array(1),
    heap: atlasExport.heap.length > 0 ? atlasExport.heap : new Uint32Array(1),
  }
}
