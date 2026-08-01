import {describe, expect, test} from "bun:test"
import * as centeredNestedApi from "../src/centered-nested.ts"
import * as layoutApi from "../src/layout.ts"
import * as payloadApi from "../src/payload.ts"
import * as publicApi from "../src/index.ts"

type VisualPackageJson = Readonly<{
  dependencies?: Readonly<Record<string, string>>
  exports: Readonly<Record<string, Readonly<{default: string; types: string}>>>
  files: readonly string[]
}>

const packageJson = async (): Promise<VisualPackageJson> =>
  Bun.file(new URL("../package.json", import.meta.url)).json()

describe("@metafor/visual production surface", () => {
  test("exports exactly two executable production strategies", () => {
    expect(layoutApi.Visual.map(({slug}) => slug).toSorted()).toEqual([
      "centered-nested",
      "outside-in",
    ])
    expect(layoutApi.CenteredNested.status).toBe("ready")
    expect(centeredNestedApi.CenteredNested).toBe(layoutApi.CenteredNested)
    expect(centeredNestedApi).not.toHaveProperty("OutsideIn")
    expect(typeof layoutApi.CenteredNested.buildScene).toBe("function")
    expect(typeof layoutApi.OutsideIn.buildScene).toBe("function")
    expect(layoutApi.visualOwnerDarkParticleIdFromAtomId(7)).toBe(14)
  })

  test("keeps Engine adapters and playground symbols private", () => {
    expect(publicApi).not.toHaveProperty("createVisualSceneViewport")
    expect(publicApi).not.toHaveProperty("createStateGraphViewport")
    expect(publicApi).not.toHaveProperty("createVisualQuantumMaterial")
    expect(publicApi).not.toHaveProperty("createVisualLineMaterial")
    expect(publicApi).not.toHaveProperty("VisualStory")
    expect(publicApi).not.toHaveProperty("createVisualStoryPlayer")
  })

  test("exposes stateless payload and reconciliation helpers", () => {
    expect(typeof payloadApi.buildVisualScenePayload).toBe("function")
    expect(typeof payloadApi.classifyVisualInvalidation).toBe("function")
    expect(typeof payloadApi.diffVisualScenePayload).toBe("function")
    expect(payloadApi).not.toHaveProperty("hydrateVisualStore")
    expect(payloadApi).not.toHaveProperty("VisualStore")
  })

  test("targets every public export at src and exposes no private subpath", async () => {
    const manifest = await packageJson()
    expect(Object.keys(manifest.exports).toSorted()).toEqual([
      ".",
      "./layout",
      "./layout/centered-nested",
      "./payload",
      "./payload/reconcile",
    ])
    for (const entry of Object.values(manifest.exports)) {
      expect(entry.default.startsWith("./src/")).toBe(true)
      expect(entry.types).toBe(entry.default)
    }
    expect(manifest.dependencies).not.toHaveProperty("@metafor/engine")
    expect(manifest.files.toSorted()).toEqual([
      "CONTRACT.md",
      "README.md",
      "src",
    ])
  })

  test("keeps production code only in src and tests outside it", async () => {
    const packageRoot = new URL("../", import.meta.url)
    const rootSources: string[] = []
    for await (const file of new Bun.Glob("*.ts").scan({cwd: packageRoot.pathname})) {
      rootSources.push(file)
    }
    expect(rootSources).toEqual([])

    const srcTests: string[] = []
    for await (const file of new Bun.Glob("**/*.spec.ts").scan({
      cwd: new URL("../src/", import.meta.url).pathname,
    })) srcTests.push(file)
    expect(srcTests).toEqual([])

    for (const removed of [
      "VisualStory.ts",
      "VisualStoryEvents.ts",
      "stories.ts",
      "playground/StoryLab.ts",
    ]) {
      expect(await Bun.file(new URL(removed, packageRoot)).exists()).toBe(false)
    }
  })

  test("keeps production source free of playground and Engine imports", async () => {
    const root = new URL("../src/", import.meta.url)
    const glob = new Bun.Glob("**/*.ts")
    for await (const file of glob.scan({cwd: root.pathname})) {
      if (file.endsWith(".spec.ts")) continue
      const source = await Bun.file(new URL(file, root)).text()
      expect(source).not.toMatch(/from\s+["'][^"']*playground/)
      expect(source).not.toMatch(/from\s+["']@metafor\/engine["']/)
    }
  })

  test("keeps the centered-nested entrypoint Engine-neutral", async () => {
    const result = await Bun.build({
      entrypoints: [new URL("../src/centered-nested.ts", import.meta.url).pathname],
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
