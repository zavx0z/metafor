import {describe, expect, test} from "bun:test"
import {readFile} from "node:fs/promises"
import {join, resolve} from "node:path"
import {createDocument} from "@zavx0z/dom"
import {createBulkHudStory} from "../../bulk/.storybook/stories/hud.ts"
import {runtime} from "../../bulk/.storybook/runtime.ts"

const repositoryRoot = resolve(import.meta.dir, "../../..")

describe("Bulk external Storybook boundary", () => {
  test("registers one exact HUD leaf with real category and subject overviews", async () => {
    const catalog = JSON.parse(await readFile(
      join(repositoryRoot, "quantum/bulk/.storybook/catalog.json"),
      "utf8",
    ))
    expect(catalog.categories).toHaveLength(1)
    expect(catalog.categories[0]).toMatchObject({
      route: "bulk",
      subjects: [{
        route: "bulk/hud",
        presentation: {
          protocol: "story-presentation/1",
          projection: "hud",
          widgets: ["props", "source", "diagnostics"],
        },
        variants: [{
          route: "bulk/hud/default",
          resources: {
            references: ["../VISUAL.md", "../dom/hud.tsx", "./stories/hud.ts"],
          },
        }],
      }],
    })
  })

  test("mounts production HUD in the external semantic Document", () => {
    const document = createDocument()
    const story = createBulkHudStory(document)
    expect(story.element).toBe(story.controller.element)
    expect(story.element.ownerDocument).toBe(document)
    expect(story.source.typescript).toContain("createBulkHudDocument")
    expect(Object.keys(story.source).sort()).toEqual(["html", "typescript"])
    expect(story.componentRoot.readStyleSheets().styleSheets.length).toBeGreaterThan(0)
    story.dispose()
  })

  test("uses one structural runtime instead of a package-owned shell", async () => {
    const runtimeSource = await readFile(
      join(repositoryRoot, "quantum/bulk/.storybook/runtime.ts"),
      "utf8",
    )
    expect(runtime.protocol).toBe("storybook-runtime/3")
    expect(runtimeSource).toContain("context.present")
    expect(runtimeSource).toContain('protocol: "story-presentation/1"')
    expect(runtimeSource).toContain("update: show")
    for (const legacy of [
      "context.mount",
      "publishInspector",
      "publishSource",
      "publishProps",
      "styleSheets:",
    ]) expect(runtimeSource).not.toContain(legacy)
    expect(runtimeSource).not.toContain("@zavx0z/storybook")
    expect(runtimeSource).not.toContain("createStorybookDomWorkbench")
    expect(runtimeSource).not.toContain("createDocumentCanvasRuntime")
    expect(runtimeSource).not.toContain("StorybookRouteTreeRouter")
  })

  test("keeps Storybook outside production package metadata and exports", async () => {
    const manifest = JSON.parse(await readFile(
      join(repositoryRoot, "quantum/bulk/package.json"),
      "utf8",
    ))
    expect(manifest.name).toBe("bulk")
    expect(Object.keys(manifest.exports)).toEqual([".", "./settings", "./store", "./visual", "./web"])
    expect(JSON.stringify(manifest)).not.toContain("storybook")
    expect(await Bun.file(join(repositoryRoot, "quantum/storybook/package.json")).exists()).toBeFalse()
  })
})
