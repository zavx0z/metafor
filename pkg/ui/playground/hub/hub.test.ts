import {describe, expect, test} from "bun:test"
import {join} from "node:path"
import {fileURLToPath} from "node:url"
import {startPlaygroundHubServer} from "@ui/playground/server"
import {COMPONENT_STORIES} from "../../components/playground/stories.ts"
import {ELEMENT_STORIES} from "../../elements/playground/stories.ts"
import {UI_PACKAGE_CATALOG} from "./catalog/package-catalog.ts"
import {mountedStoryRepresentativeRoute} from "./mounted-story-page.ts"
import {
  createUiPlaygroundPages,
  uiPlaygroundPageFiles,
} from "./server/page-registry.ts"

const hubRoot = fileURLToPath(new URL(".", import.meta.url))
const playgroundRoot = fileURLToPath(new URL("..", import.meta.url))

describe("central UI playground hub", () => {
  test("keeps overview pathname separate from the representative Workbench story", () => {
    expect(mountedStoryRepresentativeRoute(ELEMENT_STORIES, "")).toBe("div/basic/background")
    expect(mountedStoryRepresentativeRoute(ELEMENT_STORIES, "div")).toBe("div/basic/background")
    expect(mountedStoryRepresentativeRoute(ELEMENT_STORIES, "div/scroll")).toBe("div/scroll/vertical")
    expect(mountedStoryRepresentativeRoute(ELEMENT_STORIES, "div/scroll/horizontal")).toBe("div/scroll/horizontal")
    expect(mountedStoryRepresentativeRoute(COMPONENT_STORIES, "")).toBe("button/basic/contained")
    expect(mountedStoryRepresentativeRoute(COMPONENT_STORIES, "button")).toBe("button/basic/contained")
    expect(mountedStoryRepresentativeRoute(COMPONENT_STORIES, "button/icon")).toBe("button/icon/svg")
    expect(() => mountedStoryRepresentativeRoute(COMPONENT_STORIES, "missing")).toThrow("Unknown mounted playground route")
  })

  test("catalogs every UI package without inventing a HUD visual stand", async () => {
    expect(UI_PACKAGE_CATALOG.map(({id, routePrefix, defaultRoute, presentation}) => ({
      id,
      routePrefix,
      defaultRoute,
      presentation,
    }))).toEqual([
      {id: "elements", routePrefix: "/elements", defaultRoute: "/elements/", presentation: "webgpu"},
      {id: "components", routePrefix: "/components", defaultRoute: "/components/", presentation: "webgpu"},
      {id: "playground", routePrefix: "/playground", defaultRoute: "/playground/", presentation: "webgpu-diagnostic"},
      {id: "hud", routePrefix: "/hud", defaultRoute: "/hud/", presentation: "dom"},
    ])
    const hudBody = await Bun.file(join(hubRoot, "packages/hud/hud-playground-body.html")).text()
    const hudEntry = await Bun.file(join(hubRoot, "packages/hud/hud-playground.ts")).text()
    expect(hudBody).toContain("Отдельный visual playground для HUD пока не реализован")
    expect(hudBody).toContain("не создаёт UiRuntime")
    expect(hudBody).not.toContain("node-view")
    expect(hudEntry).not.toContain("представление нод")
    expect(hudEntry).not.toContain("UiRuntime")
    expect(hudEntry).not.toContain("canvas")
  })

  test("registers one catalog and four independently built package pages", () => {
    const pages = createUiPlaygroundPages()
    expect(pages.map(({id, mountPath}) => [id, mountPath])).toEqual([
      ["catalog", "/"],
      ["elements", "/elements"],
      ["components", "/components"],
      ["playground", "/playground"],
      ["hud", "/hud"],
    ])
    expect(pages.every(({routeTree}) => routeTree !== null)).toBeTrue()
    expect(pages.find(({id}) => id === "elements")?.routeTree?.leaves).toHaveLength(50)
    expect(pages.find(({id}) => id === "components")?.routeTree?.leaves).toHaveLength(80)
    expect(pages.find(({id}) => id === "playground")?.routeTree?.leaves).toEqual(["overview", "details"])
    expect(pages.find(({id}) => id === "hud")?.routeTree?.leaves).toEqual([])
    expect(uiPlaygroundPageFiles("elements").body).toEqual({kind: "canvas", canvasId: "stage-canvas"})
    expect(uiPlaygroundPageFiles("components").body).toEqual({kind: "canvas", canvasId: "stage-canvas"})
    expect(uiPlaygroundPageFiles("playground").body).toEqual({kind: "canvas", canvasId: "playground-canvas"})
    expect(uiPlaygroundPageFiles("hud").body.kind).toBe("html")
  })

  test("keeps the existing Workbench mounted on overview and leaf routes", async () => {
    const elements = await Bun.file(join(playgroundRoot, "../elements/playground/entry.ts")).text()
    const components = await Bun.file(join(playgroundRoot, "../components/playground/entry.ts")).text()
    const fixture = await Bun.file(join(playgroundRoot, "fixture/entry.ts")).text()
    const mounted = await Bun.file(join(hubRoot, "mounted-story-page.ts")).text()

    expect(elements).toContain('const ELEMENTS_MOUNT_PATH = "/elements"')
    expect(elements).toContain("createMountedStoryRouter<ElementsStoryRoute>")
    expect(elements).toContain("runtime.addSurface(preview")
    expect(elements).toContain("runtime.addSurface(storyPanel")
    expect(components).toContain('const COMPONENTS_MOUNT_PATH = "/components"')
    expect(components).toContain("createMountedStoryRouter<ComponentsStoryRoute>")
    expect(components).toContain("runtime.addSurface(preview")
    expect(components).toContain("runtime.addSurface(storyPanel")
    expect(fixture).toContain('const PLAYGROUND_MOUNT_PATH = "/playground"')
    expect(fixture).toContain("new PlaygroundRouteTreeRouter(pageRouteTree")
    expect(mounted).toContain("new PlaygroundRouteTreeRouter(routeTree, {basePath})")
    expect(mounted).toContain("representativeDetailRoute")
    expect(mounted).not.toContain("PlaygroundOverviewSurface")
  })

  test("serves canonical package overviews, exact leaves and isolated page assets on one origin", async () => {
    const server = startPlaygroundHubServer({
      pages: createUiPlaygroundPages(),
      hostname: "127.0.0.1",
      port: 0,
      staticFiles: {
        "/JetBrainsMono-Bold.ttf": join(playgroundRoot, "../../engine/static/JetBrainsMono-Bold.ttf"),
      },
    })
    try {
      const origin = server.url.origin
      const catalog = await fetch(`${origin}/`)
      const catalogHtml = await catalog.text()
      expect(catalog.status).toBe(200)
      expect(catalogHtml).toContain("<title>UI playground</title>")
      expect(catalogHtml).toContain('id="ui-package-catalog"')

      for (const [path, location] of [
        ["/elements", "/elements/"],
        ["/elements/div", "/elements/div/"],
        ["/components", "/components/"],
        ["/playground", "/playground/"],
        ["/hud", "/hud/"],
      ] as const) {
        const response = await fetch(`${origin}${path}`, {redirect: "manual"})
        expect(response.status, path).toBe(308)
        expect(response.headers.get("location"), path).toBe(location)
      }

      for (const [path, title, marker, pageId] of [
        ["/elements/", "@ui/elements", 'id="stage-canvas"', "elements"],
        ["/elements/div/", "@ui/elements", 'id="stage-canvas"', "elements"],
        ["/elements/div/basic/background", "@ui/elements", 'id="stage-canvas"', "elements"],
        ["/components/", "@ui/components", 'id="stage-canvas"', "components"],
        ["/components/button/basic/contained", "@ui/components", 'id="stage-canvas"', "components"],
        ["/playground/", "@ui/playground", 'id="playground-canvas"', "playground"],
        ["/playground/overview", "@ui/playground", 'id="playground-canvas"', "playground"],
        ["/hud/", "@ui/hud", 'id="ui-hud-overview"', "hud"],
      ] as const) {
        const response = await fetch(`${origin}${path}`)
        const html = await response.text()
        expect(response.status, path).toBe(200)
        expect(html, path).toContain(`<title>UI playground · ${title}</title>`)
        expect(html, path).toContain(marker)
        expect(html, path).toContain(`/@playground-assets/${pageId}/entry.js`)
        expect(html, path).toContain('data-playground-home href="/"')
        expect(html, path).toContain(">Home</a>")
      }

      for (const path of [
        "/missing",
        "/elements/missing",
        "/components/button/missing",
        "/playground/missing",
        "/hud/missing",
      ]) expect(await fetch(`${origin}${path}`).then(({status}) => status), path).toBe(404)

      const [catalogEntry, hudEntry, elementsEntry, componentsEntry, fixtureEntry] = await Promise.all(
        ["catalog", "hud", "elements", "components", "playground"].map(async (pageId) => {
          const response = await fetch(`${origin}/@playground-assets/${pageId}/entry.js`)
          expect(response.status, pageId).toBe(200)
          return response.text()
        }),
      )
      expect(catalogEntry).toContain("uiPackageCount")
      expect(catalogEntry).not.toContain("UiRuntime")
      expect(hudEntry).toContain("hudPlayground")
      expect(hudEntry).not.toContain("UiRuntime")
      expect(elementsEntry).toContain("elementsPlayground")
      expect(elementsEntry).not.toContain("componentsPlayground")
      expect(componentsEntry).toContain("componentsPlayground")
      expect(fixtureEntry).toContain("playgroundReady")
    } finally {
      server.stop(true)
    }
  }, 30_000)

  test("keeps the runnable hub fixed to the one adopted port", async () => {
    const source = await Bun.file(join(hubRoot, "server.ts")).text()
    expect(source).toContain("UI_PLAYGROUND_PORT ?? 4017")
    expect(source).toContain("startPlaygroundHubServer")
    expect(source).not.toContain("7901")
    expect(source).not.toContain("4192")
  })

  test("removes parallel package servers and exposes one root command", async () => {
    for (const path of [
      "../elements/playground/server.ts",
      "../components/playground/server.ts",
      "fixture/server.ts",
    ]) expect(await Bun.file(join(playgroundRoot, path)).exists(), path).toBeFalse()
    const manifest = await Bun.file(join(playgroundRoot, "package.json")).json() as {scripts?: Record<string, string>}
    const elements = await Bun.file(join(playgroundRoot, "../elements/package.json")).json() as {scripts?: Record<string, string>}
    const components = await Bun.file(join(playgroundRoot, "../components/package.json")).json() as {scripts?: Record<string, string>}
    expect(manifest.scripts?.playground).toBe("bun hub/server.ts")
    expect(elements.scripts?.playground).toBeUndefined()
    expect(components.scripts?.playground).toBeUndefined()
  })
})
