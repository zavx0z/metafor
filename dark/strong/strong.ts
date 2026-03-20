import type { FieldsAST } from "@metafor/ast"
import type { DarkParticle } from "@dark/types"
import type { ParticleSeed } from "@dark/types/gravity"
import type { ParticleMaterialization } from "@dark/types/strong"
import type { WimpInit } from "@dark/types/part"
import { Axion, Fuzzy, Macho, Wimp } from "@dark/part"
import { createFieldValueResolvers, resolveNodeFieldValues } from "./fields.ts"

// Strong отвечает только за создание runtime particle и вычисление её локальных runtime values.
const materializeParticle = (
  seed: ParticleSeed,
  fieldResolvers?: ReturnType<typeof createFieldValueResolvers>,
): DarkParticle => {
  switch (seed.kind) {
    case "wimp": {
      const init: WimpInit = { src: seed.src }
      const values =
        seed.node.fields !== undefined && fieldResolvers !== undefined
          ? resolveNodeFieldValues(seed.node.fields, fieldResolvers)
          : undefined

      if (values !== undefined) init.values = values
      if (seed.node.mass !== undefined) init.mass = seed.node.mass

      return new Wimp(init)
    }
    case "fuzzy":
      return new Fuzzy()
    case "axion":
      return new Axion()
    case "macho":
      return new Macho()
  }
}

// Materialization слоя не трогает traversal и parent resolution: это остаётся обязанностью dark.
export const materializeParticles = (layer: ParticleSeed[], fields?: FieldsAST): ParticleMaterialization[] => {
  const materializations: ParticleMaterialization[] = []
  const fieldResolvers = fields ? createFieldValueResolvers(fields) : undefined

  for (const seed of layer) {
    const particle = materializeParticle(seed, fieldResolvers)
    materializations.push({ seed, particle })
  }

  return materializations
}
