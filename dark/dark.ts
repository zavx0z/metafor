import { Wimp } from "@dark/part"
import type { MetaAST } from "@metafor/ast"
import { particleGenerator } from "@dark/gravity/gravity"
import { dark$ } from "./store"

export const matterPipeline = (wimp: Wimp, ast: Pick<MetaAST, "matter" | "fields">, parent?: Wimp): Wimp[] => {
  dark$.particles.set(wimp.id, wimp)
  dark$.meta.set(wimp.id, wimp.src)
  if (parent) dark$.parent.set(wimp, parent)

  if (!ast.matter) return []

  const wimps: Wimp[] = []

  for (const layer of particleGenerator(wimp, ast.matter, ast.fields)) {
    for (const { particle, parent } of layer) {
      parent.children.add(particle.id)
      if (particle instanceof Wimp) {
        wimps.push(particle)
      }
      dark$.particles.set(particle.id, parent)
      dark$.parent.set(particle, parent)
    }
  }
  return wimps
}
