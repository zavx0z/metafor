import type { MetaAST } from "@metafor/ast"
import { gravity$ } from "./gravity/store"
import { dark$, restoreDarkFromGravity } from "./store"

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

async function fetchMetaAST(metaPath: string): Promise<{ metaAddress: string; ast: MetaAST }> {
  const { metaAddress, sourcePath } = resolveMetaSource(metaPath)
  const response = await fetch(sourcePath)

  if (!response.ok) {
    throw new Error(`Unable to load dark schema from "${sourcePath}" (${response.status} ${response.statusText})`)
  }

  const ast = (await response.json()) as MetaAST
  return { metaAddress, ast }
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

async function buildDarkAssembly(metaAddress: string, ast: MetaAST) {
  const assembly = gravity$.createState<MetaAST>()
  let nextAtomIndex = 0
  const loadedMeta = new Set<string>()

  const ensureMetaLoaded = async (childMetaAddress: string): Promise<void> => {
    if (loadedMeta.has(childMetaAddress) || assembly.meta.has(childMetaAddress)) {
      return
    }

    loadedMeta.add(childMetaAddress)
    const { ast: childAst } = await fetchMetaAST(childMetaAddress)
    assembly.meta.set(childMetaAddress, childAst)
  }

  const walk = async (parentAddress: string, nodes: readonly GravityNode[]): Promise<void> => {
    for (const node of nodes) {
      if (isMetaNode(node)) {
        const childMetaAddress = getStaticMetaAddress(node)
        if (!childMetaAddress) {
          continue
        }

        await ensureMetaLoaded(childMetaAddress)

        const childAtom = gravity$.createChildren(
          parentAddress,
          {
            address: createAssemblyChildAddress(metaAddress, ++nextAtomIndex),
            meta: childMetaAddress,
          },
          assembly,
        )

        await walk(childAtom.address, getNodeChildren(node))
        continue
      }

      await walk(parentAddress, getNodeChildren(node))
    }
  }

  assembly.meta.set(metaAddress, ast)
  gravity$.createChildren(
    null,
    {
      address: metaAddress,
      meta: metaAddress,
    },
    assembly,
  )

  await walk(metaAddress, (ast.gravity ?? []) as GravityNode[])

  return gravity$.snapshot(assembly)
}

/**
 * Загружает schema в Dark pipeline:
 * - schema попадает в `dark.meta`
 * - atom tree собирается через temporary gravity-state
 * - assembled atoms переносятся в `dark.atom`
 */
export async function load(metaPath: string): Promise<void> {
  const { metaAddress, ast } = await fetchMetaAST(metaPath)
  const snapshot = await buildDarkAssembly(metaAddress, ast)

  dark$.reset()
  restoreDarkFromGravity(snapshot)
}
