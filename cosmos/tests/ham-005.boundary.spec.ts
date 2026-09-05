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
    app,
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
    Bun.file(join(cosmos, "internal/visual/main/index.tsx")).text(),
    Bun.file(join(cosmos, "internal/visual/main/app.tsx")).text(),
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
    "internal:main": "./main/index.tsx",
    "internal:server": "./server/index.ts",
  })
  expect(visualPackage.exports?.["./theme.css"]).toEqual({
    "internal:main": "./theme.css",
  })
  expect(visualPackage.artifact).toBeUndefined()
  expect(visualPackage.scripts?.prebuild).toBeUndefined()
  expect(visualPackage.scripts?.["build:main"]).toBe(
    "bun build ./main/index.tsx --conditions=internal:main --target=browser --production --minify --drop console.debug --outdir=dist/main --splitting",
  )
  expect(visualPackage.dependencies).not.toHaveProperty("@layout/core")
  expect(visualPackage.dependencies).not.toHaveProperty("@ui/elements")
  expect(visualPackage.dependencies).not.toHaveProperty("@ui/hud")
  for (const name of ["browser", "component", "dom", "engine", "renderer", "space", "template", "ui", "webgpu"]) {
    expect(visualPackage.dependencies?.[`@zavx0z/${name}`]).toBe(`file:../../../../webxr-space/${name}`)
  }
  for (const legacy of ["@engine/core", "@ui/components", "@zavx0z/react", "@zavx0z/renderer-browser", "@zavx0z/renderer-webgpu"]) {
    expect(visualPackage.dependencies).not.toHaveProperty(legacy)
  }
  expect(visual).toContain("await attach({")
  expect(visual).toContain("app: <VisualApp")
  expect(visual).toContain("stylesheets:")
  expect(app).toContain("useSpace(state => state.size)")
  expect(app).toContain('controls={mode === "far"}')
  expect(app).not.toMatch(/up[XYZ]=/)
  for (const owner of ["Space", "ViewPoint", "Asset", "Display", "HUD", "DisplayDock"]) {
    expect(app).toContain(`<${owner}`)
  }
  expect(app).toContain('id="main"')
  expect(app).toContain('id="main-hud"')
  expect(app).toContain("new GridHelper(2400, 24)")
  expect(app).toContain("quaternionX={Math.SQRT1_2}")
  expect(app).not.toContain("key=")
  for (const source of [visual, app, displayDock]) {
    expect(source).not.toContain("createDocumentSpaceRuntime")
    expect(source).not.toContain("createDocument(")
    expect(source).not.toContain("createRoot(")
    expect(source).not.toContain("new ResizeObserver")
    expect(source).not.toContain("requestAnimationFrame")
  }
  expect(visual).toContain('console.debug("[@internal/visual:main]", "основное visual-окружение создано", {')
  expect(displayDock).toContain('from "@zavx0z/ui/buttons/button"')
  expect(displayDock).toContain('from "@zavx0z/component"')
  expect(displayDock.match(/<Button\b/g)).toHaveLength(2)
  expect(displayDock).toContain("align-items: center")
  expect(displayDock).toContain("justify-content: space-between")
  expect(displayDock).not.toContain("position: absolute")
  expect(themeCss.trim()).toBe('@import "@zavx0z/ui/themes/theme.css";')
  expect(templatePlugin).toContain('import.meta.resolve("@zavx0z/ui/buttons/button")')
  expect(templatePlugin).toContain('import.meta.resolve("@zavx0z/space")')
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
    expect(visual.success, `${visual.stdout}\n${visual.stderr}`).toBeTrue()
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
