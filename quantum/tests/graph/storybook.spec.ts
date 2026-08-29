import {afterAll, describe, expect, test} from "bun:test"
import {mkdtemp, readdir, readFile, rm} from "node:fs/promises"
import {tmpdir} from "node:os"
import {basename, join, resolve} from "node:path"

const repositoryRoot = resolve(import.meta.dir, "../../..")
const temporaryRoots: string[] = []

afterAll(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, {recursive: true, force: true})))
})

describe("MetaFor external Storybook delivery", () => {
  test("declares one project with real Graph and Bulk package owners", async () => {
    const project = await json(join(repositoryRoot, ".storybook/manifest.json"))
    const graph = await json(join(repositoryRoot, "types/.storybook/manifest.json"))
    const bulk = await json(join(repositoryRoot, "quantum/bulk/.storybook/manifest.json"))
    const rootPackage = await json(join(repositoryRoot, "package.json"))

    expect(project).toMatchObject({
      schemaVersion: 1,
      kind: "project",
      id: "metafor",
      packages: [
        {declaration: "../types/.storybook/manifest.json"},
        {declaration: "../quantum/bulk/.storybook/manifest.json"},
      ],
    })
    expect(graph).toMatchObject({
      schemaVersion: 1,
      kind: "package",
      id: "@metafor/types",
      runtime: {module: "./runtime.ts", export: "runtime"},
      catalog: "./catalog.json",
    })
    expect(bulk).toMatchObject({
      schemaVersion: 1,
      kind: "package",
      id: "bulk",
      runtime: {module: "./runtime.ts", export: "runtime"},
      catalog: "./catalog.json",
    })
    expect(rootPackage.workspaces).not.toContain("quantum/storybook")
    expect(rootPackage.devDependencies["@zavx0z/storybook"]).toBeUndefined()
    expect(rootPackage.devDependencies["@nodes/storybook"]).toBeUndefined()
    expect(await Bun.file(join(repositoryRoot, "quantum/storybook/package.json")).exists()).toBeFalse()
    for (const manifest of [project, graph, bulk]) {
      expect(manifest.$schema).toStartWith("https://raw.githubusercontent.com/zavx0z/storybook/main/schemas/")
    }
  })

  test("preserves all six leaves and fourteen legacy overview identities", async () => {
    const baseline = await json(join(repositoryRoot, ".storybook/route-baseline.json"))
    const graph = await json(join(repositoryRoot, "types/.storybook/catalog.json"))
    const bulk = await json(join(repositoryRoot, "quantum/bulk/.storybook/catalog.json"))
    const leaves = [
      ...catalogLeaves(graph),
      ...catalogLeaves(bulk),
    ]
    const overviews = [
      "",
      "graph",
      ...catalogOverviews(graph),
      ...catalogOverviews(bulk),
    ]

    expect(leaves).toEqual(baseline.leafRoutes)
    expect(overviews).toEqual(baseline.overviewRoutes)
    expect(routeHash(leaves)).toBe(baseline.hashes.leafRoutes)
    expect(routeHash(overviews)).toBe(baseline.hashes.overviewRoutes)
  })

  test("browser-compiles package-owned runtimes and stories without legacy Storybook", async () => {
    const output = await mkdtemp(join(tmpdir(), "metafor-external-storybook-build-"))
    temporaryRoots.push(output)
    const graphRoot = join(repositoryRoot, "types/.storybook")
    const bulkRoot = join(repositoryRoot, "quantum/bulk/.storybook")
    const graphCatalog = await json(join(graphRoot, "catalog.json"))
    const bulkCatalog = await json(join(bulkRoot, "catalog.json"))
    const entrypoints = [
      join(graphRoot, "runtime.ts"),
      ...catalogModules(graphCatalog).map((path) => resolve(graphRoot, path)),
      join(bulkRoot, "runtime.ts"),
      ...catalogModules(bulkCatalog).map((path) => resolve(bulkRoot, path)),
    ]
    const result = await Bun.build({
      entrypoints,
      outdir: output,
      target: "browser",
      format: "esm",
      splitting: true,
      naming: {
        entry: "[dir]/[name].[ext]",
        chunk: "chunks/[name]-[hash].[ext]",
      },
      loader: {".wgsl": "text"},
      throw: false,
    })
    if (!result.success) throw new Error(result.logs.map(String).join("\n"))
    expect(result.success).toBeTrue()
    const sources = await Promise.all(result.outputs
      .filter(({path}) => path.endsWith(".js"))
      .map((output) => output.text()))
    const runtimeSources = result.outputs
      .filter(({kind, path}) => kind === "entry-point" && basename(path) === "runtime.js")
    expect(runtimeSources).toHaveLength(2)
    expect(sources.some((source) => source.includes("createGraphNodeTree"))).toBeTrue()
    expect(sources.some((source) => source.includes("createBulkHudDocument"))).toBeTrue()
    for (const source of sources) {
      for (const forbidden of [
        "@zavx0z/storybook",
        "StorybookRouteTreeRouter",
        "createStorybookDomWorkbench",
        "createDocumentCanvasRuntime",
        "@layout/core",
        "@ui/elements",
        "UiRuntime",
        "StorybookNavigationSurface",
      ]) expect(source).not.toContain(forbidden)
    }
  })

  test("keeps production exports unchanged while stories consume exact owners", async () => {
    const types = await json(join(repositoryRoot, "types/package.json"))
    const bulk = await json(join(repositoryRoot, "quantum/bulk/package.json"))
    expect(Object.keys(types.exports)).toEqual([
      "./metafor/fields",
      "./metafor/mass",
      "./metafor/superposition",
      "./metafor/action",
      "./metafor/process",
      "./metafor/finally",
      "./metafor/reactions",
      "./metafor/matter",
      "./metafor/schema",
      "./metafor/graph",
      "./boundary/atom",
      "./boundary/value",
      "./boundary/topology",
      "./bulk/manifest",
    ])
    expect(Object.keys(bulk.exports)).toEqual([".", "./settings", "./store", "./visual", "./web"])
    const graphSources = await sourceTree(join(repositoryRoot, "types/.storybook"))
    const bulkSources = await sourceTree(join(repositoryRoot, "quantum/bulk/.storybook"))
    expect(graphSources).toContain('from "@metafor/node-tree/graph"')
    expect(graphSources).toContain('from "@ui/components/checkbox"')
    expect(bulkSources).toContain('from "@ui/components/hud"')
    expect(graphSources).not.toContain("@zavx0z/storybook")
    expect(bulkSources).not.toContain("@zavx0z/storybook")
  })
})

async function json(path: string): Promise<any> {
  return JSON.parse(await readFile(path, "utf8"))
}

function catalogLeaves(catalog: any): string[] {
  return catalog.categories.flatMap((category: any) =>
    category.subjects.flatMap((subject: any) =>
      subject.variants.map((variant: any) => variant.route)))
}

function catalogOverviews(catalog: any): string[] {
  return catalog.categories.flatMap((category: any) => [
    category.route,
    ...category.subjects.map((subject: any) => subject.route),
  ])
}

function catalogModules(catalog: any): string[] {
  return catalog.categories.flatMap((category: any) =>
    category.subjects.flatMap((subject: any) =>
      subject.variants.map((variant: any) => variant.module.path)))
}

function routeHash(routes: readonly string[]): string {
  return new Bun.CryptoHasher("sha256").update(routes.join("\n")).digest("hex")
}

async function sourceTree(root: string): Promise<string> {
  const sources: string[] = []
  for (const entry of await readdir(root, {withFileTypes: true, recursive: true})) {
    if (!entry.isFile() || !entry.name.endsWith(".ts") || entry.name.endsWith(".spec.ts")) continue
    sources.push(await readFile(join(entry.parentPath, entry.name), "utf8"))
  }
  return sources.join("\n")
}
