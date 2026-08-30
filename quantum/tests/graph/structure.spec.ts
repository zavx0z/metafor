import {describe, expect, test} from "bun:test"
import {existsSync, readFileSync, readdirSync} from "node:fs"
import {join, resolve} from "node:path"

const quantumRoot = resolve(import.meta.dir, "../..")
const domains = ["dark", "boundary", "matrix", "energy", "bulk"] as const

describe("Quantum Graph weak coupling", () => {
  test("keeps one domain-owned Graph directory without a central runtime package", () => {
    for (const domain of domains) {
      expect(existsSync(join(quantumRoot, domain, "graph")), domain).toBe(true)
    }
    expect(existsSync(join(quantumRoot, "graph"))).toBe(false)
    expect(existsSync(join(quantumRoot, "docs", "graph"))).toBe(false)
  })

  test("keeps production domain Graph modules independent from tests and Storybook", () => {
    for (const domain of domains) {
      for (const path of typescriptFiles(join(quantumRoot, domain, "graph"))) {
        const source = readFileSync(path, "utf8")
        expect(source, path).not.toMatch(
          /(?:from\s*|import\s*\(\s*)["'][^"']*(?:tests|storybook)\//,
        )
      }
    }
  })

  test("keeps Graph presentation inside the owner declaration boundary", () => {
    const root = resolve(quantumRoot, "../types/.storybook")
    const files = typescriptFiles(root)
    const sources = files.map((path) => readFileSync(path, "utf8")).join("\n")
    expect(sources).toContain('from "@zavx0z/dom"')
    expect(sources).toContain('from "@ui/components/code-editor"')
    expect(sources).toContain('from "@metafor/node-tree/graph"')
    expect(sources).not.toContain("@zavx0z/storybook")
    expect(sources).not.toContain("StorybookRouteTreeRouter")
    expect(sources).not.toContain("createStorybookDomWorkbench")
    expect(sources).not.toContain("createDocumentCanvasRuntime")
    expect(sources).not.toContain('from "@ui/storybook/')
    expect(sources).not.toContain('from "@nodes/editor')
    expect(sources).not.toContain('from "@nodes/storybook')
    expect(sources).not.toContain('from "@nodes/ui')
    expect(sources).not.toContain('from "@nodes/layout')
    expect(sources).not.toContain('from "@layout/core')
    expect(sources).not.toContain('from "@ui/elements')
    const nodesOwners = files
      .filter((path) => readFileSync(path, "utf8").includes('from "@nodes/'))
      .map((path) => path.slice(root.length + 1))
      .sort()
    expect(nodesOwners).toEqual([])
    const catalog = readFileSync(join(root, "catalog.json"), "utf8")
    expect(catalog).toContain('"path": "./stories/node-tree.tsx"')
    expect(catalog).toContain('"export": "createGraphNodeTreeStory"')
    expect(catalog).toContain('"protocol": "story-presentation/1"')
    expect(catalog).toContain('"projection": "display"')
    expect(catalog).toContain('"widgets": ["props", "source", "diagnostics"]')
    expect(existsSync(join(root, "fixtures", "graph.ts"))).toBe(true)
    expect(existsSync(join(root, "stories", "dom-story.tsx"))).toBe(true)
    expect(existsSync(join(root, "stories", "overview.ts"))).toBe(false)
    expect(existsSync(join(root, "state", "lab-state.ts"))).toBe(false)
    expect(existsSync(join(root, "preview.ts"))).toBe(false)
    expect(existsSync(join(root, "body.html"))).toBe(false)
    expect(existsSync(join(root, "routes.ts"))).toBe(false)
    expect(existsSync(join(root, "story.ts"))).toBe(false)
    const runtime = readFileSync(join(root, "runtime.ts"), "utf8")
    expect(runtime).toContain('protocol: "storybook-runtime/3"')
    expect(runtime).toContain("context.present")
    expect(runtime).toContain('protocol: "story-presentation/1"')
    expect(runtime).toContain("update: show")
    for (const legacy of [
      "context.mount",
      "publishInspector",
      "publishSource",
      "publishProps",
      "styleSheets:",
    ]) expect(runtime).not.toContain(legacy)
    expect(runtime).not.toContain("planStorybookShell")
    expect(runtime).not.toContain("UiRuntime")
    expect(runtime).not.toContain("StorybookNavigationSurface")
    const nodeTree = readFileSync(join(root, "stories", "node-tree.tsx"), "utf8")
    expect(nodeTree).toContain("createGraphNodeTree")
    expect(nodeTree).toContain("reconcileGraphNodeTree")
    expect(nodeTree).toContain("tree.snapshot()")
    expect(nodeTree).toContain("createRoot(staging)")
    expect(nodeTree).toContain("return <section")
  })
})

function typescriptFiles(root: string): string[] {
  return readdirSync(root, {withFileTypes: true}).flatMap((entry) => {
    const path = join(root, entry.name)
    return entry.isDirectory()
      ? typescriptFiles(path)
      : entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) &&
        !entry.name.endsWith(".spec.ts")
        ? [path]
        : []
  })
}
