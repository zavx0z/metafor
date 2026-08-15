import {expect, test} from "bun:test"
import {fileURLToPath} from "node:url"
import {join} from "node:path"
import {build} from "../macro"

const hamiltonian = fileURLToPath(new URL("../", import.meta.url))

test("HAM-005 creates one standard Window environment through internal visual", async () => {
  const [html, main, visual, displayDock, mainPackage, visualPackage, mainBunfig, macro, staticRoutes, startupMain] = await Promise.all([
    Bun.file(join(hamiltonian, "web/static/index.html")).text(),
    Bun.file(join(hamiltonian, "web/import/main/main.ts")).text(),
    Bun.file(join(hamiltonian, "internal/visual/index.ts")).text(),
    Bun.file(join(hamiltonian, "internal/visual/display-dock.ts")).text(),
    Bun.file(join(hamiltonian, "web/import/main/package.json")).json() as Promise<{
      dependencies?: Record<string, string>
    }>,
    Bun.file(join(hamiltonian, "internal/visual/package.json")).json() as Promise<{
      name?: string
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

  expect(main.trim()).toBe('import "@internal/visual"')
  expect(mainPackage.dependencies).toEqual({"@internal/visual": "workspace:*"})
  expect(visualPackage.name).toBe("@internal/visual")
  expect(visualPackage.dependencies?.["@ui/elements"]).toBe("workspace:*")
  expect(visualPackage.dependencies?.["@metafor/engine"]).toBe("workspace:*")
  expect(visualPackage.dependencies?.["@ui/hud"]).toBe("workspace:*")
  expect(visual).toContain('import {UiRuntime} from "@ui/elements"')
  expect(visual).toContain('import {GridHelper} from "@metafor/engine"')
  expect(visual).toContain('import {DisplayDockSurface} from "./display-dock.ts"')
  expect(visual).not.toContain("visualEnvironment")
  expect(visual).not.toContain("createVisualEnvironment")
  expect(visual).not.toContain("function prepare")
  expect(visual).not.toContain("requiredCanvas")
  expect(visual).toContain("await UiRuntime.create(canvas")
  expect(visual).toContain('initial: "far"')
  expect(visual).toContain("surfaceDisplay: false")
  expect(visual).toContain("grid: false")
  expect(visual).toContain("new GridHelper(2400, 24)")
  expect(visual).toContain('grid.name = "SpaceFloorGrid"')
  expect(visual).toContain("runtime.space.add(grid)")
  expect(visual).toContain("runtime.viewPoint.position.set(0, -1600, 900)")
  expect(visual).toContain("runtime.viewPoint.getTarget().set(0, 0, 900)")
  expect(visual).toContain("runtime.handleResize()")
  expect(visual).toContain('const VISUAL_DISPLAY_ID = "main"')
  expect(visual).toContain("runtime.createDisplay({")
  expect(visual).toContain("runtime.viewportDisplayMetrics()")
  expect(visual).toContain("runtime.addHudSurface(dock")
  expect(visual).toContain("runtime.focusDisplay(VISUAL_DISPLAY_ID)")
  expect(visual).toContain('runtime.setDisplayMode("far")')
  expect(visual).toContain("runtime.resizeDisplay(VISUAL_DISPLAY_ID")
  expect(displayDock).toContain('import {HudReturnDock, type HudRect} from "@ui/hud"')
  expect(displayDock).toContain("export class DisplayDockSurface extends UiSurface")
  expect(displayDock).toContain("containsPointer(localX: number, localY: number)")
  expect(displayDock).toContain("HudReturnDock(this")
  expect(visual).not.toContain("@hamiltonian/visual")
  expect(visual).not.toContain("browser/orchestration")
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
