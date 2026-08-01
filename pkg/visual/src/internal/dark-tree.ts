import type {
  BulkDarkParticle,
  BulkManifest,
} from "@metafor/types/bulk/manifest"

export type DarkTreeNode = {
  children: DarkTreeNode[]
  particle: BulkDarkParticle
}

export const MAX_VISUAL_TOPOLOGY_DEPTH = 256
export const MAX_VISUAL_TOPOLOGY_NODES = 10_000

export const compareDarkParticles = (
  left: BulkDarkParticle,
  right: BulkDarkParticle,
): number =>
  left.depth - right.depth ||
  left.darkParticleOrder - right.darkParticleOrder ||
  left.darkParticleId - right.darkParticleId

/**
 * Builds one deterministic forest without changing the supplied manifestation.
 * Broken ownership is rejected before recursive composition.
 */
export const buildDarkParticleForest = (
  manifest: Pick<BulkManifest, "darkParticles">,
): readonly DarkTreeNode[] => {
  const particles = [...manifest.darkParticles].sort(compareDarkParticles)
  if (particles.length > MAX_VISUAL_TOPOLOGY_NODES) {
    throw new RangeError(
      `Visual topology node count ${particles.length} exceeds ${MAX_VISUAL_TOPOLOGY_NODES}`,
    )
  }
  const nodeById = new Map<number, DarkTreeNode>()
  for (const particle of particles) {
    if (nodeById.has(particle.darkParticleId)) {
      throw new Error(
        `Visual topology duplicates Dark particle ${particle.darkParticleId}`,
      )
    }
    nodeById.set(particle.darkParticleId, {
      children: [],
      particle,
    })
  }

  const roots: DarkTreeNode[] = []
  for (const particle of particles) {
    const node = nodeById.get(particle.darkParticleId)!
    const parent = particle.parentDarkParticleId === null
      ? undefined
      : nodeById.get(particle.parentDarkParticleId)
    if (particle.parentDarkParticleId === null) {
      roots.push(node)
    } else if (!parent) {
      throw new Error(
        `Visual topology parent ${particle.parentDarkParticleId} is absent for ${particle.darkParticleId}`,
      )
    } else {
      parent.children.push(node)
    }
  }

  for (const node of nodeById.values()) {
    node.children.sort((left, right) =>
      compareDarkParticles(left.particle, right.particle)
    )
  }

  const visitState = new Map<number, "visiting" | "visited">()
  const validate = (root: DarkTreeNode): void => {
    const stack: Array<Readonly<{
      depth: number
      exiting: boolean
      node: DarkTreeNode
    }>> = [{depth: 1, exiting: false, node: root}]
    while (stack.length > 0) {
      const frame = stack.pop()!
      const id = frame.node.particle.darkParticleId
      if (frame.exiting) {
        visitState.set(id, "visited")
        continue
      }
      const state = visitState.get(id)
      if (state === "visited") continue
      if (state === "visiting") {
        throw new Error(`Visual topology contains a cycle at ${id}`)
      }
      if (frame.depth > MAX_VISUAL_TOPOLOGY_DEPTH) {
        throw new RangeError(
          `Visual topology depth ${frame.depth} exceeds ${MAX_VISUAL_TOPOLOGY_DEPTH}`,
        )
      }
      visitState.set(id, "visiting")
      stack.push({...frame, exiting: true})
      for (
        let index = frame.node.children.length - 1;
        index >= 0;
        index -= 1
      ) {
        stack.push({
          depth: frame.depth + 1,
          exiting: false,
          node: frame.node.children[index]!,
        })
      }
    }
  }
  roots.forEach(validate)
  for (const node of nodeById.values()) {
    if (!visitState.has(node.particle.darkParticleId)) validate(node)
  }
  return roots
}

export const collectDarkTreeIds = (
  root: DarkTreeNode,
): ReadonlySet<number> => {
  const ids = new Set<number>()
  const stack = [root]
  while (stack.length > 0) {
    const node = stack.pop()!
    ids.add(node.particle.darkParticleId)
    stack.push(...node.children)
  }
  return ids
}
