import type {
  Document,
  Node,
} from "@zavx0z/dom"
import {
  type BulkHudDomStory,
} from "./stories/hud.ts"

type BulkRuntimeContext = Readonly<{
  document: Document
  signal: AbortSignal
  projection: "hud"
  present(value: Readonly<{
    protocol: "story-presentation/1"
    node: Node
    componentRoot: Readonly<{readStyleSheets(): unknown}>
    source: Readonly<{html: string; typescript: string}>
    values?: Readonly<Record<string, unknown>>
  }>): void
  reportDiagnostic(value: unknown): void
  requestRender(): void
}>

type BulkRuntimeStoryInput = Readonly<{
  route: string
  story: unknown
  signal: AbortSignal
}>

type BulkStoryFactory = (document: Document) => BulkHudDomStory

/** Structural runtime for the independently updateable Bulk package tab. */
export const runtime = Object.freeze({
  protocol: "storybook-runtime/3",
  create(context: BulkRuntimeContext) {
    if (context.projection !== "hud") {
      throw new Error(`Bulk Storybook requires hud projection: ${String(context.projection)}`)
    }
    let current: BulkHudDomStory | null = null
    let unsubscribeCurrent: (() => void) | null = null
    let operation = 0
    let disposed = false

    const show = async (input: BulkRuntimeStoryInput): Promise<void> => {
      assertActive(disposed)
      exactRoute(input.route)
      if (context.signal.aborted || input.signal.aborted) return
      const epoch = ++operation
      const factory = bulkStoryFactory(input.story)
      const next = factory(context.document)
      await next.ready
      if (disposed || context.signal.aborted || input.signal.aborted || epoch !== operation) {
        next.dispose()
        return
      }
      if (current !== null) {
        unsubscribeCurrent?.()
        unsubscribeCurrent = null
        current.dispose()
      }
      current = next
      unsubscribeCurrent = next.subscribe(context.requestRender)
      context.present(Object.freeze({
        protocol: "story-presentation/1",
        node: next.element,
        componentRoot: next.componentRoot,
        source: next.source,
        values: Object.freeze({props: next.props}),
      }))
      context.requestRender()
    }
    const unmount = (): void => {
      operation += 1
      if (current === null) return
      unsubscribeCurrent?.()
      unsubscribeCurrent = null
      current.dispose()
      current = null
    }
    const dispose = (): void => {
      if (disposed) return
      disposed = true
      context.signal.removeEventListener("abort", dispose)
      unmount()
    }
    context.signal.addEventListener("abort", dispose, {once: true})

    return Object.freeze({
      mount: show,
      update: show,
      unmount,
      dispose,
    })
  },
})

function bulkStoryFactory(value: unknown): BulkStoryFactory {
  if (typeof value !== "function") {
    throw new TypeError("Bulk Storybook module export must be a story factory")
  }
  return value as BulkStoryFactory
}

function exactRoute(value: string): string {
  if (typeof value !== "string" || value.length === 0 || value.startsWith("/") ||
    value.endsWith("/") || value.includes("//")) {
    throw new Error(`Invalid Bulk Storybook route: ${String(value)}`)
  }
  return value
}

function assertActive(disposed: boolean): void {
  if (disposed) throw new Error("Bulk Storybook runtime is disposed")
}
