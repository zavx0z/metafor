import {expect, test} from "bun:test"
import {createDocument, Event} from "@zavx0z/dom"
import {createDocumentRenderer} from "@zavx0z/renderer"
import {createDisplayDock} from "./display-dock.ts"

test("display dock uses ordinary DOM hover, title and click semantics", () => {
  const document = createDocument()
  let returns = 0
  const dock = createDisplayDock(document, () => { returns += 1 })

  expect(dock.root.firstChild).toBe(dock.container)
  expect(dock.expanded).toBeFalse()
  expect(dock.returnButton.getAttribute("style")).toContain("display: none")
  expect(dock.dockButton.title).toBe("Приблизить основную поверхность")
  dock.resize(1_000)
  expect(dock.container.getAttribute("style")).toContain("left: 462.5px")
  expect(dock.container.getAttribute("style")).toContain("width: 75px")
  document.appendChild(dock.root)
  const renderer = createDocumentRenderer({
    document,
    root: document,
    viewport: {width: 1_000, height: 700},
  })
  expect(renderer.flush().boxByNode.has(dock.returnButton)).toBeFalse()

  dock.container.dispatchEvent(new Event("pointerenter"))
  expect(dock.expanded).toBeTrue()
  expect(dock.returnButton.getAttribute("style")).not.toContain("display: none")
  const expandedFrame = renderer.flush()
  expect(expandedFrame.boxByNode.get(dock.container)).toMatchObject({
    x: 462.5,
    y: 605,
    width: 75,
    height: 82,
  })
  expect(expandedFrame.boxByNode.get(dock.returnButton)).toMatchObject({
    x: 481,
    y: 605,
    width: 38,
    height: 38,
  })

  dock.dockButton.click()
  expect(dock.pinned).toBeTrue()
  expect(dock.dockButton.getAttribute("aria-pressed")).toBe("true")
  dock.container.dispatchEvent(new Event("pointerleave"))
  expect(dock.expanded).toBeTrue()

  dock.setMode("near")
  expect(dock.returnButton.title).toBe("Вернуть пространственный обзор")
  dock.returnButton.click()
  expect(returns).toBe(1)
  expect(dock.pinned).toBeFalse()
  expect(dock.expanded).toBeFalse()

  dock.dispose()
  dock.dockButton.click()
  expect(dock.pinned).toBeFalse()
})
