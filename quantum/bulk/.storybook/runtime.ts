import type {
  Document,
  Node,
} from "@zavx0z/dom"
import {
  bulkHudStoryCss,
  type BulkHudDomStory,
} from "./stories/hud.ts"

type BulkRuntimeContext = Readonly<{
  document: Document
  signal: AbortSignal
  mount(node: Node): void
  publishInspector(value: unknown): void
  publishSource(value: unknown): void
  publishProps(value: unknown): void
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
  protocol: "storybook-runtime/1",
  create(context: BulkRuntimeContext) {
    let current: BulkHudDomStory | null = null
    let currentRoute = ""
    let disposed = false

    const publish = (): void => {
      if (current === null) return
      context.publishInspector(Object.freeze({route: currentRoute, kind: "Bulk HUD"}))
      context.publishSource(current.source)
      context.publishProps(current.props)
      context.requestRender()
    }
    const onMutation = (): void => publish()
    const unbind = (story: BulkHudDomStory): void => {
      for (const type of ["input", "change", "click"]) {
        story.element.removeEventListener(type, onMutation)
      }
    }
    const bind = (story: BulkHudDomStory): void => {
      for (const type of ["input", "change", "click"]) {
        story.element.addEventListener(type, onMutation)
      }
    }
    const show = (input: BulkRuntimeStoryInput): void => {
      assertActive(disposed)
      const factory = bulkStoryFactory(input.story)
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
      styleSheets: Object.freeze([bulkHudStoryCss]),
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
