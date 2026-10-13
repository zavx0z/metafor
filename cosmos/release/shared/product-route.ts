import type {AtomRef, Graph, RuntimeAtom, RuntimeNode} from "@metafor/types/metafor/graph"

/** Адресная проекция release: Verse назначает caller, Atom использует opaque suffix публичного AtomRef. */
export type ProductRoute = {kind: "root"} | {kind: "networks"} | {kind: "atom"; verseId: string; atomId: string}

/** Один наблюдаемый Verse. Causal identity хранится отдельно и не становится адресом Verse. */
export interface ProductRouteContext {
  status: "loading" | "ready" | "unavailable"
  verseId: string | null
  graph: Graph | null
  observedWorld?: {root: string; cutId: string}
  error?: string
}

/** Read-only результат адресации; отсутствие сущности не подменяется первым доступным Agent. */
export type ProductRouteResolution =
  | {kind: "atom"; verseId: string; atomId: string; ref: AtomRef; atom: RuntimeAtom; graph: Graph}
  | {kind: "networks"}
  | {kind: "loading"}
  | {kind: "unavailable"; error: string}
  | {kind: "noSuchVerse"; verseId: string}
  | {kind: "noSuchAtom"; verseId: string; atomId: string | null}
  | {kind: "invalidRoute"; pathname: string}

const services = new Set(["agents", "oracle", "release", "assets", "code", "sw", "peer", "force", "health", "ws", "clients", "_quantum", "networks", "manifest.webmanifest", "favicon.ico"])
const opaque = (value: string) => value.length > 0 && value.length <= 256 && value.trim() === value &&
  value !== "." && value !== ".." && !/[\u0000-\u0020\u007f/\\]/u.test(value)
const verse = (value: string) => opaque(value) && !services.has(value) && !value.startsWith("@")

/** Закрытый positional codec `/<verseId>/<atomId>`; служебные namespaces исключены из HTML fallback. */
export function parseProductRoute(pathname: string): ProductRoute | null {
  if (pathname === "/") return {kind: "root"}
  if (pathname === "/networks") return {kind: "networks"}
  const segments = pathname.split("/")
  if (segments.length !== 3 || segments[0] !== "") return null
  try {
    const verseId = decodeURIComponent(segments[1]!), atomId = decodeURIComponent(segments[2]!)
    return verse(verseId) && opaque(atomId) ? {kind: "atom", verseId, atomId} : null
  } catch {return null}
}

/** Кодирует только product routes; malformed identity отклоняется до History mutation. */
export function productRoutePath(route: ProductRoute): string {
  if (route.kind === "root") return "/"
  if (route.kind === "networks") return "/networks"
  if (!verse(route.verseId) || !opaque(route.atomId)) throw new Error("Invalid Verse or Atom address")
  return `/${encodeURIComponent(route.verseId)}/${encodeURIComponent(route.atomId)}`
}

/** Только синтаксически распознанные product paths получают HTML shell; API остаются у своих owners. */
export const isProductPath = (pathname: string): boolean => parseProductRoute(pathname) !== null

/** Разрешает выбор в полученном публичном Graph без RPC и canonical writes. См. release README, spec/product-router.spec.ts. */
export function resolveProductRoute(route: ProductRoute | null, context: ProductRouteContext, pathname = ""): ProductRouteResolution {
  if (!route) return {kind: "invalidRoute", pathname}
  if (route.kind === "networks") return route
  if (context.status === "loading") return {kind: "loading"}
  if (context.status === "unavailable" || !context.graph || !context.verseId)
    return {kind: "unavailable", error: context.error ?? "Verse address context is unavailable"}
  if (!verse(context.verseId)) return {kind: "unavailable", error: "Invalid assigned Verse address"}
  if (route.kind === "atom" && route.verseId !== context.verseId) return {kind: "noSuchVerse", verseId: route.verseId}
  const graph = context.graph
  let atom: RuntimeAtom | undefined
  if (route.kind === "root") {
    const roots = graph.runtime.roots.filter((node): node is RuntimeAtom => node.kind === "atom" && node.meta === graph.root)
    if (roots.length === 1) atom = roots[0]
  } else {
    const ref: AtomRef = `atom:${route.atomId}`
    const pending: RuntimeNode[] = [...graph.runtime.roots]
    while (pending.length) {
      const node = pending.pop()!
      if (node.kind === "atom" && node.ref === ref) {atom = node; break}
      if (node.children) pending.push(...node.children)
    }
  }
  if (!atom) return {kind: "noSuchAtom", verseId: context.verseId, atomId: route.kind === "atom" ? route.atomId : null}
  const atomId = atom.ref.slice("atom:".length)
  if (!opaque(atomId)) return {kind: "unavailable", error: "Atom identity cannot be addressed"}
  return {kind: "atom", verseId: context.verseId, atomId, ref: atom.ref, atom, graph}
}
