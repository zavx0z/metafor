import {expect, test} from "bun:test"
import {fileURLToPath} from "node:url"
import {join} from "node:path"

const hamiltonian = fileURLToPath(new URL("../", import.meta.url))

test("HAM-005 creates one empty Window visual environment in the importer", async () => {
  const [html, main, mainPackage, staticRoutes, startupMain] = await Promise.all([
    Bun.file(join(hamiltonian, "web/static/index.html")).text(),
    Bun.file(join(hamiltonian, "web/import/main/main.ts")).text(),
    Bun.file(join(hamiltonian, "web/import/main/package.json")).json() as Promise<{
      dependencies?: Record<string, string>
    }>,
    Bun.file(join(hamiltonian, "web/static/routes.ts")).text(),
    Bun.file(join(hamiltonian, "web/startup/main/index.ts")).text(),
  ])

  expect(html.match(/<canvas\b/g)).toHaveLength(1)
  expect(html).toContain('<canvas id="visual-canvas"></canvas>')
  expect(html).toContain("#visual-canvas")
  expect(html.match(/<script\b[^>]*\bsrc=/g)).toHaveLength(1)
  expect(html).toContain('src="/startup-main.js"')

  expect(mainPackage.dependencies?.["@ui/elements"]).toBe("workspace:*")
  expect(main).toContain('import {UiRuntime} from "@ui/elements"')
  expect(main).toContain("visualEnvironment ??= createVisualEnvironment()")
  expect(main).toContain("await UiRuntime.create(canvas")
  expect(main).toContain("surfaceDisplay: false")
  expect(main).toContain("grid: false")
  expect(main).toContain("runtime.handleResize()")
  expect(main).not.toContain("@hamiltonian/visual")
  expect(main).not.toContain("browser/orchestration")

  expect(staticRoutes).toContain('"/assets/fonts/JetBrainsMono-Bold.ttf"')
  expect(staticRoutes).toContain('type: "font/ttf"')
  expect(startupMain).toContain('import("/import/main")')
  expect(startupMain).not.toContain("UiRuntime")
})
