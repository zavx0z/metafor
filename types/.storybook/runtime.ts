import type {
  Document,
  Node,
} from "@zavx0z/dom"
import type {GraphDomStorySource} from "./stories/source.ts"
import type {GraphDomStory, GraphDomStoryFactory} from "./stories/dom-story.tsx"

type GraphRuntimeContext = Readonly<{
  document: Document
  signal: AbortSignal
  projection: "display"
  present(value: Readonly<{
    protocol: "story-presentation/1"
    node: Node
    componentRoot: Readonly<{readStyleSheets(): unknown}>
    source: GraphDomStorySource
    values?: Readonly<Record<string, unknown>>
  }>): void
  reportDiagnostic(value: unknown): void
  requestRender(): void
}>

type GraphRuntimeStoryInput = Readonly<{
  route: string
  story: unknown
  signal: AbortSignal
}>

/** Structural runtime for one persistent Graph package realm. */
export const runtime = Object.freeze({
  protocol: "storybook-runtime/3",
  create(context: GraphRuntimeContext) {
    if (context.projection !== "display") {
      throw new Error(`MetaFor Graph Storybook requires display projection: ${String(context.projection)}`)
    }
    let current: GraphDomStory | null = null
    let disposed = false

    const show = (input: GraphRuntimeStoryInput): void => {
      assertActive(disposed)
      exactRoute(input.route)
      if (context.signal.aborted || input.signal.aborted) return
      const factory = graphStoryFactory(input.story)
      const next = factory(context.document)
      if (context.signal.aborted || input.signal.aborted) {
        next.dispose()
        return
      }
      if (current !== null) {
        current.dispose()
      }
      current = next
      context.present(Object.freeze({
        protocol: "story-presentation/1",
        node: next.element,
        componentRoot: next.componentRoot,
        source: next.source,
        values: Object.freeze({props: next.args}),
      }))
    }
    const unmount = (): void => {
      if (current === null) return
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

export type {GraphDomStorySource}

function graphStoryFactory(value: unknown): GraphDomStoryFactory {
  if (typeof value !== "function") {
    throw new TypeError("Graph Storybook module export must be a story factory")
  }
  return value as GraphDomStoryFactory
}

function exactRoute(value: string): string {
  if (typeof value !== "string" || value.length === 0 || value.startsWith("/") ||
    value.endsWith("/") || value.includes("//")) {
    throw new Error(`Invalid Graph Storybook route: ${String(value)}`)
  }
  return value
}

function assertActive(disposed: boolean): void {
  if (disposed) throw new Error("Graph Storybook runtime is disposed")
}
