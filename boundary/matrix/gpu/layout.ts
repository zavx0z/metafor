import type { StringAtlasExport } from "@boundary/atlas"

export function createUniforms(braneCount: number): Uint32Array {
  return new Uint32Array([braneCount, 0, 0, 0])
}

export function resolveAtlasBuffers(atlasExport: StringAtlasExport): { registry: Uint32Array; heap: Uint32Array } {
  return {
    registry: atlasExport.registry.length > 0 ? atlasExport.registry : new Uint32Array(1),
    heap: atlasExport.heap.length > 0 ? atlasExport.heap : new Uint32Array(1),
  }
}
