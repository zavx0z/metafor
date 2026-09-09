import {afterAll, beforeAll, expect, test} from "bun:test"
import {mkdtemp, rm, symlink} from "node:fs/promises"
import {join, resolve} from "node:path"
import {pathToFileURL} from "node:url"
import {createDocument, Event, HTMLButtonElement, readDocumentCompiledStyleSheets} from "@zavx0z/dom"
import {DisplayElement, publishDisplayMetrics} from "@zavx0z/dom/display"
import {createRoot, type ComponentRoot} from "@zavx0z/component"
import {createDocumentRenderer, readDisplayStyle} from "@zavx0z/renderer"
import {createSpaceElementFactories, readSpaceTree, type XRViewPointElement} from "@zavx0z/space"
import type {CompiledTemplate} from "@zavx0z/template/compiled"
import visualTemplatePlugin from "../build/template.plugin.ts"
import {DISPLAY_CENTER_MM} from "./view-state.ts"
import {setViewport} from "./browser.fixture.ts"

let directory = ""
let app: CompiledTemplate<Record<string, never>>

async function renderApp(root: ComponentRoot, document: ReturnType<typeof createDocument>, width: number, height: number): Promise<void> {
  setViewport(width, height)
  root.render(app, {})
  const element = document.querySelector("display")
  if (element instanceof DisplayElement) {
    const style = readDisplayStyle(element.ownerDocument!, element)
    publishDisplayMetrics(element, {width: style.viewport.width, height: style.viewport.height,
      pixelWidth: style.pixels.width, pixelHeight: style.pixels.height, dpi: style.dpi})
  }
  await Promise.resolve()
}

function readViewPoint(camera: XRViewPointElement) {
  return {
    position: {x: camera.x, y: camera.y, z: camera.z},
    target: {x: camera.targetX, y: camera.targetY, z: camera.targetZ},
    fov: camera.fov,
    near: camera.near,
    far: camera.far,
  }
}

beforeAll(async () => {
  directory = await mkdtemp(join(import.meta.dir, ".compiled-app-"))
  await symlink(resolve(import.meta.dir, "../node_modules"), join(directory, "node_modules"), "dir")
  const result = await Bun.build({
    entrypoints: [join(import.meta.dir, "app.tsx")],
    outdir: directory,
    target: "bun",
    format: "esm",
    external: ["@zavx0z/dom", "@zavx0z/component", "@zavx0z/engine", "@zavx0z/template/compiled", join(import.meta.dir, "browser.fixture.ts")],
    plugins: [
      {
        name: "visual-test-space-identity",
        setup(build) {
          // Фабрики тестового Document и проверки instanceof используют одни классы.
          // TSX subpaths Space/Display/HUD при этом компилируются обычным plugin.
          build.onResolve({filter: /^@zavx0z\/space$/}, () => ({path: "@zavx0z/space", external: true}))
          build.onResolve({filter: /^@zavx0z\/browser$/}, () => ({path: "viewport", namespace: "visual-test-browser"}))
          build.onLoad({filter: /.*/, namespace: "visual-test-browser"}, () => ({
            contents: `export {useSpace} from ${JSON.stringify(join(import.meta.dir, "browser.fixture.ts"))}`,
            loader: "js",
          }))
        },
      },
      visualTemplatePlugin,
    ],
  })
  if (!result.success) throw new AggregateError(result.logs, "Visual App did not compile")
  const output = result.outputs.find(({kind}) => kind === "entry-point")!
  const module = await import(pathToFileURL(output.path).href) as {App: typeof app}
  app = module.App
}, 30_000)

afterAll(async () => {
  if (directory !== "") await rm(directory, {recursive: true, force: true})
})

test("Visual App owns one Z-up Space, a millimetre Display and the same-document HUD", async () => {
  const document = createDocument({elementFactories: createSpaceElementFactories()})
  const html = document.createElement("html")
  const body = document.createElement("body")
  html.append(body)
  document.append(html)
  const root = createRoot(body)
  await renderApp(root, document, 1000, 700)
  const tree = readSpaceTree(document)
  expect(document.documentElement).toBe(html)
  expect(body.children[0]?.localName).toBe("link")
  expect(body.children[0]?.getAttribute("rel")).toBe("stylesheet")
  expect(body.children[1]).toBe(tree.space)
  expect(tree.displays).toHaveLength(1)
  expect(tree.displays[0]!.id).toBe("")
  expect(tree.hud!.element.id).toBe("")
  expect(tree.hud?.element.parentElement).toBe(tree.space)
  expect(tree.displays[0]!.parentElement).toBe(tree.space)
  expect(tree.viewPoint).toMatchObject({x: 0, y: -1600, z: 900, controls: true})
  const projection = readDisplayStyle(document, tree.displays[0]!)
  expect(projection.transform.position.z).toBeCloseTo(DISPLAY_CENTER_MM.z)
  expect(projection.transform.quaternion.x).toBeCloseTo(Math.SQRT1_2)
  expect(projection.transform.quaternion.w).toBeCloseTo(Math.SQRT1_2)
  expect(projection.pixels).toEqual({width: 2268, height: 1276})
  expect(projection.worldUnitsPerPixelY * projection.viewport.height).toBeCloseTo(337.5)
  expect(tree.objects).toHaveLength(1)
  expect(tree.objects[0]!.localName).toBe("xr-line-segments")
  const frames = [...tree.displays[0]!.querySelectorAll("[data-frame-id]")]
  expect(frames.map(frame => frame.getAttribute("aria-label")).sort()).toEqual(["Браузер", "Сервер"])
  expect(tree.displays[0]!.querySelectorAll("[data-node-id]")).toHaveLength(0)
  expect(tree.displays[0]!.querySelectorAll("[data-link-id]")).toHaveLength(0)
  const physicalDisplay = readDisplayStyle(document, tree.displays[0]!)
  await renderApp(root, document, 700, 1000)
  expect(readDisplayStyle(document, tree.displays[0]!)).toEqual(physicalDisplay)
  expect([...tree.displays[0]!.querySelectorAll("[data-frame-id]")]).toEqual(frames)
  root.unmount()
  expect(body.childNodes).toHaveLength(0)
  expect(document.documentElement).toBe(html)
  expect(readDocumentCompiledStyleSheets(document).styleSheets).toEqual([])
})

test("dock retains Button identity, Flex placement and exact far-view restoration", async () => {
  const document = createDocument({elementFactories: createSpaceElementFactories()})
  const html = document.createElement("html")
  const body = document.createElement("body")
  html.append(body)
  document.append(html)
  const root = createRoot(body)
  await renderApp(root, document, 1000, 700)
  const tree = readSpaceTree(document)
  const gridFactory = tree.objects[0]!.factory
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
  await renderApp(root, document, 1200, 800)
  expect(readViewPoint(tree.viewPoint)).toEqual(farPose)
  returnButton!.click()
  expect(tree.viewPoint.controls).toBe(false)
  expect(Math.hypot(tree.viewPoint.x, tree.viewPoint.y, tree.viewPoint.z - 900)).toBeCloseTo(600)
  expect(dockButton!.getAttribute("aria-pressed")).toBe("false")
  expect(returnButton!.title).toBe("Вернуть пространственный обзор")
  await renderApp(root, document, 800, 600)
  expect(tree.displays[0]!.viewport.width).toBe(2268)
  dock.dispatchEvent(new Event("pointerenter"))
  returnButton!.click()
  expect(readViewPoint(tree.viewPoint)).toEqual(farPose)
  expect([...dock.querySelectorAll("button")]).toEqual([returnButton!, dockButton!])
  expect(tree.viewPoint.controls).toBe(true)
  tree.viewPoint.x = -350
  tree.viewPoint.z = 1250
  const nextFarPose = readViewPoint(tree.viewPoint)
  returnButton!.click()
  returnButton!.click()
  expect(readViewPoint(tree.viewPoint)).toEqual(nextFarPose)
  await renderApp(root, document, 900, 700)
  expect(readViewPoint(tree.viewPoint)).toEqual(nextFarPose)
  expect(tree.objects[0]!.factory).toBe(gridFactory)
  renderer.dispose()
  root.unmount()
})
