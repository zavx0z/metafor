import {afterAll, beforeAll, expect, test} from "bun:test"
import {mkdtemp, rm, symlink} from "node:fs/promises"
import {join, resolve} from "node:path"
import {tmpdir} from "node:os"
import {pathToFileURL} from "node:url"
import {
  createDocument,
  Event,
  readDocumentCompiledStyleSheets,
} from "@zavx0z/dom"
import {createDocumentRenderer} from "@zavx0z/renderer"
import visualTemplatePlugin from "../build/template.plugin.ts"
import type {createDisplayDock as CreateDisplayDock} from "./display-dock.tsx"

type CompiledDisplayDockModule = Readonly<{
  createDisplayDock: typeof CreateDisplayDock
}>

let outputDirectory = ""
let compiled: CompiledDisplayDockModule

beforeAll(async () => {
  outputDirectory = await mkdtemp(join(tmpdir(), "metafor-visual-display-dock-"))
  await symlink(
    resolve(import.meta.dir, "../../../..", "node_modules"),
    join(outputDirectory, "node_modules"),
    "dir",
  )
  const result = await Bun.build({
    entrypoints: [join(import.meta.dir, "display-dock.tsx")],
    outdir: outputDirectory,
    target: "bun",
    format: "esm",
    external: [
      "@zavx0z/dom",
      "@zavx0z/react",
      "@zavx0z/template/compiled",
    ],
    plugins: [visualTemplatePlugin],
  })
  if (!result.success) throw new Error("Visual display dock did not compile")
  const output = result.outputs.find(({kind}) => kind === "entry-point")
  if (output === undefined) throw new Error("Visual display dock emitted no entrypoint")
  compiled = await import(
    `${pathToFileURL(output.path).href}?visual-dock=${Date.now()}`
  ) as CompiledDisplayDockModule
})

afterAll(async () => {
  if (outputDirectory !== "") await rm(outputDirectory, {recursive: true, force: true})
})

test("display dock keeps production Button identity across hover and navigation state", () => {
  const document = createDocument()
  let returns = 0
  const dock = compiled.createDisplayDock(document, () => { returns += 1 })

  expect(dock.root.querySelector("#main-display-dock")).toBe(dock.container)
  expect([...dock.container.querySelectorAll("button")]).toEqual([
    dock.returnButton,
    dock.dockButton,
  ])
  expect(dock.expanded).toBeFalse()
  expect(dock.dockButton.title).toBe("Приблизить основную поверхность")
  expect(dock.dockButton.getAttribute("aria-pressed")).toBe("false")
  dock.resize(1_000)
  document.appendChild(dock.root)

  const adopted = readDocumentCompiledStyleSheets(document).styleSheets
  const compiledCss = adopted.map(({cssText}) => cssText).join("\n")
  expect(compiledCss).toContain('[data-expanded="true"]')
  expect(compiledCss).toContain("--widget-regular-background")
  expect(compiledCss).toContain(":hover")

  const renderer = createDocumentRenderer({
    document,
    root: document,
    viewport: {width: 1_000, height: 700},
  })
  expect(renderer.flush().boxByNode.has(dock.returnButton)).toBeFalse()

  const container = dock.container
  const returnButton = dock.returnButton
  const dockButton = dock.dockButton
  dock.container.dispatchEvent(new Event("pointerenter"))
  expect(dock.expanded).toBeTrue()
  expect(dock.container).toBe(container)
  expect(dock.returnButton).toBe(returnButton)
  expect(dock.dockButton).toBe(dockButton)
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

  renderer.dispose()
  dock.dispose()
  dock.dockButton.click()
  expect(dock.pinned).toBeFalse()
  expect(document.querySelector("#main-display-dock")).toBeNull()
  expect(readDocumentCompiledStyleSheets(document).styleSheets).toEqual([])
})
