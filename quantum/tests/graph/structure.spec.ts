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

  test("keeps Nodes inside the lazy NodeTree Storybook presentation boundary", () => {
    const root = join(quantumRoot, "storybook", "graph")
    const files = typescriptFiles(root)
    const sources = files.map((path) => readFileSync(path, "utf8")).join("\n")
    expect(sources).toContain('from "@zavx0z/storybook/stories"')
    expect(sources).toContain('from "@zavx0z/storybook/workbench"')
    expect(sources).toContain('from "@zavx0z/storybook/route-tree"')
    expect(sources).toContain('from "@zavx0z/storybook/environment"')
    expect(sources).not.toContain('from "@ui/storybook/')
    expect(sources).not.toContain('from "@nodes/editor')
    expect(sources).not.toContain('from "@nodes/storybook')
    const nodesOwners = files
      .filter((path) => readFileSync(path, "utf8").includes('from "@nodes/'))
      .map((path) => path.slice(root.length + 1))
      .sort()
    expect(nodesOwners).toEqual([
      "stories/hierarchical-node-tree-projector.ts",
      "stories/node-tree-presentation.ts",
      "stories/node-tree.ts",
    ])
    const stories = readFileSync(join(root, "stories.ts"), "utf8")
    expect(stories).toContain('await import("./stories/node-tree.ts")')
    expect(stories).not.toContain('from "./stories/node-tree.ts"')
    expect(existsSync(join(root, "stories.ts"))).toBe(true)
    expect(existsSync(join(root, "fixtures", "graph.ts"))).toBe(true)
    expect(existsSync(join(root, "state", "lab-state.ts"))).toBe(true)
    expect(existsSync(join(root, "body.html"))).toBe(false)
    expect(existsSync(join(root, "routes.ts"))).toBe(false)
    expect(existsSync(join(root, "story.ts"))).toBe(false)
    expect(stories).toContain("defineStorybookStories")
    const entry = readFileSync(join(root, "entry.ts"), "utf8")
    expect(entry).toContain("planStorybookShell")
    expect(entry).toContain('storybookPublicPath("quantum", "/")')
    expect(entry).toContain("compactBelow: null")
    expect(entry).toContain('route: router.current.kind === "leaf" ? state.route : ""')
    expect(entry).toContain("loadStableGraphLabState")
    expect(entry).toContain("state.invalidateSelection()")
    expect(entry).toContain("if (router.current !== node) return")
    expect(entry).toContain("runtime.renderer.renderFrame(runtime.space, runtime.hud, runtime.viewPoint)")
    expect(entry).toContain("dataset.quantumStorybookFrames = String(presentedFrames)")
    expect(entry).toContain("StorybookNavigationSurface")
    expect(entry).toContain("StorybookStoryPanelSurface")
    const preview = readFileSync(join(root, "preview.ts"), "utf8")
    expect(preview).toContain("набор данных и элементы управления используют один типизированный сценарий")
    expect(preview).not.toContain("fixture и controls")
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
