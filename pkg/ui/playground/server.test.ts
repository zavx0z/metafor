import {afterEach, describe, expect, test} from "bun:test"
import {mkdir, mkdtemp, rm} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {
  createPlaygroundPage,
  startPlaygroundHubServer,
  startPlaygroundServer,
} from "./server.ts"
import {definePlaygroundRouteTree} from "./route-tree.ts"

const temporaryRoots: string[] = []

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((path) => rm(path, {recursive: true, force: true})))
})

describe("@ui/playground server", () => {
  test("serves a browser entry named client.ts through the public /entry.js route", async () => {
    const root = await mkdtemp(join(tmpdir(), "ui-playground-server-"))
    temporaryRoots.push(root)
    const entrypoint = join(root, "client.ts")
    const lazyEntrypoint = join(root, "lazy.ts")
    const stylePath = join(root, "style.css")
    const fontPath = join(root, "font.ttf")
    await Promise.all([
      Bun.write(entrypoint, 'document.documentElement.dataset.sharedEntry = "ready"; void import("./lazy.ts").then(({lazyEntry}) => { document.documentElement.dataset.lazyEntry = lazyEntry })'),
      Bun.write(lazyEntrypoint, 'export const lazyEntry = "loaded-lazily"'),
      Bun.write(stylePath, "html { background: black }"),
      Bun.write(fontPath, new Uint8Array([0, 1, 2, 3])),
    ])
    const server = startPlaygroundServer({
      packageName: "@ui/playground",
      hostname: "127.0.0.1",
      port: 0,
      entrypoint,
      stylePath,
      fontPath,
    })

    try {
      const html = await fetch(server.url).then((response) => response.text())
      expect(html).toContain("<title>@ui/playground</title>")
      expect(html).not.toContain("fixture")
      const response = await fetch(new URL("/entry.js", server.url))
      const source = await response.text()
      expect(response.status).toBe(200)
      expect(response.headers.get("content-type")).toContain("text/javascript")
      expect(source).toContain("sharedEntry")
      const lazyImport = source.match(/import\(["']([^"']+\.js)["']\)/)?.[1]
      expect(lazyImport).toBeDefined()
      expect(lazyImport).not.toBe("/entry.js")
      const lazyResponse = await fetch(new URL(lazyImport!, server.url))
      const lazySource = await lazyResponse.text()
      expect(lazyResponse.status).toBe(200)
      expect(lazySource).toContain("loaded-lazily")
      expect(source).not.toContain("entry.js was not emitted")
      expect(source).not.toContain("<!doctype html>")
    } finally {
      server.stop(true)
    }
  })

  test("mounts independent deep pages with namespaced atomic assets and one build each", async () => {
    const root = await mkdtemp(join(tmpdir(), "ui-playground-hub-"))
    temporaryRoots.push(root)
    const alphaRoot = join(root, "alpha")
    const betaRoot = join(root, "beta")
    const sharedPath = join(root, "shared.txt")
    await Promise.all([mkdir(alphaRoot), mkdir(betaRoot)])
    await Promise.all([
      Bun.write(join(alphaRoot, "client.ts"), 'document.documentElement.dataset.page = "alpha-entry"; void import("./lazy.ts").then(({value}) => { document.documentElement.dataset.lazy = value })'),
      Bun.write(join(alphaRoot, "lazy.ts"), 'export const value = "alpha-lazy"'),
      Bun.write(join(alphaRoot, "style.css"), "html { background: rgb(1, 2, 3) }"),
      Bun.write(join(betaRoot, "client.ts"), 'document.documentElement.dataset.page = "beta-entry"; void import("./lazy.ts").then(({value}) => { document.documentElement.dataset.lazy = value })'),
      Bun.write(join(betaRoot, "lazy.ts"), 'export const value = "beta-lazy"'),
      Bun.write(join(betaRoot, "style.css"), "html { background: rgb(4, 5, 6) }"),
      Bun.write(join(betaRoot, "body.html"), '<main id="beta-body">Beta body</main>'),
      Bun.write(sharedPath, "shared-static"),
    ])
    const alpha = createPlaygroundPage({
      id: "alpha",
      mountPath: "/alpha",
      packageName: "Alpha package",
      entrypoint: join(alphaRoot, "client.ts"),
      stylePath: join(alphaRoot, "style.css"),
      body: {kind: "canvas", canvasId: "alpha-canvas"},
    })
    const beta = createPlaygroundPage({
      id: "beta",
      mountPath: "/beta",
      packageName: "Beta package",
      entrypoint: join(betaRoot, "client.ts"),
      stylePath: join(betaRoot, "style.css"),
      body: {kind: "html", bodyHtmlPath: join(betaRoot, "body.html")},
    })
    const server = startPlaygroundHubServer({
      pages: [alpha, beta],
      hostname: "127.0.0.1",
      port: 0,
      staticFiles: {"/shared.txt": sharedPath},
    })

    try {
      const [alphaResponse, betaResponse] = await Promise.all([
        fetch(new URL("/alpha/deep/story", server.url)),
        fetch(new URL("/beta/another/deep/story", server.url)),
      ])
      const [alphaHtml, betaHtml] = await Promise.all([alphaResponse.text(), betaResponse.text()])
      expect(alphaResponse.status).toBe(200)
      expect(betaResponse.status).toBe(200)
      expect(alphaHtml).toContain("<title>Alpha package</title>")
      expect(alphaHtml).toContain('<base href="/alpha/">')
      expect(alphaHtml).toContain('<canvas id="alpha-canvas"></canvas>')
      expect(alphaHtml).toContain('src="/@playground-assets/alpha/entry.js"')
      expect(betaHtml).toContain("<title>Beta package</title>")
      expect(betaHtml).toContain('<main id="beta-body">Beta body</main>')
      expect(betaHtml).toContain('src="/@playground-assets/beta/entry.js"')

      const alphaEntryUrl = new URL("/@playground-assets/alpha/entry.js", server.url)
      const betaEntryUrl = new URL("/@playground-assets/beta/entry.js", server.url)
      const [alphaEntryA, alphaEntryB, betaEntry] = await Promise.all([
        fetch(alphaEntryUrl),
        fetch(alphaEntryUrl),
        fetch(betaEntryUrl),
      ])
      const [alphaSourceA, alphaSourceB, betaSource] = await Promise.all([
        alphaEntryA.text(),
        alphaEntryB.text(),
        betaEntry.text(),
      ])
      expect(alphaEntryA.status).toBe(200)
      expect(alphaEntryB.status).toBe(200)
      expect(betaEntry.status).toBe(200)
      expect(alphaSourceA).toBe(alphaSourceB)
      expect(alphaSourceA).toContain("alpha-entry")
      expect(alphaSourceA).not.toContain("beta-entry")
      expect(betaSource).toContain("beta-entry")
      expect(betaSource).not.toContain("alpha-entry")
      expect(alpha.diagnostics.builds).toBe(1)
      expect(beta.diagnostics.builds).toBe(1)

      const alphaLazyImport = alphaSourceA.match(/import\(["']([^"']+\.js)["']\)/)?.[1]
      const betaLazyImport = betaSource.match(/import\(["']([^"']+\.js)["']\)/)?.[1]
      expect(alphaLazyImport).toBeDefined()
      expect(betaLazyImport).toBeDefined()
      const alphaLazyUrl = new URL(alphaLazyImport!, alphaEntryUrl)
      const betaLazyUrl = new URL(betaLazyImport!, betaEntryUrl)
      expect(alphaLazyUrl.pathname).toStartWith("/@playground-assets/alpha/")
      expect(betaLazyUrl.pathname).toStartWith("/@playground-assets/beta/")
      expect(await fetch(alphaLazyUrl).then((response) => response.text())).toContain("alpha-lazy")
      expect(await fetch(betaLazyUrl).then((response) => response.text())).toContain("beta-lazy")

      expect(await fetch(new URL("/@playground-assets/alpha/missing.js", server.url)).then((response) => response.status)).toBe(404)
      expect(await fetch(new URL("/@playground-assets/missing/entry.js", server.url)).then((response) => response.status)).toBe(404)
      expect(await fetch(new URL("/missing", server.url)).then((response) => response.status)).toBe(404)
      expect(await fetch(new URL("/shared.txt", server.url)).then((response) => response.text())).toBe("shared-static")
    } finally {
      server.stop(true)
    }
  })

  test("serves only registered route-tree overviews and leaves with canonical redirects", async () => {
    const root = await mkdtemp(join(tmpdir(), "ui-playground-route-tree-"))
    temporaryRoots.push(root)
    const entrypoint = join(root, "client.ts")
    const stylePath = join(root, "style.css")
    const bodyPath = join(root, "body.html")
    await Promise.all([
      Bun.write(entrypoint, 'document.documentElement.dataset.routeTree = "ready"'),
      Bun.write(stylePath, "html { background: black }"),
      Bun.write(bodyPath, '<main id="route-tree-body">Route tree</main>'),
    ])
    const catalog = createPlaygroundPage({
      id: "catalog",
      mountPath: "/",
      packageName: "Catalog",
      entrypoint,
      stylePath,
      body: {kind: "html", bodyHtmlPath: bodyPath},
      routeTree: definePlaygroundRouteTree({leaves: [] as const}),
    })
    const ui = createPlaygroundPage({
      id: "ui",
      mountPath: "/ui",
      packageName: "UI",
      entrypoint,
      stylePath,
      body: {kind: "canvas", canvasId: "ui-canvas"},
      homePath: "/",
      routeTree: definePlaygroundRouteTree({
        leaves: ["button/basic/contained", "button/basic/text"] as const,
      }),
    })
    expect(() => createPlaygroundPage({
      id: "invalid",
      mountPath: "/invalid",
      packageName: "Invalid",
      entrypoint,
      stylePath,
      body: {kind: "canvas", canvasId: "invalid-canvas"},
      routeTree: definePlaygroundRouteTree({leaves: [] as const}),
      deepRoutes: false,
    })).toThrow("routeTree cannot be combined with deepRoutes")
    expect(() => createPlaygroundPage({
      id: "invalid-home",
      mountPath: "/invalid-home",
      packageName: "Invalid home",
      entrypoint,
      stylePath,
      body: {kind: "canvas", canvasId: "invalid-home-canvas"},
      homePath: "relative",
    })).toThrow("home path must be an absolute pathname")
    const server = startPlaygroundHubServer({pages: [catalog, ui], hostname: "127.0.0.1", port: 0})

    try {
      const redirects = [
        ["/ui", "/ui/"],
        ["/ui/button", "/ui/button/"],
        ["/ui/button/basic", "/ui/button/basic/"],
        ["/ui/button/basic/contained/", "/ui/button/basic/contained"],
      ] as const
      for (const [pathname, location] of redirects) {
        const response = await fetch(new URL(pathname, server.url), {redirect: "manual"})
        expect(response.status, pathname).toBe(308)
        expect(response.headers.get("location"), pathname).toBe(location)
      }

      for (const pathname of [
        "/",
        "/ui/",
        "/ui/button/",
        "/ui/button/basic/",
        "/ui/button/basic/contained",
        "/ui/button/basic/text",
      ]) {
        const response = await fetch(new URL(pathname, server.url))
        expect(response.status, pathname).toBe(200)
        const html = await response.text()
        if (pathname === "/") expect(html).not.toContain("data-playground-home")
        else {
          expect(html).toContain('data-playground-home href="/"')
          expect(html).toContain(">Home</a>")
        }
      }
      for (const pathname of [
        "/unknown",
        "/ui/missing",
        "/ui/button/missing",
        "/ui/button/basic/contained/extra",
        "/ui-other/button/basic/contained",
      ]) {
        expect(await fetch(new URL(pathname, server.url)).then(({status}) => status), pathname).toBe(404)
      }
    } finally {
      server.stop(true)
    }
  })
})
