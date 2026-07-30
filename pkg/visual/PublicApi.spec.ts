import {describe, expect, test} from "bun:test"
import * as centeredNestedApi from "./centered-nested.ts"
import * as layoutApi from "./layout.ts"
import * as publicApi from "./index.ts"
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

  test("packs only declared production sources and contracts", async () => {
    const packageJson = await Bun.file(
      new URL("./package.json", import.meta.url),
    ).json() as {files?: string[]}
    const files = packageJson.files ?? []

    expect(files).toContain("layout.ts")
    expect(files).toContain("centered-nested.ts")
    expect(files).toContain("MeshDetail.ts")
    expect(files).toContain("VisualSceneViewport.ts")
    expect(files).toContain("CONTRACT.md")
    expect(files.some((file) =>
      file.includes("playground") ||
      file.includes("annotation") ||
      file.endsWith(".spec.ts")
    )).toBe(false)
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
