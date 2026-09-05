import {afterAll, beforeAll, expect, test} from "bun:test"
import {mkdtemp, rm, symlink} from "node:fs/promises"
import {join, resolve} from "node:path"
import {pathToFileURL} from "node:url"
import {createDocument, Event, HTMLButtonElement, readDocumentCompiledStyleSheets} from "@zavx0z/dom"
import {createRoot} from "@zavx0z/component"
import {createDocumentRenderer} from "@zavx0z/renderer"
import {createSpaceElementFactories, readSpaceTree} from "@zavx0z/space"
import type {CompiledTemplate} from "@zavx0z/template/compiled"
import visualTemplatePlugin from "../build/template.plugin.ts"
import type {RootSize} from "@zavx0z/browser"
import {DISPLAY_CENTER_MM, readViewPoint} from "./view-state.ts"

let directory = ""
let app: CompiledTemplate<{size: Pick<RootSize, "width" | "height">}>

beforeAll(async () => {
  directory = await mkdtemp(join(import.meta.dir, ".compiled-app-"))
  await symlink(resolve(import.meta.dir, "../node_modules"), join(directory, "node_modules"), "dir")
  const result = await Bun.build({
    entrypoints: [join(import.meta.dir, "app.tsx")],
    outdir: directory,
    target: "bun",
    format: "esm",
    external: ["@zavx0z/browser", "@zavx0z/dom", "@zavx0z/component", "@zavx0z/engine", "@zavx0z/template/compiled"],
    plugins: [
      visualTemplatePlugin,
      {
        name: "visual-test-space-identity",
        setup(build) {
          // Фабрики тестового Document и проверки instanceof используют одни классы.
          // TSX subpaths Space/Display/HUD при этом компилируются обычным plugin.
          build.onResolve({filter: /^@zavx0z\/space$/}, () => ({path: "@zavx0z/space", external: true}))
        },
      },
    ],
  })
  if (!result.success) throw new AggregateError(result.logs, "Visual App did not compile")
  const output = result.outputs.find(({kind}) => kind === "entry-point")!
  const module = await import(pathToFileURL(output.path).href) as {VisualScene: CompiledTemplate<{size: Pick<RootSize, "width" | "height">}>}
  app = module.VisualScene
}, 30_000)

afterAll(async () => {
  if (directory !== "") await rm(directory, {recursive: true, force: true})
})

test("Visual App owns one Z-up Space, a millimetre Display and the same-document HUD", () => {
  const document = createDocument({elementFactories: createSpaceElementFactories()})
  const root = createRoot(document)
  root.render(app, {size: {width: 1000, height: 700}})
  const tree = readSpaceTree(document)
  expect(document.documentElement).toBe(tree.space)
  expect(tree.displays).toHaveLength(1)
  expect(tree.hud?.element.parentElement).toBe(tree.space)
  expect(tree.displays[0]!.element.parentElement).toBe(tree.space)
  expect(tree.viewPoint).toMatchObject({x: 0, y: -1600, z: 900, controls: true})
  expect(tree.displays[0]!.transform.position).toEqual(DISPLAY_CENTER_MM)
  expect(tree.displays[0]!.transform.quaternion).toEqual({x: Math.SQRT1_2, y: 0, z: 0, w: Math.SQRT1_2})
  expect(tree.displays[0]!.worldUnitsPerPixel * 700).toBeCloseTo(2 * 600 * Math.tan(Math.PI / 8))
  expect(tree.objects).toHaveLength(1)
  expect(tree.objects[0]!.name).toBe("SpaceFloorGrid")
  root.unmount()
  expect(document.documentElement).toBeNull()
  expect(readDocumentCompiledStyleSheets(document).styleSheets).toEqual([])
})

test("dock retains Button identity, Flex placement and exact far-view restoration", () => {
  const document = createDocument({elementFactories: createSpaceElementFactories()})
  const root = createRoot(document)
  root.render(app, {size: {width: 1000, height: 700}})
  const tree = readSpaceTree(document)
  const dock = document.getElementById("main-display-dock")!
  const buttons = [...dock.querySelectorAll("button")].filter((node): node is HTMLButtonElement => node instanceof HTMLButtonElement)
  expect(buttons).toHaveLength(2)
  const [returnButton, dockButton] = buttons
  const renderer = createDocumentRenderer({document, root: tree.hud!.element, viewport: {width: 1000, height: 700}})
  expect(renderer.flush().boxByNode.has(returnButton!)).toBe(false)
  dock.dispatchEvent(new Event("pointerenter"))
  expect(renderer.flush().boxByNode.get(dock)).toMatchObject({x: 462.5, y: 605, width: 75, height: 82})
  expect(renderer.flush().boxByNode.get(returnButton!)).toMatchObject({x: 481, y: 605, width: 38, height: 38})
  dockButton!.click()
  dock.dispatchEvent(new Event("pointerleave"))
  expect(dock.getAttribute("data-expanded")).toBe("true")
  expect(dockButton!.getAttribute("aria-pressed")).toBe("true")
  document.transaction(() => {
    tree.viewPoint.x = 250
    tree.viewPoint.y = -1450
    tree.viewPoint.z = 1050
  })
  const farPose = readViewPoint(tree.viewPoint)
  returnButton!.click()
  expect(tree.viewPoint.controls).toBe(false)
  expect(Math.hypot(tree.viewPoint.x, tree.viewPoint.y, tree.viewPoint.z - 900)).toBeCloseTo(600)
  expect(dockButton!.getAttribute("aria-pressed")).toBe("false")
  expect(returnButton!.title).toBe("Вернуть пространственный обзор")
  root.render(app, {size: {width: 800, height: 600}})
  expect(tree.displays[0]!.element.viewportWidth).toBe(800)
  dock.dispatchEvent(new Event("pointerenter"))
  returnButton!.click()
  expect(readViewPoint(tree.viewPoint)).toEqual(farPose)
  expect([...dock.querySelectorAll("button")]).toEqual([returnButton!, dockButton!])
  expect(tree.viewPoint.controls).toBe(true)
  renderer.dispose()
  root.unmount()
})
