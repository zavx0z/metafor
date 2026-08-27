import {describe, expect, test} from "bun:test"
import {NodeTree} from "@nodes/core/node-tree"
import {Parameter, type NodeJsonValue} from "@nodes/core/parameter"
import {
  createNodeTreeProjector,
  type FrameMetadata,
  type LinkMetadata,
  type NodeMetadata,
  type ParameterPresentation,
  type RuntimeParameter,
  type RuntimeTree,
  type SocketMetadata,
} from "@nodes/ui/projection"
import {GraphNodeTreePresentationController} from "../../storybook/graph/stories/node-tree-presentation.ts"
import {createGraphNodeTreeStory} from "../../storybook/graph/stories/node-tree.ts"

const numberParameter = (id: string, label: string, value: number): RuntimeParameter =>
  new Parameter<NodeJsonValue, ParameterPresentation>(id, value, {
    label,
    field: {id: `${id}-field`, kind: "number", label},
  })

const fixture = (): Readonly<{tree: RuntimeTree; source: RuntimeParameter}> => {
  const source = numberParameter("value", "Source value", 1)
  const target = numberParameter("value", "Target value", 0)
  const tree = new NodeTree<
    RuntimeParameter,
    FrameMetadata,
    NodeMetadata,
    SocketMetadata,
    LinkMetadata
  >({
    nodes: [
      {
        id: "source",
        parameters: [source],
        metadata: {title: "Source", category: "Graph"},
        sockets: [{
          id: "value-out",
          direction: "output",
          parameterId: "value",
          side: "right",
          metadata: {label: "Value", socketType: "float"},
        }],
      },
      {
        id: "target",
        parameters: [target],
        metadata: {title: "Target", category: "Graph"},
        sockets: [{
          id: "value-in",
          direction: "input",
          parameterId: "value",
          side: "left",
          metadata: {label: "Value", socketType: "float"},
        }],
      },
    ],
    links: [{
      id: "value-link",
      from: {nodeId: "source", socketId: "value-out"},
      to: {nodeId: "target", socketId: "value-in"},
      metadata: {label: "Value", socketType: "float"},
    }],
  })
  return {tree, source}
}

describe("Quantum Graph NodeTree retained presentation", () => {
  test("projects a ready NodeTree through the production projector and NodeEditor", async () => {
    const {tree, source} = fixture()
    const presentation = new GraphNodeTreePresentationController()
    try {
      const first = await presentation.present({kind: "tree", tree}, {width: 900, height: 600})
      expect(first).toMatchObject({
        source: "tree",
        revision: 0,
        topologyRevision: 0,
        nodes: 2,
        links: 1,
        presentations: 1,
      })
      expect(first.projection).toMatchObject({measurements: 2, layouts: 1, plans: 2})
      expect(first.editor.localLayoutPlans).toBe(0)

      source.set(2)
      const second = await presentation.present({kind: "tree", tree}, {width: 900, height: 600})
      expect(second.revision).toBe(1)
      expect(second.projection?.reusedMeasurements).toBeGreaterThan(0)
      expect(second.presentations).toBe(2)
    } finally {
      presentation.dispose()
      tree.dispose()
    }
  })

  test("accepts a ready projection without interpreting its source Graph", async () => {
    const {tree} = fixture()
    const projection = await tree.project(createNodeTreeProjector(), {
      cacheKey: "ready-projection",
      context: {viewport: {width: 640, height: 360}},
    })
    const presentation = new GraphNodeTreePresentationController()
    try {
      expect(await presentation.present(
        {kind: "projection", projection},
        {width: 640, height: 360},
      )).toMatchObject({source: "projection", nodes: 2, links: 1})
      await expect(presentation.present(
        {kind: "projection", projection},
        {width: 0, height: 360},
      )).rejects.toThrow("viewport must be finite and positive")
    } finally {
      presentation.dispose()
      tree.dispose()
    }
  })

  test("reconciles the real Graph adapter when the live story control changes", async () => {
    const module = createGraphNodeTreeStory()
    const preview = await module.createPreview()
    try {
      const startedAt = performance.now()
      const first = await preview.present({width: 900, height: 600}, {incremented: false})
      const second = await preview.present({width: 900, height: 600}, {incremented: true})
      const durationMs = performance.now() - startedAt

      expect(module.kind).toBe("graph-node-tree-preview")
      const source = module.source({incremented: true})
      expect(source.html).toContain("<node-editor")
      expect(source.css).toContain(".graph-node-tree")
      expect(source.typescript).toContain("@metafor/node-tree/graph")
      expect(first.frames).toBe(7)
      expect(first.nodes).toBe(12)
      expect(first.links).toBe(18)
      expect(first.frameIds).toContain("frame:templates")
      expect(first.frameIds).toContain("frame:runtime")
      expect(first.nodeIds).toContain("template:example%2Fgraph-root")
      expect(first.nodeIds).toContain("atom:1")
      expect(first.linkIds).toContain("link-condition:example%2Fgraph-root/idle/running/mode")
      expect(first.linkIds).toContain("reaction:remember:1:2")
      expect(second.revision).toBeGreaterThan(first.revision ?? -1)
      expect(second.topologyRevision).toBe(first.topologyRevision)
      expect(second.presentations).toBe(2)
      expect(durationMs).toBeLessThan(2_000)
    } finally {
      preview.dispose()
    }
  })
})
