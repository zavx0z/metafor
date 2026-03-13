import type { MetaAST } from "@metafor/ast"
import { dark$ } from "./store"
import { createChildren, materializeDarkAtoms } from "./gravity/pipeline"
import { gravity$ } from "./gravity/store"

type GravityNode = {
  type?: string
  child?: GravityNode[]
  string?: Record<string, unknown>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function normalizeSchemaAddress(schemaPath: string): string {
  const trimmed = schemaPath.trim().replace(/\/+$/, "")

  if (!trimmed) {
    return "/"
  }

  if (trimmed.endsWith("/meta.json")) {
    return normalizeSchemaAddress(trimmed.slice(0, -"/meta.json".length))
  }

  return trimmed
}

function resolveMetaSource(metaPath: string): { metaAddress: string; sourcePath: string } {
  const trimmed = metaPath.trim().replace(/\/+$/, "")

  if (trimmed.endsWith(".json")) {
    return {
      metaAddress: normalizeSchemaAddress(trimmed),
      sourcePath: trimmed,
    }
  }

  const metaAddress = normalizeSchemaAddress(trimmed || "/")
  const sourcePath =
    metaAddress === "/"
      ? "/meta.json"
      : metaAddress.startsWith("/") || metaAddress.startsWith(".")
        ? `${metaAddress}/meta.json`
        : `/${metaAddress}/meta.json`

  return { metaAddress, sourcePath }
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

export async function loadMetaAST(metaPath: string): Promise<MetaAST | undefined> {
  const { sourcePath } = resolveMetaSource(metaPath)

  try {
    const response = await fetch(sourcePath)

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    return (await response.json()) as MetaAST
  } catch (error) {
    console.error(error)
    return undefined
  }
}

async function loadMetaEntry(metaPath: string): Promise<{ metaAddress: string; ast: MetaAST }> {
  const { metaAddress } = resolveMetaSource(metaPath)
  const ast = await loadMetaAST(metaPath)

  if (!ast) {
    throw new Error(`Unable to load dark schema from "${metaPath}"`)
  }

  return { metaAddress, ast }
}

/**
 * Единственный loader entry point пакета Dark.
 *
 * Последовательность:
 * 1. загружает schema через loader contract,
 * 2. пишет schema в `dark$.meta`,
 * 3. собирает structural tree в `gravity$`,
 * 4. материализует final atoms в `dark$.atom`.
 */
export async function load(metaPath: string): Promise<void> {
  dark$.reset()
  gravity$.reset()

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
