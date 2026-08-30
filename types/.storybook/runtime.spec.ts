import {describe, expect, test} from "bun:test"
import {createDocument} from "@zavx0z/dom"
import {runtime} from "./runtime.ts"
import type {GraphDomStory} from "./stories/dom-story.tsx"

describe("MetaFor Graph external runtime", () => {
  test("keeps one host Document while replacing only owner preview controllers", () => {
    const document = createDocument()
    const presentations: Readonly<Record<string, unknown>>[] = []
    const lifetime = new AbortController()
    let disposed = 0
    const factory = (): GraphDomStory => {
      const element = document.createElement("section")
      const args = Object.freeze({version: presentations.length})
      const componentRoot = Object.freeze({
        readStyleSheets: () => Object.freeze({revision: 0, styleSheets: Object.freeze([])}),
      })
      return Object.freeze({
        element,
        componentRoot,
        args,
        source: Object.freeze({html: "<section></section>", typescript: ""}),
        dispose() { disposed += 1 },
      })
    }
    const session = runtime.create({
      document,
      signal: lifetime.signal,
      projection: "display",
      present(value: Readonly<Record<string, unknown>>) { presentations.push(value) },
      reportDiagnostic() {},
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
    expect(presentations).toHaveLength(2)
    expect(presentations.map(({protocol}) => protocol)).toEqual([
      "story-presentation/1",
      "story-presentation/1",
    ])
    expect(presentations.every(({node}) =>
      (node as {ownerDocument: unknown}).ownerDocument === document)).toBeTrue()
    expect(disposed).toBe(1)
    expect((presentations[0]?.componentRoot as {readStyleSheets(): unknown}).readStyleSheets()).toEqual({
      revision: 0,
      styleSheets: [],
    })
    expect(presentations.map(({values}) => values)).toEqual([
      {props: {version: 0}},
      {props: {version: 1}},
    ])

    session.unmount()
    expect(disposed).toBe(2)
    session.dispose()
    session.dispose()
    expect(disposed).toBe(2)
  })

  test("rejects foreign exports and aborted stories without replacing current preview", () => {
    const document = createDocument()
    const presentations: unknown[] = []
    const lifetime = new AbortController()
    const session = runtime.create({
      document,
      signal: lifetime.signal,
      projection: "display",
      present(value: unknown) { presentations.push(value) },
      reportDiagnostic() {},
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
        componentRoot: {
          readStyleSheets: () => Object.freeze({revision: 0, styleSheets: Object.freeze([])}),
        },
        args: Object.freeze({}),
        source: Object.freeze({html: "", typescript: ""}),
        dispose() {},
      }),
      signal: aborted.signal,
    })
    expect(presentations).toEqual([])
    session.dispose()
  })

  test("rejects a declaration/runtime projection mismatch and legacy transport source", async () => {
    const document = createDocument()
    expect(() => runtime.create({
      document,
      signal: new AbortController().signal,
      projection: "hud",
      present() {},
      reportDiagnostic() {},
      requestRender() {},
    } as never)).toThrow("requires display projection")

    const source = await Bun.file(new URL("./runtime.ts", import.meta.url)).text()
    expect(runtime.protocol).toBe("storybook-runtime/3")
    expect(source).toContain("context.present")
    for (const legacy of [
      "context.mount",
      "publishInspector",
      "publishSource",
      "publishProps",
      "styleSheets:",
    ]) expect(source).not.toContain(legacy)
  })
})
