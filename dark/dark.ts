import { loadMetaEntry, normalizeSchemaAddress } from "./load"
import { dark$ } from "./store"
import { createChildren, materializeDarkAtoms, resetGravity } from "./gravity/gravity"

type GravityNode = {
  type?: string
  child?: GravityNode[]
  string?: Record<string, unknown>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function getNodeChildren(node: GravityNode): GravityNode[] {
  return Array.isArray(node.child) ? node.child : []
}

function isMetaNode(node: GravityNode): boolean {
  return node.type === "meta"
}

function getStaticMetaAddress(node: GravityNode): string | null {
  if (!isRecord(node.string)) {
    return null
  }

  const src = node.string.src
  return typeof src === "string" ? normalizeSchemaAddress(src) : null
}

function createAssemblyChildAddress(rootAddress: string, index: number): string {
  return `${rootAddress}#atom/${index}`
}

/**
 * Главный dirty orchestrator пакета Dark.
 *
 * Координирует schema loading, Gravity-stage и final mutation `dark$`.
 */
export async function load(metaPath: string): Promise<void> {
  dark$.reset()
  resetGravity()

  let nextAtomIndex = 0

  const ensureMetaLoaded = async (metaSource: string): Promise<string> => {
    const { metaAddress, ast } = await loadMetaEntry(metaSource)

    if (!dark$.getMeta(metaAddress)) {
      dark$.setMeta(metaAddress, ast)
    }

    return metaAddress
  }

  const walk = async (parentAddress: string, nodes: readonly GravityNode[], rootAddress: string): Promise<void> => {
    for (const node of nodes) {
      if (isMetaNode(node)) {
        const childMetaAddress = getStaticMetaAddress(node)
        if (!childMetaAddress) {
          continue
        }

        await ensureMetaLoaded(childMetaAddress)

        const childAtom = createChildren(parentAddress, {
          address: createAssemblyChildAddress(rootAddress, ++nextAtomIndex),
          meta: childMetaAddress,
        })

        await walk(childAtom.address, getNodeChildren(node), rootAddress)
        continue
      }

      await walk(parentAddress, getNodeChildren(node), rootAddress)
    }
  }

  const { metaAddress, ast } = await loadMetaEntry(metaPath)
  dark$.setMeta(metaAddress, ast)

  createChildren(null, {
    address: metaAddress,
    meta: metaAddress,
  })

  await walk(metaAddress, (ast.gravity ?? []) as GravityNode[], metaAddress)

  dark$.restore({
    meta: new Map(dark$.meta),
    atom: materializeDarkAtoms(),
  })
}
