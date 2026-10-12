import {expect, test} from "bun:test"
import {mkdtemp, rm} from "node:fs/promises"
import {dirname, join, resolve} from "node:path"
import {tmpdir} from "node:os"
import {createPackageBuilder, type PreparedPackageDependency} from "@metafor/tech-build"

/** Production prepared linking must not embed another DOM identity in the consumer. */
test("actual prepared Visual build links SpatialEdges and Browser through one verified Immersive graph", async () => {
  const directory = await mkdtemp(join(tmpdir(), "visual-prepared-identity-"))
  try {
    const inventoryPath = Bun.resolveSync("@zavx0z/immersive/browser.json", import.meta.dir)
    const inventory = await Bun.file(inventoryPath).json() as {
      name: string; version: string; entries: Record<string, string>; files: {path: string; digest: string}[]
    }
    const prepared: PreparedPackageDependency = {...inventory, root: dirname(inventoryPath)}
    const builder = createPackageBuilder({
      resolvePackage: () => resolve(import.meta.dir, ".."),
      profile: "development",
      preparedDependencies: async () => [prepared],
    })
    const manifest = await Bun.file(resolve(import.meta.dir, "../package.json")).json() as {version: string}
    const result = await builder.buildPackage("@internal/visual", {env: "main", outdir: directory, version: manifest.version})
    expect(result.success, result.stderr).toBe(true)
    const root = result.outputs.find(output => output.artifact === ".")!
    const map = await Bun.file(`${root.path}.map`).json() as {sources: string[]}
    expect(map.sources.some(source => /immersive\/dist\//u.test(source))).toBe(false)
    const spaceDigest = inventory.files.find(file => file.path === inventory.entries["@zavx0z/immersive/space"])!.digest
    const space = result.outputs.find(output => output.sha256 === spaceDigest)!
    expect(space).toBeDefined()
    expect(await Bun.file(space.path).text()).toBe(await Bun.file(join(prepared.root, inventory.entries["@zavx0z/immersive/space"]!)).text())
    const code = await Bun.file(root.path).text()
    expect(code.includes(space.artifact!.slice(space.artifact!.indexOf("/chunk/")))).toBe(true)
    expect(code).toContain("/space/index.js")
  } finally { await rm(directory, {recursive: true, force: true}) }
}, 60_000)
