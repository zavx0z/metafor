import {describe, expect, test} from "bun:test"
import {layout, type LayoutGraph} from "@nodes/layout"
import {LayoutWorkerClient, runLayoutWorkerRequest} from "./layout-worker.ts"
import type {
  LayoutWorkerEndpoint,
  LayoutWorkerRequest,
  LayoutWorkerResponse,
} from "./types/worker.ts"

const graph = (viewport: Readonly<{width: number; height: number}>): LayoutGraph => ({
  viewport,
  layoutOptions: {spacing: 28, layerSpacing: 28, padding: 28, clearance: 28},
  nodes: [
    {id: "owner", width: 180, height: 40},
    {id: "source", parentId: "owner", width: 180, height: 100},
    {id: "target", width: 180, height: 100},
  ],
  ports: [
    {id: "source/out", nodeId: "source", y: 72},
    {id: "target/in", nodeId: "target", y: 72},
  ],
  edges: [{id: "message", sourcePortId: "source/out", targetPortId: "target/in"}],
})

describe("minimal layout Worker protocol", () => {
  test("structured-clones the synchronous geometry in RIGHT and DOWN", () => {
    for (const viewport of [{width: 900, height: 600}, {width: 390, height: 844}]) {
      const input = graph(viewport)
      const response = structuredClone(runLayoutWorkerRequest({
        type: "layout",
        requestId: 7,
        generation: 3,
        graph: input,
      }))
      expect(response.type).toBe("layout-result")
      if (response.type === "layout-result") {
        expect(response.result).toEqual(layout(input))
        expect(response.generation).toBe(3)
      }
    }
  })

  test("contains no UI document or text measurements and is permutation-stable", () => {
    const input = graph({width: 900, height: 600})
    const reversed: LayoutGraph = {
      ...input,
      nodes: [...input.nodes].reverse(),
      ports: [...input.ports].reverse(),
      edges: [...input.edges].reverse(),
    }
    const first = runLayoutWorkerRequest({type: "layout", requestId: 1, generation: 1, graph: input})
    const second = runLayoutWorkerRequest({type: "layout", requestId: 2, generation: 2, graph: reversed})
    expect(JSON.stringify({type: "layout", graph: input})).not.toContain("textMetrics")
    expect(first.type).toBe("layout-result")
    expect(second.type).toBe("layout-result")
    if (first.type === "layout-result" && second.type === "layout-result") {
      expect(second.result).toEqual(first.result)
    }
  })

  test("rejects obsolete pending generations without accepting their late response", async () => {
    const endpoint = new FakeWorkerEndpoint()
    const client = new LayoutWorkerClient(endpoint as unknown as LayoutWorkerEndpoint)
    const stale = client.layout({graph: graph({width: 900, height: 600}), generation: 1})
    client.cancelBefore(2)
    const current = client.layout({graph: graph({width: 900, height: 600}), generation: 2})
    endpoint.respond(0)
    endpoint.respond(1)

    await expect(stale).rejects.toThrow("Stale layout generation: 1")
    expect((await current).generation).toBe(2)
    client.dispose()
    expect(endpoint.terminated).toBeTrue()
  })
})

class FakeWorkerEndpoint {
  readonly requests: LayoutWorkerRequest[] = []
  readonly messageListeners = new Set<(event: MessageEvent<LayoutWorkerResponse>) => void>()
  readonly errorListeners = new Set<(event: ErrorEvent) => void>()
  terminated = false

  postMessage(message: LayoutWorkerRequest): void {
    this.requests.push(structuredClone(message))
  }

  addEventListener(type: "message" | "error", listener: ((event: MessageEvent<LayoutWorkerResponse>) => void) | ((event: ErrorEvent) => void)): void {
    if (type === "message") this.messageListeners.add(listener as (event: MessageEvent<LayoutWorkerResponse>) => void)
    else this.errorListeners.add(listener as (event: ErrorEvent) => void)
  }

  removeEventListener(type: "message" | "error", listener: ((event: MessageEvent<LayoutWorkerResponse>) => void) | ((event: ErrorEvent) => void)): void {
    if (type === "message") this.messageListeners.delete(listener as (event: MessageEvent<LayoutWorkerResponse>) => void)
    else this.errorListeners.delete(listener as (event: ErrorEvent) => void)
  }

  terminate(): void {
    this.terminated = true
  }

  respond(index: number): void {
    const response = runLayoutWorkerRequest(this.requests[index]!)
    for (const listener of this.messageListeners) {
      listener({data: structuredClone(response)} as MessageEvent<LayoutWorkerResponse>)
    }
  }
}
