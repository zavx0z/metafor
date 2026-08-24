import {describe, expect, test} from "bun:test"
import {TrueTypeFont} from "@metafor/engine"
import {NodeTree, StaleNodeTreeProjectionError} from "@nodes/core/node-tree"
import {Parameter, type NodeJsonValue} from "@nodes/core/parameter"
import {
  createBlenderNodeTreeProjector,
  type BlenderFrameMetadata,
  type BlenderLinkMetadata,
  type BlenderNodeMetadata,
  type BlenderParameterPresentation,
  type BlenderNodeTreeProjection,
  type BlenderRuntimeParameter,
  type BlenderRuntimeTree,
  type BlenderSocketMetadata,
} from "./blender-projection.ts"
import {createBlenderNodeRenderers} from "./blender-node.ts"
import {NodeEditor} from "./node-editor.ts"

const parameter = (
  id: string,
  label: string,
  value: number,
  geometrySensitiveValue = false,
): BlenderRuntimeParameter => new Parameter<NodeJsonValue, BlenderParameterPresentation>(
  id,
  value,
  {
    label,
    field: {id: `${id}-field`, kind: "number", label},
    ...(geometrySensitiveValue ? {geometrySensitiveValue: true} : {}),
  },
)

const createTree = (
  geometrySensitiveGain = false,
  sourceSide: "left" | "right" = "right",
  targetSide: "left" | "right" = "left",
): Readonly<{
  tree: BlenderRuntimeTree
  source: BlenderRuntimeParameter
}> => {
  const source = parameter("value", "Source value", 1, geometrySensitiveGain)
  const target = parameter("value", "Target value", 0)
  const tree = new NodeTree<
    BlenderRuntimeParameter,
    BlenderFrameMetadata,
    BlenderNodeMetadata,
    BlenderSocketMetadata,
    BlenderLinkMetadata
  >({
    nodes: [
      {
        id: "source",
        parameters: [source],
        metadata: {title: "Source"},
        sockets: [{
          id: "value-out",
          direction: "output",
          parameterId: "value",
          side: sourceSide,
          metadata: {label: "Value", socketType: "float"},
        }],
      },
      {
        id: "target",
        parameters: [target],
        metadata: {title: "Target"},
        sockets: [{
          id: "value-in",
          direction: "input",
          parameterId: "value",
          side: targetSide,
          metadata: {label: "Value", socketType: "float"},
        }],
      },
    ],
    links: [{
      id: "value-link",
      from: {nodeId: "source", socketId: "value-out"},
      to: {nodeId: "target", socketId: "value-in"},
      metadata: {socketType: "float"},
    }],
  })
  return {tree, source}
}

describe("live NodeTree Blender projection", () => {
  test("measures and lays out once, then reuses geometry for a Parameter-only change", async () => {
    const {tree, source} = createTree()
    const projector = createBlenderNodeTreeProjector()
    const request = {
      cacheKey: "blender:900x600",
      context: {viewport: {width: 900, height: 600}},
    }

    const first = await tree.project(projector, request)
    expect(first.tree.nodes).toHaveLength(2)
    expect(first.tree.links[0]?.points.length).toBeGreaterThanOrEqual(2)
    expect(first.nodePlans.size).toBe(2)
    expect(first.diagnostics).toEqual({
      measurements: 2,
      reusedMeasurements: 0,
      layouts: 1,
      reusedLayouts: 0,
      plans: 2,
      reusedPlans: 0,
    })
    expect(await tree.project(projector, request)).toBe(first)
    expect(JSON.stringify(tree)).not.toContain("onChange")
    expect(first.snapshot.nodes[0]?.parameters[0]?.presentation["field"]).not.toHaveProperty("value")

    expect((source as Parameter<NodeJsonValue, BlenderParameterPresentation>).set(2)).toBeTrue()
    const second = await tree.project(projector, request)
    expect(second).not.toBe(first)
    expect(second.diagnostics).toEqual({
      measurements: 2,
      reusedMeasurements: 2,
      layouts: 1,
      reusedLayouts: 1,
      plans: 3,
      reusedPlans: 1,
    })
    const field = second.nodePlans.get("source")?.parameters[0]?.parameter.field
    expect(field?.kind).toBe("number")
    if (field?.kind !== "number") throw new Error("Projected number Field is missing")
    expect(field.value).toBe(2)
    field.onChange?.(3)
    expect(source.value).toBe(3)
    expect(tree.revision).toBe(2)
  })

  test("reads captured Parameter fields while binding edits to the live Store", async () => {
    const {tree, source} = createTree()
    const blender = createBlenderNodeTreeProjector()
    type Input = Parameters<typeof blender.project>[0]
    let release: (() => void) | undefined
    let produced: BlenderNodeTreeProjection | undefined
    const delayed = {
      async project(input: Input): Promise<BlenderNodeTreeProjection> {
        await new Promise<void>((resolve) => { release = resolve })
        produced = await blender.project(input)
        return produced
      },
    }

    const pending = tree.project(delayed, {
      cacheKey: "blender:captured-parameter",
      context: {viewport: {width: 900, height: 600}},
    })
    await Promise.resolve()
    source.set(2)
    release?.()

    await expect(pending).rejects.toBeInstanceOf(StaleNodeTreeProjectionError)
    const field = produced?.nodePlans.get("source")?.parameters[0]?.parameter.field
    expect(field?.kind).toBe("number")
    if (field?.kind !== "number") throw new Error("Captured number Field is missing")
    expect(field.value).toBe(1)
    field.onChange?.(3)
    expect(source.value).toBe(3)
  })

  test("projects an added Parameter from the committed topology generation", async () => {
    const {tree, source} = createTree()
    const projector = createBlenderNodeTreeProjector()
    const request = {
      cacheKey: "blender:topology",
      context: {viewport: {width: 900, height: 600}},
    }
    const first = await tree.project(projector, request)
    const gain = parameter("gain", "Gain", 0.5)
    const current = tree.definition()

    tree.reconcile({
      expectedRevision: 0,
      definition: {
        ...current,
        nodes: current.nodes.map((node) => node.id === "source" ? {
          ...node,
          parameters: [...(node.parameters ?? []), gain],
        } : node),
      },
    })
    const second = await tree.project(projector, request)

    expect(second.revision).toBe(1)
    expect(second.topologyRevision).toBe(1)
    expect(second.snapshot.nodes.find(({id}) => id === "source")?.parameters.map(({id}) => id))
      .toEqual(["value", "gain"])
    expect(second.tree.nodes.find(({node}) => node.id === "source")?.node.parameters?.map(({id}) => id))
      .toEqual(["value", "gain"])
    expect(second.diagnostics.measurements).toBe(first.diagnostics.measurements + 1)
    expect(second.diagnostics.reusedMeasurements).toBe(first.diagnostics.reusedMeasurements + 1)
    expect(second.diagnostics.layouts).toBe(first.diagnostics.layouts + 1)
    expect(second.diagnostics.plans).toBe(first.diagnostics.plans + 1)
    expect(second.diagnostics.reusedPlans).toBe(first.diagnostics.reusedPlans + 1)
    expect(tree.parameter("source", "value")).toBe(source)
    expect(tree.parameter("source", "gain")).toBe(gain)
  })

  test("lets NodeEditor materialize supplied plans without local replanning", async () => {
    const {tree} = createTree()
    const projection = await tree.project(createBlenderNodeTreeProjector(), {
      cacheKey: "blender:640x360",
      context: {viewport: {width: 640, height: 360}},
    })
    const editor = new NodeEditor({
      renderers: createBlenderNodeRenderers(),
      toolbar: false,
    })
    editor.setProjection(projection)
    const fontBytes = await Bun.file(new URL("../../engine/static/JetBrainsMono-Bold.ttf", import.meta.url)).arrayBuffer()
    editor.setRect({x: 0, y: 0, w: 640, h: 360}, 0.001, new TrueTypeFont(fontBytes))

    expect(editor.diagnostics.localLayoutPlans).toBe(0)
    expect(editor.diagnostics.materializations).toBeGreaterThan(0)
    editor.setOverlayState({overlays: false, previews: false})
    editor.flushPendingRender()
    expect(editor.diagnostics.localLayoutPlans).toBeGreaterThan(0)
    editor.dispose()
  })

  test("remeasures only a Node whose Parameter declares value-sensitive geometry", async () => {
    const {tree, source} = createTree(true)
    const projector = createBlenderNodeTreeProjector()
    const request = {cacheKey: "sensitive", context: {viewport: {width: 900, height: 600}}}
    await tree.project(projector, request)
    ;(source as Parameter<NodeJsonValue, BlenderParameterPresentation>).set(2)
    const projection = await tree.project(projector, request)

    expect(projection.diagnostics.measurements).toBe(3)
    expect(projection.diagnostics.reusedMeasurements).toBe(1)
    expect(projection.diagnostics.layouts).toBe(1)
    expect(projection.diagnostics.reusedLayouts).toBe(1)
    expect(projection.diagnostics.plans).toBe(3)
    expect(projection.diagnostics.reusedPlans).toBe(1)
  })

  test("rejects explicit Socket sides that contradict the fixed projection policy", async () => {
    const {tree} = createTree(false, "left", "right")
    await expect(tree.project(createBlenderNodeTreeProjector(), {
      cacheKey: "conflict",
      context: {viewport: {width: 900, height: 600}},
    })).rejects.toThrow("Fixed projection Socket side conflict")
  })
})
