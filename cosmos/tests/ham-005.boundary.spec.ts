import {expect, setDefaultTimeout, test} from "bun:test"
import {mkdtemp, rm} from "node:fs/promises"
import {tmpdir} from "node:os"
import {fileURLToPath} from "node:url"
import {join} from "node:path"
import {buildPackage} from "../release/server"
import {releaseWorkspaceState} from "./fixture/workspace-state"

const cosmos = fileURLToPath(new URL("../", import.meta.url))

setDefaultTimeout(30_000)

test("HAM-005 creates one standard Window environment through internal visual", async () => {
  const [html, main, visual, experienceDocument, displayDock, mainPackage, visualPackage, visualBunfig, packageBuild, server, startupMain] = await Promise.all([
    Bun.file(join(cosmos, "static/index.html")).text(),
    Bun.file(join(cosmos, "release/main/index.ts")).text(),
    Bun.file(join(cosmos, "internal/visual/main/index.ts")).text(),
    Bun.file(join(cosmos, "internal/visual/main/experience-document.ts")).text(),
    Bun.file(join(cosmos, "internal/visual/main/display-dock.ts")).text(),
    Bun.file(join(cosmos, "release/package.json")).json() as Promise<{
      dependencies?: Record<string, string>
      scripts?: Record<string, string>
    }>,
    Bun.file(join(cosmos, "internal/visual/package.json")).json() as Promise<{
      name?: string
      exports?: {"."?: Record<string, string>}
      dependencies?: Record<string, string>
      artifact?: unknown
      scripts?: Record<string, string>
    }>,
    Bun.file(join(cosmos, "internal/visual/bunfig.toml")).text(),
    Bun.file(join(cosmos, "release/server/package/manifest.ts")).text(),
    Bun.file(join(cosmos, "release/server/runtime.ts")).text(),
    Bun.file(join(cosmos, "startup/main/index.ts")).text(),
  ])

  expect(html.match(/<canvas\b/g)).toHaveLength(1)
  expect(html).toContain('<canvas id="visual-canvas"></canvas>')
  expect(html).toContain('<meta name="engine-default-font" content="/assets/fonts/jetbrains-mono-bold.ttf">')
  expect(html).toContain("#visual-canvas")
  expect(html.match(/<script\b[^>]*\bsrc=/g)).toHaveLength(1)
  expect(html).toContain('src="/@cosmos/startup?env=main"')
  expect(html).toContain('"@cosmos/release": "/@cosmos/release?env=main"')
  expect(html).toContain('"@internal/visual": "/@internal/visual?env=main"')

  expect(main).toContain('const {runtime} = await import("@internal/visual")')
  expect(main).toContain('console.debug("[@cosmos/release:main]", "Visual runtime подключён", {')
  expect(main).toContain("runtime: Object.keys(runtime)")
  expect(mainPackage.dependencies).toEqual({
    "@engine/core": "link:@engine/core",
    "@internal/visual": "workspace:^0.1.10",
  })
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
  expect(visualPackage.dependencies).not.toHaveProperty("@layout/core")
  expect(visualPackage.dependencies).not.toHaveProperty("@ui/elements")
  expect(visualPackage.dependencies).not.toHaveProperty("@ui/hud")
  expect(visualPackage.dependencies?.["@engine/core"]).toBe("link:@engine/core")
  expect(visualPackage.dependencies?.["@ui/components"]).toBe("link:@ui/components")
  expect(visualPackage.dependencies?.["@zavx0z/dom"]).toBe("link:@zavx0z/dom")
  expect(visualPackage.dependencies?.["@zavx0z/renderer-browser"])
    .toBe("link:@zavx0z/renderer-browser")
  expect(visual).toContain("createDocumentSpaceRuntime,")
  expect(visual).toContain('import {GridHelper} from "@engine/core"')
  expect(visual).toContain('import {loadDocumentDefaultFont} from "@engine/core/default-font"')
  expect(visual).toContain('import {createMainExperienceDocument} from "./experience-document.ts"')
  expect(visual).toContain('import {createDisplayDock, type DisplayMode} from "./display-dock.ts"')
  expect(visual).toContain("export const runtime = await createDocumentSpaceRuntime({")
  expect(visual).toContain("const font = await loadDocumentDefaultFont()")
  expect(visual).toContain("const experience = createMainExperienceDocument()")
  expect(visual).toContain("experience.mountOverlay(dock.root)")
  expect(experienceDocument.match(/createDocument\(\)/g)).toHaveLength(1)
  expect(experienceDocument).toContain('const root = document.createElement("main")')
  expect(experienceDocument).toContain("root.appendChild(surface)")
  expect(experienceDocument).toContain("document.appendChild(root)")
  expect(experienceDocument).toContain("overlay root belongs to another Document")
  expect(visual).toContain([
    "createDocumentSpaceRuntime({",
    "  canvas,",
    "  document: experienceDocument,",
    "  font,",
    "  styleSheets: [],",
  ].join("\n"))
  expect(visual).toContain(
    'console.debug("[@internal/visual:main]", "основное visual-окружение создано", {',
  )
  expect(visual).not.toContain("visualEnvironment")
  expect(visual).not.toContain("createVisualEnvironment")
  expect(visual).not.toContain("function prepare")
  expect(visual).not.toContain("requiredCanvas")
  expect(visual).toContain("cameraGestures: true")
  expect(visual).toContain("new GridHelper(2400, 24)")
  expect(visual).toContain('grid.name = "SpaceFloorGrid"')
  expect(visual).toContain("runtime.space.add(grid)")
  expect(visual).toContain('const VISUAL_DISPLAY_ID = "main"')
  expect(visual).toContain("runtime.addPlane({")
  expect(visual).toContain("runtime.addOverlay({")
  expect(visual).toContain("root: dock.container")
  expect(visual).toContain("runtime.setCameraGesturesEnabled(false)")
  expect(visual).toContain("runtime.updatePlane(VISUAL_DISPLAY_ID")
  const planeRegistration = visual.slice(
    visual.indexOf("runtime.addPlane({"),
    visual.indexOf("\n})", visual.indexOf("runtime.addPlane({")),
  )
  const overlayRegistration = visual.slice(
    visual.indexOf("runtime.addOverlay({"),
    visual.indexOf("\n})", visual.indexOf("runtime.addOverlay({")),
  )
  for (const registration of [planeRegistration, overlayRegistration]) {
    expect(registration).not.toContain("document:")
    expect(registration).not.toContain("styleSheets:")
    expect(registration).not.toContain("font,")
  }
  expect(displayDock).toContain('import type {')
  expect(displayDock).toContain('from "@zavx0z/dom"')
  expect(displayDock).toContain('import {uiIcons} from "@ui/components/icons"')
  expect(displayDock).toContain("export function createDisplayDock(")
  expect(displayDock).toContain('container.addEventListener("pointerenter"')
  expect(displayDock).toContain("dockButton.title = mode")
  expect(displayDock).not.toContain("UiSurface")
  expect(displayDock).not.toContain("HudReturnDock")
  expect(visual).not.toContain("@cosmos/visual")
  expect(visual).not.toContain("browser/orchestration")
  expect(visualBunfig).toContain('".wgsl" = "text"')
  expect(mainPackage.scripts?.prebuild).toBeUndefined()
  expect(mainPackage.scripts?.["build:main"]).toBe(
    "bun build ./main/index.ts --conditions=cosmos:main --conditions=internal:main --target=browser --packages=external --production --minify --drop console.debug --outfile=dist/main.js",
  )
  expect(main).toContain('const DEFAULT_FONT_META_NAME = "engine-default-font"')
  expect(main).toContain('declaration.content = "/assets/fonts/jetbrains-mono-bold.ttf"')
  expect(main.indexOf("document.head.append(declaration)"))
    .toBeLessThan(main.indexOf('import("@internal/visual")'))
  expect(packageBuild).toContain("packageArtifactPath(location.root, build)")

  expect(server).toContain('"/assets/fonts/jetbrains-mono-bold.ttf"')
  expect(server).toContain('import.meta.resolve("@engine/core/fonts/jetbrains-mono-bold.ttf")')
  expect(startupMain).toContain('import("@cosmos/release")')
  expect(startupMain).not.toContain("UiRuntime")
})

test("UPD-002 builds Window release and internal visual as separate artifacts", async () => {
  const state = await releaseWorkspaceState(cosmos)
  const directory = await mkdtemp(join(tmpdir(), "metafor-cosmos-ham-005-build-"))
  try {
    const [main, visual] = await Promise.all([
      buildPackage("@cosmos/release", {
        env: "main",
        artifact: join(directory, "release-main.js"),
      }),
      buildPackage("@internal/visual", {
        env: "main",
        artifact: join(directory, "visual-main.js"),
      }),
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
  } finally {
    await rm(directory, {recursive: true, force: true})
    expect(await releaseWorkspaceState(cosmos)).toEqual(state)
  }
})
