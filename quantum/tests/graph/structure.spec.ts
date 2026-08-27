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

  test("keeps Graph presentation inside the lazy DOM Storybook boundary", () => {
    const root = join(quantumRoot, "storybook", "graph")
    const files = typescriptFiles(root)
    const sources = files.map((path) => readFileSync(path, "utf8")).join("\n")
    expect(sources).toContain('from "@zavx0z/storybook/catalog"')
    expect(sources).toContain('from "@zavx0z/storybook/workbench"')
    expect(sources).toContain('from "@zavx0z/storybook/stories"')
    expect(sources).toContain('from "@zavx0z/storybook/route-tree"')
    expect(sources).toContain('from "@zavx0z/storybook/environment"')
    expect(sources).toContain('from "@zavx0z/dom"')
    expect(sources).toContain('from "@zavx0z/renderer-browser"')
    expect(sources).toContain('from "@ui/components/code-editor"')
    expect(sources).toContain('from "@metafor/node-tree/graph"')
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
    const stories = readFileSync(join(root, "stories.ts"), "utf8")
    expect(stories).toContain('await import("./stories/node-tree.ts")')
    expect(stories).not.toContain('from "./stories/node-tree.ts"')
    expect(existsSync(join(root, "stories.ts"))).toBe(true)
    expect(existsSync(join(root, "fixtures", "graph.ts"))).toBe(true)
    expect(existsSync(join(root, "dom-story.ts"))).toBe(true)
    expect(existsSync(join(root, "overview.ts"))).toBe(true)
    expect(existsSync(join(root, "state", "lab-state.ts"))).toBe(false)
    expect(existsSync(join(root, "preview.ts"))).toBe(false)
    expect(existsSync(join(root, "body.html"))).toBe(false)
    expect(existsSync(join(root, "routes.ts"))).toBe(false)
    expect(existsSync(join(root, "story.ts"))).toBe(false)
    expect(stories).toContain("defineStorybookDomCatalog")
    const entry = readFileSync(join(root, "entry.ts"), "utf8")
    expect(entry).toContain('storybookPublicPath("quantum", "/graph")')
    expect(entry).toContain("createDocument()")
    expect(entry).toContain("createStorybookDomWorkbench({")
    expect(entry).toContain("createDocumentCanvasRuntime({")
    expect(entry).toContain('routeNode.kind === "leaf" ? routeNode.path : null')
    expect(entry).toContain('story.element.addEventListener("change", onStoryChange)')
    expect(entry).toContain('dataset.quantumStorybookPipeline = "dom-webgpu"')
    expect(entry).toContain('dataset.quantumStorybook = "ready"')
    expect(entry).not.toContain("planStorybookShell")
    expect(entry).not.toContain("UiRuntime")
    expect(entry).not.toContain("StorybookNavigationSurface")
    const nodeTree = readFileSync(join(root, "stories", "node-tree.ts"), "utf8")
    expect(nodeTree).toContain("createGraphNodeTree")
    expect(nodeTree).toContain("reconcileGraphNodeTree")
    expect(nodeTree).toContain("tree.snapshot()")
    expect(nodeTree).toContain('document.createElement("section")')
  })
})

function typescriptFiles(root: string): string[] {
  return readdirSync(root, {withFileTypes: true}).flatMap((entry) => {
    const path = join(root, entry.name)
    return entry.isDirectory()
      ? typescriptFiles(path)
      : entry.isFile() && entry.name.endsWith(".ts")
        ? [path]
        : []
  })
}
