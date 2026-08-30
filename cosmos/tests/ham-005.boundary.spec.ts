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
  const [
    html,
    main,
    visual,
    experienceDocument,
    displayDock,
    themeCss,
    templatePlugin,
    mainPackage,
    visualPackage,
    visualBunfig,
    packageBuild,
    server,
    startupMain,
  ] = await Promise.all([
    Bun.file(join(cosmos, "static/index.html")).text(),
    Bun.file(join(cosmos, "release/main/index.ts")).text(),
    Bun.file(join(cosmos, "internal/visual/main/index.ts")).text(),
    Bun.file(join(cosmos, "internal/visual/main/experience-document.ts")).text(),
    Bun.file(join(cosmos, "internal/visual/main/display-dock.tsx")).text(),
    Bun.file(join(cosmos, "internal/visual/theme.css")).text(),
    Bun.file(join(cosmos, "internal/visual/build/template.plugin.ts")).text(),
    Bun.file(join(cosmos, "release/package.json")).json() as Promise<{
      dependencies?: Record<string, string>
      scripts?: Record<string, string>
    }>,
    Bun.file(join(cosmos, "internal/visual/package.json")).json() as Promise<{
      name?: string
      version?: string
      exports?: {
        "."?: Record<string, string>
        "./theme.css"?: Record<string, string>
      }
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
  expect(visualPackage.exports?.["./theme.css"]).toEqual({
    "internal:main": "./theme.css",
  })
  expect(visualPackage.artifact).toBeUndefined()
  expect(visualPackage.scripts?.prebuild).toBeUndefined()
  expect(visualPackage.scripts?.["build:main"]).toBe(
    "bun build ./main/index.ts --conditions=internal:main --target=browser --production --minify --drop console.debug --outdir=dist/main --splitting",
  )
  expect(visualPackage.dependencies).not.toHaveProperty("@layout/core")
  expect(visualPackage.dependencies).not.toHaveProperty("@ui/elements")
  expect(visualPackage.dependencies).not.toHaveProperty("@ui/hud")
  expect(visualPackage.dependencies?.["@engine/core"]).toBe("link:@engine/core")
  expect(visualPackage.dependencies?.["@ui/components"]).toBe("link:@ui/components")
  expect(visualPackage.dependencies?.["@zavx0z/dom"]).toBe("link:@zavx0z/dom")
  expect(visualPackage.dependencies?.["@zavx0z/react"]).toBe("link:@zavx0z/react")
  expect(visualPackage.dependencies?.["@zavx0z/renderer-browser"])
    .toBe("link:@zavx0z/renderer-browser")
  expect(visualPackage.dependencies?.["@zavx0z/template"]).toBe("link:@zavx0z/template")
  expect(visual).toContain("createDocumentSpaceRuntime,")
  expect(visual).toContain("createBrowserLinkedAuthorStyleSheetHost,")
  expect(visual).toContain('import {GridHelper} from "@engine/core"')
  expect(visual).toContain('import {loadDocumentDefaultFont} from "@engine/core/default-font"')
  expect(visual).toContain('import {createMainExperienceDocument} from "./experience-document.ts"')
  expect(visual).toContain(
    'import {createDisplayDock, type DisplayDock, type DisplayMode} from "./display-dock.tsx"',
  )
  expect(visual).toContain("const createdRuntime = await createDocumentSpaceRuntime({")
  expect(visual).toContain("const [font] = await Promise.all([")
  expect(visual).toContain("const experience = createMainExperienceDocument()")
  expect(visual).toContain('const VISUAL_THEME_ID = "@internal/visual/theme.css"')
  expect(visual).toContain('const themeLink = globalThis.document.createElement("link")')
  expect(visual).toContain('themeLink.rel = "stylesheet"')
  expect(visual).toContain(
    'themeLink.href = `/@internal/visual/theme.css?env=main&version=${import.meta.env.COSMOS_PACKAGE_VERSION}`',
  )
  expect(visual).toContain("globalThis.document.head.append(themeLink)")
  expect(visual).toContain("const linkedThemeHost = createBrowserLinkedAuthorStyleSheetHost({")
  expect(visual).toContain("sources: [{id: VISUAL_THEME_ID, link: themeLink}]")
  expect(visual.indexOf("linkedThemeHost.ready"))
    .toBeLessThan(visual.indexOf("const createdRuntime = await createDocumentSpaceRuntime({"))
  expect(visual).toContain("experience.mountOverlay(mountedDock.root)")
  expect(experienceDocument.match(/createDocument\(\)/g)).toHaveLength(1)
  expect(experienceDocument).toContain('const root = document.createElement("main")')
  expect(experienceDocument).toContain("root.appendChild(surface)")
  expect(experienceDocument).toContain("document.appendChild(root)")
  expect(experienceDocument).toContain("overlay root belongs to another Document")
  expect(visual).toContain([
    "createDocumentSpaceRuntime({",
    "      canvas,",
    "      document: experienceDocument,",
    "      font,",
    "      styleSheets: [],",
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
  expect(visual).toContain('createdGrid.name = "SpaceFloorGrid"')
  expect(visual).toContain("createdRuntime.space.add(createdGrid)")
  expect(visual).toContain('const VISUAL_DISPLAY_ID = "main"')
  expect(visual).toContain("createdRuntime.addPlane({")
  expect(visual).toContain("createdRuntime.addOverlay({")
  expect(visual).toContain("root: mountedDock.container")
  expect(visual).toContain("createdRuntime.setCameraGesturesEnabled(false)")
  expect(visual).toContain("createdRuntime.updatePlane(VISUAL_DISPLAY_ID")
  const planeRegistration = visual.slice(
    visual.indexOf("createdRuntime.addPlane({"),
    visual.indexOf("\n    })", visual.indexOf("createdRuntime.addPlane({")),
  )
  const overlayRegistration = visual.slice(
    visual.indexOf("createdRuntime.addOverlay({"),
    visual.indexOf("\n    })", visual.indexOf("createdRuntime.addOverlay({")),
  )
  for (const registration of [planeRegistration, overlayRegistration]) {
    expect(registration).not.toContain("document:")
    expect(registration).not.toContain("styleSheets:")
    expect(registration).not.toContain("font,")
  }
  expect(visual).toContain("...Object.getOwnPropertyDescriptors(documentRuntime)")
  expect(visual).toContain("value: disposeVisual")
  const disposeVisual = visual.slice(
    visual.indexOf("const disposeVisual = (): void => {"),
    visual.indexOf("\n}\n\n/**", visual.indexOf("const disposeVisual = (): void => {")),
  )
  expect(disposeVisual.indexOf("dock.dispose()"))
    .toBeLessThan(disposeVisual.indexOf("documentRuntime.dispose()"))
  expect(disposeVisual.indexOf("documentRuntime.dispose()"))
    .toBeLessThan(disposeVisual.indexOf("themeHost.dispose()"))
  expect(disposeVisual).toContain("canvasResizeObserver.disconnect()")
  expect(disposeVisual.indexOf("themeHost.dispose()"))
    .toBeLessThan(disposeVisual.indexOf("themeLink.remove()"))
  const initializationFailure = visual.slice(
    visual.indexOf("  } catch (error) {", visual.indexOf("async function initializeVisual")),
    visual.indexOf("\n  }\n}", visual.indexOf("async function initializeVisual")),
  )
  expect(initializationFailure).toContain("canvasResizeObserver?.disconnect()")
  expect(initializationFailure).toContain("dock?.dispose()")
  expect(initializationFailure.indexOf("documentRuntime.dispose()"))
    .toBeLessThan(initializationFailure.indexOf("themeHost?.dispose()"))
  expect(initializationFailure.indexOf("themeHost?.dispose()"))
    .toBeLessThan(initializationFailure.indexOf("themeLink.remove()"))
  expect(displayDock).toContain('import {Button} from "@ui/components/button"')
  expect(displayDock).toContain('import {uiIcons} from "@ui/components/icons"')
  expect(displayDock).toContain('import {createRoot} from "@zavx0z/react"')
  expect(displayDock).toContain("function DisplayDockView(props: DisplayDockViewProps)")
  expect(displayDock.match(/<Button\b/g)).toHaveLength(2)
  expect(displayDock).toContain("style={css`")
  expect(displayDock).toContain('data-expanded={props.expanded ? "true" : "false"}')
  expect(displayDock).toContain("export function createDisplayDock(")
  expect(displayDock).toContain('container.addEventListener("pointerenter"')
  expect(displayDock).not.toContain('document.createElement("button")')
  expect(displayDock).not.toContain("dockButtonStyle")
  expect(displayDock).not.toContain("UiSurface")
  expect(displayDock).not.toContain("HudReturnDock")
  expect(themeCss.trim()).toBe('@import "@ui/components/theme.css";')
  expect(templatePlugin).toContain(
    'fileURLToPath(import.meta.resolve("@ui/components/button"))',
  )
  expect(templatePlugin).toContain("export default createTemplateJsxBunPlugin({")
  expect(templatePlugin).toContain(
    'styleSourceRootIds: ["@internal/visual", "@ui/components"]',
  )
  expect(visual).not.toContain("@cosmos/visual")
  expect(visual).not.toContain("browser/orchestration")
  expect(visualBunfig).toContain('".wgsl" = "text"')
  expect(visualBunfig).toContain("[cosmos.package-build.environments.main]")
  expect(visualBunfig).toContain('plugins = ["./build/template.plugin.ts"]')
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
    const {version: visualVersion} = await Bun.file(
      join(cosmos, "internal/visual/package.json"),
    ).json() as {version: string}
    const visualOutdir = join(directory, "visual-main")
    const [main, visual] = await Promise.all([
      buildPackage("@cosmos/release", {
        env: "main",
        artifact: join(directory, "release-main.js"),
      }),
      buildPackage("@internal/visual", {
        env: "main",
        outdir: visualOutdir,
        version: visualVersion,
      }),
    ])
    const mainOutput = main.outputs.find(({artifact}) => artifact === ".")
    const visualOutput = visual.outputs.find(({artifact}) => artifact === ".")
    const themeOutput = visual.outputs.find(({artifact}) => artifact === "./theme.css")

    expect(main.success).toBeTrue()
    expect(visual.success).toBeTrue()
    expect(mainOutput?.size).toBeGreaterThan(0)
    expect(visualOutput?.size).toBeGreaterThan(0)
    expect(themeOutput).toMatchObject({
      kind: "asset",
      load: "eager",
      type: expect.stringContaining("text/css"),
    })
    expect(visual.outputs.length).toBeGreaterThanOrEqual(3)
    expect(visual.outputs.filter(({path}) => path === themeOutput?.path)).toHaveLength(2)
    expect(visual.outputs.every(({path}) => path.startsWith(`${visualOutdir}/`))).toBeTrue()
    expect(await Bun.file(mainOutput!.path).text()).not.toContain("visual-canvas")
    expect(await Bun.file(mainOutput!.path).text()).not.toContain("/code?module=")
    expect(await Bun.file(mainOutput!.path).text()).toContain('import("@internal/visual")')
    expect(await Bun.file(mainOutput!.path).text()).toContain("@internal/visual")
    const visualSource = await Bun.file(visualOutput!.path).text()
    const themeSource = await Bun.file(themeOutput!.path).text()
    expect(visualSource).toContain("visual-canvas")
    expect(visualSource).toContain("main-display-dock")
    expect(visualSource).toContain("Навигация основной поверхности")
    expect(visualSource).toContain(
      `/@internal/visual/theme.css?env=main&version=${visualVersion}`,
    )
    expect(visualSource).not.toMatch(/jsx-runtime|jsxDEV/)
    expect(visualSource).not.toContain("<button")
    expect(themeSource).toContain("--widget-regular-background")
    expect(themeSource).not.toContain("@import")
  } finally {
    await rm(directory, {recursive: true, force: true})
    expect(await releaseWorkspaceState(cosmos)).toEqual(state)
  }
})
