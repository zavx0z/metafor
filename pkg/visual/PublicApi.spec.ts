import {describe, expect, test} from "bun:test"
import * as centeredNestedApi from "./centered-nested.ts"
import * as layoutApi from "./layout.ts"
import * as publicApi from "./index.ts"
import * as storeApi from "./store.ts"
import * as viewportApi from "./VisualSceneViewport.ts"

describe("@metafor/visual production surface", () => {
  test("keeps layout strategies executable and development catalogs private", () => {
    expect(layoutApi.CenteredNested.status).toBe("ready")
    expect(centeredNestedApi.CenteredNested).toBe(layoutApi.CenteredNested)
    expect(centeredNestedApi.TORUS_LAYOUT_BASELINE)
      .toBe(layoutApi.TORUS_LAYOUT_BASELINE)
    expect(centeredNestedApi).not.toHaveProperty("OutsideIn")
    expect(typeof layoutApi.CenteredNested.buildScene).toBe("function")
    expect(typeof layoutApi.OutsideIn.buildScene).toBe("function")
    expect(layoutApi.visualOwnerDarkParticleIdFromAtomId(7)).toBe(14)
    expect(typeof viewportApi.buildVisualSceneRenderPlan).toBe("function")
    expect(typeof viewportApi.createVisualSceneViewport).toBe("function")
    expect(publicApi).not.toHaveProperty("Visual")
    expect(publicApi).not.toHaveProperty("CenteredNested")
    expect(publicApi).not.toHaveProperty("createVisualSceneViewport")
    expect(publicApi).not.toHaveProperty("VisualComponents")
    expect(publicApi).not.toHaveProperty("createStateGraphViewport")
    expect(publicApi).not.toHaveProperty("projectVisualScene")
    expect(publicApi).not.toHaveProperty("layoutCenteredNestedFields")
  })

  test("exposes the persistent Store without a layout or a renderer", () => {
    expect(typeof storeApi.hydrateVisualStore).toBe("function")
    expect(typeof storeApi.VisualStore).toBe("function")
    expect(typeof storeApi.classifyVisualInvalidation).toBe("function")
    expect(typeof storeApi.visualScopeKeepsPlacements).toBe("function")
    expect(typeof storeApi.diffVisualScenePayload).toBe("function")
    expect(typeof storeApi.visualDeltaPatchOperations).toBe("function")
    expect(typeof storeApi.isLaterVisualFrontier).toBe("function")
    expect(storeApi).not.toHaveProperty("CenteredNested")
    expect(storeApi).not.toHaveProperty("OutsideIn")
    expect(storeApi).not.toHaveProperty("Visual")
    expect(storeApi).not.toHaveProperty("buildVisualScenePayload")
    expect(storeApi).not.toHaveProperty("createVisualSceneViewport")
  })

  test("keeps the Store entrypoint free of layout geometry and the catalog", async () => {
    const result = await Bun.build({
      entrypoints: [new URL("./store.ts", import.meta.url).pathname],
      minify: true,
      target: "browser",
    })
    expect(result.success).toBe(true)
    const javascript = (
      await Promise.all(
        result.outputs
          .filter((output) => output.path.endsWith(".js"))
          .map((output) => output.text()),
      )
    ).join("\n")

    expect(javascript).not.toContain("outside-in")
    expect(javascript).not.toContain("centered-nested")
    expect(javascript).not.toContain("defineVisualLayout")
    expect(javascript).not.toContain("ThinFilmMaterial")
    expect(javascript).not.toContain("Renderer")
  })

  test("packs only declared production sources and contracts", async () => {
    const packageJson = await Bun.file(
      new URL("./package.json", import.meta.url),
    ).json() as {files?: string[]}
    const files = packageJson.files ?? []

    expect(files).toContain("layout.ts")
    expect(files).toContain("centered-nested.ts")
    expect(files).toContain("store.ts")
    expect(files).toContain("VisualStore.ts")
    expect(files).toContain("MeshDetail.ts")
    expect(files).toContain("VisualSceneViewport.ts")
    expect(files).toContain("CONTRACT.md")
    expect(files.some((file) =>
      file.includes("playground") ||
      file.includes("annotation") ||
      file.endsWith(".spec.ts")
    )).toBe(false)
  })

  test("declares every source its entrypoints actually reach", async () => {
    const root = new URL("./", import.meta.url)
    const packageJson = await Bun.file(new URL("package.json", root)).json() as {
      exports: Record<string, {default: string}>
    }
    const declared = new Set(
      (await Bun.file(new URL("package.json", root)).json() as {files: string[]})
        .files,
    )

    const reached = new Set<string>()
    const walk = async (specifier: string): Promise<void> => {
      if (reached.has(specifier)) return
      reached.add(specifier)
      const source = await Bun.file(new URL(specifier, root)).text()
      for (const match of source.matchAll(/from\s+"(\.[^"]+)"/g)) {
        const resolved = new URL(match[1]!, new URL(specifier, root))
        await walk(resolved.href.slice(root.href.length))
      }
    }
    for (const entry of Object.values(packageJson.exports)) {
      await walk(entry.default.replace(/^\.\//, ""))
    }

    const undeclared = [...reached].filter((file) => !declared.has(file))
    expect(undeclared).toEqual([])
  })

  test("keeps the centered-nested geometry entrypoint engine-neutral", async () => {
    const result = await Bun.build({
      entrypoints: [new URL("./centered-nested.ts", import.meta.url).pathname],
      minify: true,
      target: "browser",
    })
    expect(result.success).toBe(true)
    const javascript = (
      await Promise.all(
        result.outputs
          .filter((output) => output.path.endsWith(".js"))
          .map((output) => output.text()),
      )
    ).join("\n")

    expect(javascript).not.toContain("ThinFilmMaterial")
    expect(new TextEncoder().encode(javascript).byteLength).toBeLessThan(80_000)
  })
})
