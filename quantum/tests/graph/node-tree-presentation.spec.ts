import {describe, expect, test} from "bun:test"
import {createDocument, Event} from "@zavx0z/dom"
import {checkboxStyles} from "@ui/components/checkbox"
import {listStyles} from "@ui/components/list"
import {paneStyles} from "@ui/components/pane"
import {createGraphNodeTreeStory} from "../../../types/.storybook/stories/node-tree.tsx"

describe("Quantum Graph NodeTree DOM presentation", () => {
  test("presents the real Graph adapter snapshot as semantic Frames, Nodes and Links", () => {
    const story = createGraphNodeTreeStory(createDocument())
    try {
      const snapshot = story.snapshot()
      expect(story.element.localName).toBe("section")
      expect(story.element.className).toBe("graph-node-tree")
      expect(story.element.getAttribute("data-projection")).toBe("graph-live")
      expect(snapshot).toMatchObject({revision: 0, topologyRevision: 0})
      expect(snapshot.frames).toHaveLength(7)
      expect(snapshot.nodes).toHaveLength(12)
      expect(snapshot.links).toHaveLength(18)
      expect(story.refs.frameElements.size).toBe(7)
      expect(story.refs.nodeElements.size).toBe(12)
      expect(story.refs.linkElements.size).toBe(18)
      expect(story.refs.frameElements.has("frame:templates")).toBeTrue()
      expect(story.refs.frameElements.has("frame:runtime")).toBeTrue()
      expect(story.refs.nodeElements.has("template:example%2Fgraph-root")).toBeTrue()
      expect(story.refs.nodeElements.has("atom:1")).toBeTrue()
      expect(story.refs.linkElements.has("link-condition:example%2Fgraph-root/idle/running/mode")).toBeTrue()
      expect(story.refs.linkElements.has("reaction:remember:1:2")).toBeTrue()
      expect(story.refs.incremented.hasAttribute(checkboxStyles.root.attributeName)).toBeTrue()
      expect(story.refs.frameElements.get("frame:runtime")
        ?.hasAttribute(paneStyles.root.attributeName)).toBeTrue()
      expect(story.refs.nodeElements.get("atom:1")
        ?.hasAttribute(paneStyles.root.attributeName)).toBeTrue()
      expect(story.refs.links.hasAttribute(listStyles.root.attributeName)).toBeTrue()
    } finally {
      story.dispose()
    }
  })

  test("reconciles value changes without replacing semantic root/topology identities", () => {
    const story = createGraphNodeTreeStory(createDocument())
    const root = story.element
    const frame = story.refs.frameElements.get("frame:runtime")
    const node = story.refs.nodeElements.get("atom:1")
    const link = story.refs.linkElements.get("reaction:remember:1:2")
    const topologyRevision = story.snapshot().topologyRevision

    story.refs.incremented.checked = true
    story.refs.incremented.dispatchEvent(new Event("change", {bubbles: true}))

    expect(story.element).toBe(root)
    expect(story.refs.frameElements.get("frame:runtime")).toBe(frame)
    expect(story.refs.nodeElements.get("atom:1")).toBe(node)
    expect(story.refs.linkElements.get("reaction:remember:1:2")).toBe(link)
    expect(story.args).toEqual({incremented: true})
    expect(story.snapshot().revision).toBeGreaterThan(0)
    expect(story.snapshot().topologyRevision).toBe(topologyRevision)
    expect(story.source.typescript).toContain("reconcileGraphNodeTree(tree, nextGraph)")
    expect(story.source.typescript).toContain("runtime count = 1")

    story.dispose()
  })

  test("uses only the neutral Graph adapter and standard DOM presentation", async () => {
    const source = await Bun.file(
      new URL("../../../types/.storybook/stories/node-tree.tsx", import.meta.url),
    ).text()

    expect(source).toContain('from "@metafor/node-tree/graph"')
    expect(source).toContain('from "@zavx0z/dom"')
    expect(source).toContain('from "@ui/components/checkbox"')
    expect(source).toContain("tree.snapshot()")
    expect(source).toContain("reconcileGraphNodeTree")
    for (const forbidden of [
      "@nodes/ui",
      "@nodes/layout",
      "@layout/core",
      "@ui/elements",
      "NodeEditor",
      "UiSurface",
    ]) expect(source).not.toContain(forbidden)
  })
})
