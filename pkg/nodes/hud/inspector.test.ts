import {describe, expect, test} from "bun:test"
import {HUD_WINDOW_TITLE_HEIGHT} from "@ui/hud"
import {
  NODE_INSPECTOR_TITLE_HEIGHT,
  NodeInspectorSurface,
  nodeInspectorActionsHeight,
  nodeInspectorContentHeight,
  nodeInspectorRows,
  nodeInspectorRowsHeight,
  nodeInspectorValueNeedsTooltip,
} from "./inspector.ts"

const node = {
  id: "host",
  title: "Host",
  kind: "runtime",
  facts: [
    {id: "status", label: "Status", value: "ready"},
    {id: "link", label: "Link", value: "out"},
  ],
  actions: [{id: "restart", label: "Restart", enabled: false}],
}

describe("node inspector values", () => {
  const measure = (value: string, fontPx: number): number => value.length * fontPx

  test("adds disclosure only when the exact rendered value exceeds its slot", () => {
    expect(nodeInspectorValueNeedsTooltip("ready", 45, measure)).toBeFalse()
    expect(nodeInspectorValueNeedsTooltip("ready", 44, measure)).toBeTrue()
    expect(nodeInspectorValueNeedsTooltip("browser-control:full-id", 120, measure)).toBeTrue()
  })

  test("keeps every action in the scrollable inspector content", () => {
    expect(nodeInspectorRowsHeight(6)).toBe(142)
    expect(nodeInspectorActionsHeight(5)).toBe(164)
    expect(nodeInspectorContentHeight(6, 5, 154)).toBe(389)
    expect(nodeInspectorContentHeight(6, 5, 560)).toBe(560)
  })

  test("keeps the inspected node and derives its generic rows", () => {
    const inspector = new NodeInspectorSurface({open: false})
    inspector.inspect(node)
    expect(inspector.inspectedNode?.id).toBe("host")
    expect(inspector.isOpen).toBe(false)
    expect(NODE_INSPECTOR_TITLE_HEIGHT).toBe(HUD_WINDOW_TITLE_HEIGHT)
    expect(nodeInspectorRows(inspector.inspectedNode!)).toEqual([
      {id: "identity", label: "Идентификатор", value: "host"},
      {id: "kind", label: "Тип", value: "runtime"},
      {id: "status", label: "Status", value: "ready"},
      {id: "link", label: "Link", value: "out"},
    ])
  })

  test("closes and reopens without losing the inspected node", () => {
    const states: boolean[] = []
    const inspector = new NodeInspectorSurface({onOpenChange: (open) => states.push(open)})
    inspector.inspect(node)
    expect(inspector.setOpen(false)).toBe(true)
    expect(inspector.isOpen).toBe(false)
    expect(inspector.inspectedNode?.id).toBe("host")
    expect(inspector.setOpen(false)).toBe(false)
    expect(inspector.toggleOpen()).toBe(true)
    expect(inspector.isOpen).toBe(true)
    expect(states).toEqual([false, true])
  })
})
