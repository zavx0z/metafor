import {expect, setDefaultTimeout, test} from "bun:test"
import {fileURLToPath} from "node:url"
import {join} from "node:path"
import {buildPackage} from "../release/server"

const hamiltonian = fileURLToPath(new URL("../", import.meta.url))

setDefaultTimeout(30_000)

test("HAM-005 creates one standard Window environment through internal visual", async () => {
  const [html, main, visual, displayDock, mainPackage, visualPackage, visualBunfig, packageBuild, server, startupMain] = await Promise.all([
    Bun.file(join(hamiltonian, "web/static/index.html")).text(),
    Bun.file(join(hamiltonian, "release/main/index.ts")).text(),
    Bun.file(join(hamiltonian, "internal/visual/main/index.ts")).text(),
    Bun.file(join(hamiltonian, "internal/visual/main/display-dock.ts")).text(),
    Bun.file(join(hamiltonian, "release/package.json")).json() as Promise<{
      dependencies?: Record<string, string>
      scripts?: Record<string, string>
    }>,
    Bun.file(join(hamiltonian, "internal/visual/package.json")).json() as Promise<{
      name?: string
      exports?: {"."?: Record<string, string>}
      dependencies?: Record<string, string>
      artifact?: unknown
      scripts?: Record<string, string>
    }>,
    Bun.file(join(hamiltonian, "internal/visual/bunfig.toml")).text(),
    Bun.file(join(hamiltonian, "release/server/package.ts")).text(),
    Bun.file(join(hamiltonian, "server.ts")).text(),
    Bun.file(join(hamiltonian, "startup/main/index.ts")).text(),
  ])

  expect(html.match(/<canvas\b/g)).toHaveLength(1)
  expect(html).toContain('<canvas id="visual-canvas"></canvas>')
  expect(html).toContain("#visual-canvas")
  expect(html.match(/<script\b[^>]*\bsrc=/g)).toHaveLength(1)
  expect(html).toContain('src="/@hamiltonian/startup?env=main"')
  expect(html).toContain('"@hamiltonian/release": "/@hamiltonian/release?env=main"')
  expect(html).toContain('"@internal/visual": "/@internal/visual?env=main"')

  expect(main).toContain('const {runtime} = await import("@internal/visual")')
  expect(main).toContain('console.debug("[@hamiltonian/release:main]", "Visual runtime подключён", {')
  expect(main).toContain("runtime: Object.keys(runtime)")
  expect(mainPackage.dependencies).toEqual({"@internal/visual": "workspace:^0.1.10"})
  expect(visualPackage.name).toBe("@internal/visual")
  expect(visualPackage.exports?.["."]).toEqual({
    "internal:main": "./main/index.ts",
    "internal:server": "./server/index.ts",
  })
  expect(visualPackage.artifact).toBeUndefined()
  expect(visualPackage.scripts?.prebuild).toBeUndefined()
  expect(visualPackage.scripts?.["build:main"]).toBe(
    "bun build ./main/index.ts --conditions=internal:main --target=browser --production --minify --drop console.debug --outfile=dist/main.js",
  )
  expect(visualPackage.dependencies?.["@ui/elements"]).toBe("workspace:*")
  expect(visualPackage.dependencies?.["@metafor/engine"]).toBe("workspace:*")
  expect(visualPackage.dependencies?.["@ui/hud"]).toBe("workspace:*")
  expect(visual).toContain('import {UiRuntime} from "@ui/elements"')
  expect(visual).toContain('import {GridHelper} from "@metafor/engine"')
  expect(visual).toContain('import {DisplayDockSurface} from "./display-dock.ts"')
  expect(visual).toContain("export const runtime = await UiRuntime.create(canvas")
  expect(visual).toContain(
    'console.debug("[@internal/visual:main]", "основное visual-окружение создано", {',
  )
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
  expect(visualBunfig).toContain('".wgsl" = "text"')
  expect(mainPackage.scripts?.prebuild).toBeUndefined()
  expect(mainPackage.scripts?.["build:main"]).toBe(
    "bun build ./main/index.ts --conditions=hamiltonian:main --conditions=internal:main --target=browser --packages=external --production --minify --drop console.debug --outfile=dist/main.js",
  )
  expect(packageBuild).toContain("packageArtifactPath(location.root, build)")

  expect(server).toContain('"/assets/fonts/JetBrainsMono-Bold.ttf"')
  expect(server).toContain('new URL("../pkg/engine/static/JetBrainsMono-Bold.ttf"')
  expect(startupMain).toContain('import("@hamiltonian/release")')
  expect(startupMain).not.toContain("UiRuntime")
})

test("UPD-002 builds Window release and internal visual as separate artifacts", async () => {
  const [main, visual] = await Promise.all([
    buildPackage("@hamiltonian/release", {env: "main"}),
    buildPackage("@internal/visual", {env: "main"}),
  ])
  const mainOutput = main.outputs[0]
  const visualOutput = visual.outputs[0]

  expect(main.success).toBeTrue()
  expect(visual.success).toBeTrue()
  expect(mainOutput?.size).toBeGreaterThan(0)
  expect(visualOutput?.size).toBeGreaterThan(0)
  expect(await Bun.file(mainOutput!.path).text()).not.toContain("visual-canvas")
  expect(await Bun.file(mainOutput!.path).text()).not.toContain("/code?module=")
  expect(await Bun.file(mainOutput!.path).text()).toContain('import("@internal/visual")')
  expect(await Bun.file(mainOutput!.path).text()).toContain("@internal/visual")
  expect(await Bun.file(visualOutput!.path).text()).toContain("visual-canvas")
})
