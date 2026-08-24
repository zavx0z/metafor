export type PlaygroundRouteTreeOverviewNode = Readonly<{
  kind: "overview"
  path: string
  segment: string
  parentPath: string | null
  depth: number
}>

export type PlaygroundRouteTreeLeafNode<Leaf extends string> = Readonly<{
  kind: "leaf"
  path: Leaf
  segment: string
  parentPath: string
  depth: number
}>

export type PlaygroundRouteTreeNode<Leaf extends string = string> =
  | PlaygroundRouteTreeOverviewNode
  | PlaygroundRouteTreeLeafNode<Leaf>

export type PlaygroundRouteTree<Leaf extends string = string> = Readonly<{
  leaves: readonly Leaf[]
  overviews: readonly string[]
  nodes: readonly PlaygroundRouteTreeNode<Leaf>[]
  find(path: string): PlaygroundRouteTreeNode<Leaf> | undefined
  children(path: string): readonly PlaygroundRouteTreeNode<Leaf>[]
}>

export type PlaygroundRouteTreeInput<Leaves extends readonly string[]> = Readonly<{
  leaves: Leaves
}>

export type PlaygroundRouteTreeOptions = Readonly<{
  basePath?: string
}>

export type PlaygroundRouteTreeResolution<Leaf extends string = string> =
  | Readonly<{
      kind: "match"
      node: PlaygroundRouteTreeNode<Leaf>
      canonicalPath: string
      redirect: boolean
    }>
  | Readonly<{kind: "not-found"}>

/** Builds root overview, every proper prefix overview and exact leaves. */
export function definePlaygroundRouteTree<const Leaves extends readonly string[]>(
  input: PlaygroundRouteTreeInput<Leaves>,
): PlaygroundRouteTree<Leaves[number]> {
  const leaves = Object.freeze(input.leaves.map((leaf) => validateLeaf(leaf))) as readonly Leaves[number][]
  if (new Set(leaves).size !== leaves.length) throw new Error("Playground route tree leaves must be unique")

  type Leaf = Leaves[number]
  const nodeByPath = new Map<string, PlaygroundRouteTreeNode<Leaf>>()
  const childrenByPath = new Map<string, PlaygroundRouteTreeNode<Leaf>[]>()
  const nodes: PlaygroundRouteTreeNode<Leaf>[] = []
  const overviews: string[] = []

  const addNode = (node: PlaygroundRouteTreeNode<Leaf>): void => {
    const existing = nodeByPath.get(node.path)
    if (existing !== undefined) {
      if (existing.kind !== node.kind) {
        throw new Error(`Playground route tree leaf conflicts with overview: ${node.path}`)
      }
      return
    }
    nodeByPath.set(node.path, node)
    nodes.push(node)
    if (node.kind === "overview") overviews.push(node.path)
    if (node.parentPath !== null) {
      const children = childrenByPath.get(node.parentPath) ?? []
      children.push(node)
      childrenByPath.set(node.parentPath, children)
    }
  }

  addNode(overviewNode(""))
  for (const leaf of leaves) {
    const segments = leaf.split("/")
    for (let depth = 1; depth < segments.length; depth += 1) {
      const path = segments.slice(0, depth).join("/")
      const existing = nodeByPath.get(path)
      if (existing?.kind === "leaf") {
        throw new Error(`Playground route tree leaf cannot contain another leaf: ${path}`)
      }
      addNode(overviewNode(path))
    }
    const existing = nodeByPath.get(leaf)
    if (existing !== undefined) {
      throw new Error(`Playground route tree leaf conflicts with overview: ${leaf}`)
    }
    addNode(Object.freeze({
      kind: "leaf",
      path: leaf,
      segment: segments.at(-1)!,
      parentPath: segments.slice(0, -1).join("/"),
      depth: segments.length,
    }))
  }

  for (const children of childrenByPath.values()) Object.freeze(children)
  return Object.freeze({
    leaves,
    overviews: Object.freeze(overviews),
    nodes: Object.freeze(nodes),
    find(path: string) {
      return nodeByPath.get(normalizeLookupPath(path))
    },
    children(path: string) {
      const normalized = normalizeLookupPath(path)
      if (!nodeByPath.has(normalized)) throw new Error(`Unknown playground route tree node: ${path}`)
      return childrenByPath.get(normalized) ?? Object.freeze([])
    },
  })
}

/** Resolves only exact tree nodes and reports whether the pathname needs canonical redirect. */
export function resolvePlaygroundRouteTree<Leaf extends string>(
  tree: PlaygroundRouteTree<Leaf>,
  location: Readonly<{pathname: string}>,
  options: PlaygroundRouteTreeOptions = {},
): PlaygroundRouteTreeResolution<Leaf> {
  const basePath = normalizeBasePath(options.basePath)
  const pathname = normalizeInputPathname(location.pathname)
  const localPath = localPathWithinMount(pathname, basePath)
  if (localPath === null) return Object.freeze({kind: "not-found"})
  const node = tree.find(localPath)
  if (node === undefined) return Object.freeze({kind: "not-found"})
  const canonicalPath = playgroundRouteTreeUrl(tree, node.path, {basePath})
  return Object.freeze({
    kind: "match",
    node,
    canonicalPath,
    redirect: pathname !== canonicalPath,
  })
}

/** Returns an overview URL with trailing slash or an exact leaf URL without it. */
export function playgroundRouteTreeUrl<Leaf extends string>(
  tree: PlaygroundRouteTree<Leaf>,
  path: string,
  options: PlaygroundRouteTreeOptions = {},
): string {
  const node = tree.find(path)
  if (node === undefined) throw new Error(`Unknown playground route tree node: ${path}`)
  const basePath = normalizeBasePath(options.basePath)
  if (node.path.length === 0) return basePath === "" ? "/" : `${basePath}/`
  const url = `${basePath}/${node.path}`
  return node.kind === "overview" ? `${url}/` : url
}

function overviewNode(path: string): PlaygroundRouteTreeOverviewNode {
  const segments = path.length === 0 ? [] : path.split("/")
  return Object.freeze({
    kind: "overview",
    path,
    segment: segments.at(-1) ?? "",
    parentPath: segments.length === 0 ? null : segments.slice(0, -1).join("/"),
    depth: segments.length,
  })
}

function validateLeaf(value: string): string {
  if (value.length === 0 || value.startsWith("/") || value.endsWith("/") ||
    value.includes("//") || /[?#]/.test(value)) {
    throw new Error(`Playground route tree leaf must be a normalized pathname id: ${value}`)
  }
  return value
}

function normalizeLookupPath(path: string): string {
  if (path === "" || path === "/") return ""
  return path.replace(/^\/+|\/+$/g, "")
}

function normalizeBasePath(value: string | undefined): string {
  if (value === undefined || value === "" || value === "/") return ""
  const path = value.replace(/^\/+|\/+$/g, "")
  if (path.length === 0) return ""
  validateLeaf(path)
  return `/${path}`
}

function normalizeInputPathname(value: string): string {
  if (value.length === 0) return "/"
  return value.startsWith("/") ? value : `/${value}`
}

function localPathWithinMount(pathname: string, basePath: string): string | null {
  let local: string
  if (basePath === "") local = pathname.slice(1)
  else if (pathname === basePath) local = ""
  else if (pathname.startsWith(`${basePath}/`)) local = pathname.slice(basePath.length + 1)
  else return null

  const path = local.replace(/\/+$/g, "")
  if (path.startsWith("/") || path.includes("//")) return null
  return path
}
