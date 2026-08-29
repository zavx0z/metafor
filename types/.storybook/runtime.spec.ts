import {describe, expect, test} from "bun:test"
import {createDocument} from "@zavx0z/dom"
import {runtime} from "./runtime.ts"
import type {GraphDomStory} from "./stories/dom-story.tsx"

describe("MetaFor Graph external runtime", () => {
  test("keeps one host Document while replacing only owner preview controllers", () => {
    const document = createDocument()
    const mounted: unknown[] = []
    const sources: unknown[] = []
    const props: unknown[] = []
    const lifetime = new AbortController()
    let disposed = 0
    const factory = (): GraphDomStory => {
      const element = document.createElement("section")
      const args = Object.freeze({version: mounted.length})
      return Object.freeze({
        element,
        args,
        source: Object.freeze({html: "<section></section>", css: "", typescript: ""}),
        dispose() { disposed += 1 },
      })
    }
    const session = runtime.create({
      document,
      signal: lifetime.signal,
      mount(node: unknown) { mounted.push(node) },
      publishInspector() {},
      publishSource(value: unknown) { sources.push(value) },
      publishProps(value: unknown) { props.push(value) },
      requestRender() {},
    } as never)
    const routeSignal = new AbortController()

    session.mount({
      route: "graph/document/current/complete",
      story: factory,
      signal: routeSignal.signal,
    })
    session.update?.({
      route: "graph/document/current/complete",
      story: factory,
      signal: routeSignal.signal,
    })
    expect(mounted).toHaveLength(2)
    expect((mounted[0] as {ownerDocument: unknown}).ownerDocument).toBe(document)
    expect((mounted[1] as {ownerDocument: unknown}).ownerDocument).toBe(document)
    expect(disposed).toBe(1)
    expect(sources).toHaveLength(2)
    expect(props).toEqual([{version: 0}, {version: 1}])

    session.unmount()
    expect(disposed).toBe(2)
    session.dispose()
    session.dispose()
    expect(disposed).toBe(2)
  })

  test("rejects foreign exports and aborted stories without replacing current preview", () => {
    const document = createDocument()
    const mounted: unknown[] = []
    const lifetime = new AbortController()
    const session = runtime.create({
      document,
      signal: lifetime.signal,
      mount(node: unknown) { mounted.push(node) },
      publishInspector() {},
      publishSource() {},
      publishProps() {},
      requestRender() {},
    } as never)
    expect(() => session.mount({
      route: "graph/document/current/complete",
      story: {},
      signal: new AbortController().signal,
    })).toThrow("story factory")

    const aborted = new AbortController()
    aborted.abort()
    session.mount({
      route: "graph/document/current/complete",
      story: () => ({
        element: document.createElement("section"),
        args: Object.freeze({}),
        source: Object.freeze({html: "", css: "", typescript: ""}),
        dispose() {},
      }),
      signal: aborted.signal,
    })
    expect(mounted).toEqual([])
    session.dispose()
  })
})
