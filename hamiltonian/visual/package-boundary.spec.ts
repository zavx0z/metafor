import {describe, expect, test} from "bun:test"
import {readdir} from "node:fs/promises"
import {join, relative} from "node:path"
import {fileURLToPath} from "node:url"

const packageRoot = fileURLToPath(new URL(".", import.meta.url))
const hamiltonianRoot = fileURLToPath(new URL("..", import.meta.url))
const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url))

describe("Hamiltonian visual package boundary", () => {
  test("registers the private workspace and its existing exports", async () => {
    const rootPackage = await Bun.file(join(repositoryRoot, "package.json")).json() as {
      workspaces?: string[]
    }
    const hamiltonianPackage = await Bun.file(join(hamiltonianRoot, "package.json")).json() as {
      dependencies?: Record<string, string>
    }
    const visualPackage = await Bun.file(join(packageRoot, "package.json")).json() as {
      name?: string
      private?: boolean
      exports?: Record<string, string>
      dependencies?: Record<string, string>
    }

    expect(rootPackage.workspaces).toContain("hamiltonian/visual")
    expect(hamiltonianPackage.dependencies?.["@hamiltonian/visual"]).toBe("workspace:*")
    expect(visualPackage.name).toBe("@hamiltonian/visual")
    expect(visualPackage.private).toBeTrue()
    expect(visualPackage.exports).toEqual({
      ".": "./index.ts",
      "./presentation": "./presentation/index.ts",
    })
    expect(Object.keys(visualPackage.dependencies ?? {}).sort()).toEqual([
      "@metafor/engine",
      "@nodes/hud",
      "@nodes/ui",
      "@ui/components",
      "@ui/elements",
      "@ui/hud",
      "nodes",
    ])
    for (const target of Object.values(visualPackage.exports ?? {})) {
      expect(await Bun.file(join(packageRoot, target)).exists(), `missing export ${target}`).toBeTrue()
    }
  })

  test("owns the node-canvas stylesheet outside public bootstrap assets", async () => {
    expect(await Bun.file(join(hamiltonianRoot, "public/styles.css")).exists()).toBeFalse()
    const styles = await Bun.file(join(packageRoot, "browser/styles.css")).text()
    expect(styles).toContain("#orchestration-canvas")
    expect(styles).toContain('.orchestration-failed #orchestration-status')
    expect(styles).not.toContain(".legacy-debug")
  })

  test("owns Hamiltonian presentation leaves outside browser orchestration", async () => {
    const leaves = [
      "connection-color",
      "selection-retention",
      "spatial-runtime",
      "traffic-presentation",
    ]
    for (const leaf of leaves) {
      for (const suffix of [".ts", ".spec.ts"]) {
        expect(await Bun.file(join(packageRoot, "presentation", `${leaf}${suffix}`)).exists()).toBeTrue()
        expect(await Bun.file(join(hamiltonianRoot, "browser/orchestration", `${leaf}${suffix}`)).exists()).toBeFalse()
      }
    }
  })

  test("keeps universal node-system packages free of reverse Hamiltonian imports", async () => {
    const universalRoot = join(repositoryRoot, "pkg/nodes")
    const files = await sourceFiles(universalRoot)
    const sources = await Promise.all(files.map(async (path) =>
      `// ${relative(repositoryRoot, path)}\n${await Bun.file(path).text()}`))
    const source = sources.join("\n")

    expect(source).not.toMatch(/from\s+["'][^"']*hamiltonian/i)
    expect(source).not.toMatch(/import\s*\(\s*["'][^"']*hamiltonian/i)
  })
})

async function sourceFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, {withFileTypes: true})
  const files: string[] = []
  for (const entry of entries) {
    const path = join(root, entry.name)
    if (entry.isDirectory()) files.push(...await sourceFiles(path))
    else if (entry.isFile() && /\.(?:js|ts)$/.test(entry.name)) files.push(path)
  }
  return files
}
