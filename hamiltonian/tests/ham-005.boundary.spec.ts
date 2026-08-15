import {expect, test} from "bun:test"
import {fileURLToPath} from "node:url"
import {join} from "node:path"
import {build} from "../macro"

const hamiltonian = fileURLToPath(new URL("../", import.meta.url))

test("HAM-005 creates one standard Window visual environment in the importer", async () => {
  const [html, main, mainPackage, mainBunfig, macro, staticRoutes, startupMain] = await Promise.all([
    Bun.file(join(hamiltonian, "web/static/index.html")).text(),
    Bun.file(join(hamiltonian, "web/import/main/main.ts")).text(),
    Bun.file(join(hamiltonian, "web/import/main/package.json")).json() as Promise<{
      dependencies?: Record<string, string>
    }>,
    Bun.file(join(hamiltonian, "web/import/main/bunfig.toml")).text(),
    Bun.file(join(hamiltonian, "macro.ts")).text(),
    Bun.file(join(hamiltonian, "web/static/routes.ts")).text(),
    Bun.file(join(hamiltonian, "web/startup/main/index.ts")).text(),
  ])

  expect(html.match(/<canvas\b/g)).toHaveLength(1)
  expect(html).toContain('<canvas id="visual-canvas"></canvas>')
  expect(html).toContain("#visual-canvas")
  expect(html.match(/<script\b[^>]*\bsrc=/g)).toHaveLength(1)
  expect(html).toContain('src="/startup-main.js"')

  expect(mainPackage.dependencies?.["@ui/elements"]).toBe("workspace:*")
  expect(mainPackage.dependencies?.["@metafor/engine"]).toBe("workspace:*")
  expect(main).toContain('import {UiRuntime} from "@ui/elements"')
  expect(main).toContain('import {GridHelper} from "@metafor/engine"')
  expect(main).toContain("visualEnvironment ??= createVisualEnvironment()")
  expect(main).toContain("await UiRuntime.create(canvas")
  expect(main).toContain("surfaceDisplay: false")
  expect(main).toContain("grid: false")
  expect(main).toContain("new GridHelper(2400, 24)")
  expect(main).toContain('grid.name = "SpaceFloorGrid"')
  expect(main).toContain("runtime.space.add(grid)")
  expect(main).toContain("runtime.viewPoint.position.set(1600, -1600, 1200)")
  expect(main).toContain("runtime.viewPoint.getTarget().set(0, 0, 0)")
  expect(main).toContain("runtime.handleResize()")
  expect(main).not.toContain("@hamiltonian/visual")
  expect(main).not.toContain("browser/orchestration")
  expect(mainBunfig).toContain('".wgsl" = "text"')
  expect(macro).toContain("Bun.spawnSync(command, {cwd: owner.root})")

  expect(staticRoutes).toContain('"/assets/fonts/JetBrainsMono-Bold.ttf"')
  expect(staticRoutes).toContain('type: "font/ttf"')
  expect(startupMain).toContain('import("/import/main")')
  expect(startupMain).not.toContain("UiRuntime")
})

test("HAM-005 bundles the visual importer as one JavaScript artifact", async () => {
  const output = await build("@import/main")

  expect(output.trim().length).toBeGreaterThan(0)
  expect(output).toContain("visual-canvas")
})
