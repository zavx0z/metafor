import {describe, expect, test} from "bun:test"
import {join} from "node:path"
import {fileURLToPath} from "node:url"
import {planBlenderNode, type BlenderNode} from "@nodes/ui/blender-node"

const playgroundRoot = fileURLToPath(new URL(".", import.meta.url))
const uiRoot = fileURLToPath(new URL("../../../ui/", import.meta.url))
const componentsRoot = fileURLToPath(new URL("../../../../ui/components/", import.meta.url))

describe("Flexbox-oriented Node component composition", () => {
  test("uses project Flex at field, Node, editor, catalog and responsive region levels", async () => {
    const field = await Bun.file(join(componentsRoot, "Field.ts")).text()
    const slider = await Bun.file(join(componentsRoot, "SliderControl.ts")).text()
    const node = await Bun.file(join(uiRoot, "blender-node.ts")).text()
    const editor = await Bun.file(join(uiRoot, "node-editor.ts")).text()
    const catalog = await Bun.file(join(playgroundRoot, "surfaces/reference-surfaces.ts")).text()
    const regions = await Bun.file(join(playgroundRoot, "ui-workbench-layout.ts")).text()
    expect(field).toContain("flexColumn")
    expect(field).toContain("flexRow")
    expect(slider).toContain("flexColumn")
    expect(slider).toContain("flexRow")
    expect(node).toContain("flexColumn")
    expect(node).toContain("flexRow")
    expect(editor).toContain("flexColumn")
    expect(editor).toContain("flexRow")
    expect(catalog).toContain("flexColumn")
    expect(catalog).toContain("flexRow")
    expect(regions).toContain("planPlaygroundShell")
    expect(regions).toContain("flexRowCss")
    expect(await Bun.file(join(playgroundRoot, "ui-playground.ts")).text()).not.toMatch(/w \* 0\.|h \* 0\.|left =|top =/)
    expect(catalog).not.toMatch(/x \+ column \*|y \+ row \*|let y =/)
  })

  test("derives field slots and exact Socket centers from one Flex plan", () => {
    const node: BlenderNode = {
      id: "flex-node",
      title: "Flex Node",
      properties: [{id: "mode", label: "Mode", kind: "enum", value: "a", options: [{value: "a", label: "A"}]}],
      parameters: [{id: "factor-value", label: "Factor", field: {id: "factor-value", label: "Factor", kind: "number", value: 0.5}}],
      sockets: [
        {id: "factor-left", label: "Factor", direction: "input", socketType: "float", parameterId: "factor-value", side: "left"},
        {id: "factor-right", label: "Factor", direction: "output", socketType: "float", parameterId: "factor-value", side: "right"},
        {id: "result", label: "Result", direction: "output", socketType: "float"},
      ],
    }
    const plan = planBlenderNode(node, {x: 20, y: 30, w: 240, h: 220})
    expect(plan.fields).toHaveLength(1)
    expect(plan.parameters).toHaveLength(1)
    expect(plan.sockets).toHaveLength(3)
    const property = plan.fields[0]!.rect
    const parameter = plan.parameters[0]!
    expect(property.y + property.h).toBeLessThan(parameter.rect.y)
    expect(parameter.parameter.field.id).toBe("factor-value")
    const input = plan.sockets.find(({socket}) => socket.id === "factor-left")!
    const output = plan.sockets.find(({socket}) => socket.id === "factor-right")!
    expect(input.center.x).toBe(20)
    expect(input.center.y).toBe(parameter.labelRect.y + parameter.labelRect.h / 2)
    expect(output.center.x).toBe(260)
    expect(output.center.y).toBe(input.center.y)
  })
})
