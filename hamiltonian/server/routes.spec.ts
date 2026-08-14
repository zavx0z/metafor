import {describe, expect, test} from "bun:test"
import {fileURLToPath} from "node:url"

const routesPath = fileURLToPath(new URL("./routes.ts", import.meta.url))

const exactRouteDeclarations = [
  '"/"',
  '"/index.html"',
  '"/orchestration.js"',
  '"/layout-worker.js"',
  '"/web-push-client.js"',
  '"/sw-entry.js"',
  '"/control"',
  '"/push/vapid-public-key"',
  '"/lab/wake-service-worker"',
  '"/manifest.json"',
  '"/lab/status"',
  "[release.modulePath]",
  '"/window-entry.js"',
  '"/app.js"',
  '"/embodiment-worker.js"',
  '"/embodiment-worker-entry.js"',
  '"/styles.css"',
  '"/engine-static/JetBrainsMono-Bold.ttf"',
  '"/core/runtime.js"',
  '"/core/cache.js"',
  '"/core/browser-control.js"',
  '"/update/page-update.js"',
  '"/core/monitor.js"',
  '"/core/lifecycle.js"',
  '"/core/orchestration.js"',
] as const

describe("Hamiltonian Bun routes table", () => {
  test("declares the exact complete HTTP surface once", async () => {
    const source = await Bun.file(routesPath).text()
    const declarations = [...source.matchAll(/^\s{6}("\/[^"]+"|"\/"|\[release\.modulePath\]):/gm)]
      .map((match) => match[1])
    expect(declarations).toEqual([...exactRouteDeclarations])
  })

  test("documents every route immediately above its declaration", async () => {
    const source = await Bun.file(routesPath).text()
    for (const route of exactRouteDeclarations) {
      const declaration = route.startsWith("[") ? `${route}:` : `${route}:`
      const before = source.slice(0, source.indexOf(declaration))
      const comment = before.match(/\/\*\*([\s\S]*?)\*\/\s*$/)?.[1] ?? ""
      expect(comment).toMatch(/[А-Яа-яЁё]/)
      expect(comment).toMatch(/автор|Bearer|без author/i)
      expect(comment).toMatch(/side effect|mutation|state|не меня|не мутир|создаёт|открывает|публикует/i)
      expect(comment).toMatch(/владе|принадлежит|owner/i)
    }
  })

  test("keeps the historical method asymmetry visible", async () => {
    const source = await Bun.file(routesPath).text()
    expect(source).toMatch(/"\/push\/vapid-public-key":\s*\{\s*GET:/)
    expect(source).toMatch(/"\/lab\/wake-service-worker":\s*\{\s*POST:/)
    for (const allMethodPath of [
      "/orchestration.js", "/layout-worker.js", "/web-push-client.js", "/sw-entry.js",
      "/control", "/manifest.json", "/lab/status",
    ]) {
      expect(source).toMatch(new RegExp(`${escapeRegExp(JSON.stringify(allMethodPath))}:\\s*(?:async\\s*)?\\(`))
    }
  })
})

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
