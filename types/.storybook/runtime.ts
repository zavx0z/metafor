import {codeEditorCss} from "@ui/components/code-editor"
import type {
  Document,
  HTMLElement,
  Node,
} from "@zavx0z/dom"
import {
  graphDomStoryCss,
  type GraphDomStorySource,
} from "./stories/source.ts"
import type {GraphDomStory, GraphDomStoryFactory} from "./stories/dom-story.tsx"

type GraphRuntimeContext = Readonly<{
  document: Document
  signal: AbortSignal
  mount(node: Node): void
  publishInspector(value: unknown): void
  publishSource(value: unknown): void
  publishProps(value: unknown): void
  requestRender(): void
}>

type GraphRuntimeStoryInput = Readonly<{
  route: string
  story: unknown
  signal: AbortSignal
}>

/** Structural runtime for one persistent Graph package realm. */
export const runtime = Object.freeze({
  protocol: "storybook-runtime/1",
  create(context: GraphRuntimeContext) {
    let current: GraphDomStory | null = null
    let currentRoute = ""
    let disposed = false

    const publish = (): void => {
      if (current === null) return
      context.publishInspector(Object.freeze({
        route: currentRoute,
        kind: "Graph laboratory",
      }))
      context.publishSource(current.source)
      context.publishProps(current.args)
      context.requestRender()
    }
    const onMutation = (): void => publish()
    const unbind = (story: GraphDomStory): void => {
      for (const type of ["input", "change", "click"]) {
        story.element.removeEventListener(type, onMutation)
      }
    }
    const bind = (story: GraphDomStory): void => {
      for (const type of ["input", "change", "click"]) {
        story.element.addEventListener(type, onMutation)
      }
    }
    const show = (input: GraphRuntimeStoryInput): void => {
      assertActive(disposed)
      const factory = graphStoryFactory(input.story)
      const next = factory(context.document)
      if (input.signal.aborted) {
        next.dispose()
        return
      }
      if (current !== null) {
        unbind(current)
        current.dispose()
      }
      current = next
      currentRoute = exactRoute(input.route)
      bind(next)
      context.mount(next.element)
      publish()
    }
    const unmount = (): void => {
      if (current === null) return
      unbind(current)
      current.dispose()
      current = null
      currentRoute = ""
      context.publishInspector(null)
      context.publishSource(null)
      context.publishProps(null)
    }
    const dispose = (): void => {
      if (disposed) return
      disposed = true
      context.signal.removeEventListener("abort", dispose)
      unmount()
    }
    context.signal.addEventListener("abort", dispose, {once: true})

    return Object.freeze({
      styleSheets: Object.freeze([codeEditorCss, graphDomStoryCss]),
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
