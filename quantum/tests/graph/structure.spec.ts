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

  test("uses zavx0z/ui Storybook directly and does not import Nodes", () => {
    const root = join(quantumRoot, "storybook", "graph")
    const sources = typescriptFiles(root).map((path) => readFileSync(path, "utf8")).join("\n")
    expect(sources).toContain('from "@ui/storybook/')
    expect(sources).not.toContain('from "@nodes/')
    expect(existsSync(join(root, "page.ts"))).toBe(true)
    expect(existsSync(join(root, "stories.ts"))).toBe(true)
    expect(existsSync(join(root, "fixtures", "graph.ts"))).toBe(true)
    expect(existsSync(join(root, "state", "lab-state.ts"))).toBe(true)
    expect(existsSync(join(root, "body.html"))).toBe(false)
    expect(existsSync(join(root, "routes.ts"))).toBe(false)
    expect(existsSync(join(root, "story.ts"))).toBe(false)
    expect(readFileSync(join(root, "stories.ts"), "utf8")).toContain("defineStorybookStories")
    const entry = readFileSync(join(root, "entry.ts"), "utf8")
    expect(entry).toContain("planStorybookShell")
    expect(entry).toContain("StorybookNavigationSurface")
    expect(entry).toContain("StorybookStoryPanelSurface")
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
