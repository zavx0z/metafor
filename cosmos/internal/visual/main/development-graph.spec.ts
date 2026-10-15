import {expect, test} from "bun:test"
import {mkdtemp, rm, symlink} from "node:fs/promises"
import {join, resolve} from "node:path"
import {pathToFileURL} from "node:url"
import {createDocument, createDomRoot, flushDocumentLayoutObservers, HTMLElement, MouseEvent, type DOMComponentConstructor} from "@zavx0z/immersive"
import {createDocumentRenderer} from "@zavx0z/immersive/renderer/html"
import createJsxBunPlugin from "@zavx0z/immersive/compiler"
import {DEVELOPMENT_SCHEMA, type DevelopmentCatalog} from "../../../release/shared/development"
import type {DevelopmentDependencyGraphProps} from "./development-graph"

test("выбранный package показывает прямые manifest-зависимости и выбирает внешний узел", async () => {
  const directory = await mkdtemp(join(import.meta.dir, ".compiled-development-graph-"))
  const catalog: DevelopmentCatalog = {schema: DEVELOPMENT_SCHEMA, workspaceId: "workspace", rootPackage: "@zavx0z/storybook", revision: "revision-1",
    packages: [
      {name: "@zavx0z/storybook", label: "Storybook", address: "repo:storybook", owner: null, resolution: "source", writable: true},
      {name: "@zavx0z/immersive", label: "Immersive", address: "repo:immersive", owner: null, resolution: "source", writable: false},
      {name: "@zavx0z/highlighter", label: "Highlighter", address: "npm:highlighter", owner: null, resolution: "external", writable: false},
      {name: "@zavx0z/unrelated", label: "Unrelated", address: "npm:unrelated", owner: null, resolution: "external", writable: false},
    ], dependencies: [
      {from: "@zavx0z/storybook", to: "@zavx0z/immersive", kind: "dependencies", range: "^2.0.0"},
      {from: "@zavx0z/storybook", to: "@zavx0z/highlighter", kind: "devDependencies", range: "^1.0.0"},
      {from: "@zavx0z/immersive", to: "@zavx0z/highlighter", kind: "peerDependencies", range: "*"},
    ]}
  const document = createDocument(), host = document.createElement("div")
  document.append(host)
  const root = createDomRoot(host)
  const renderer = createDocumentRenderer({document, root: host, viewport: {width: 1000, height: 700},
    textMeasurer: {measureTextAdvance: (text, size) => text.length * size * .5}})
  try {
    await symlink(resolve(import.meta.dir, "../node_modules"), join(directory, "node_modules"), "dir")
    const built = await Bun.build({entrypoints: [join(import.meta.dir, "development-graph.tsx")], outdir: directory, target: "bun",
      external: ["@zavx0z/immersive", "@zavx0z/immersive/*"],
      plugins: [createJsxBunPlugin({cwd: resolve(import.meta.dir, ".."), sourceRoots: [import.meta.dir], styleSourceRootIds: ["@internal/visual"]})]})
    if (!built.success) throw new AggregateError(built.logs, "Dependency graph did not compile")
    const module = await import(pathToFileURL(join(directory, "development-graph.js")).href)
    const projected = module.developmentDependencyGraph(catalog, "@zavx0z/storybook")
    expect(projected.input.nodes.map((node: {id: string}) => node.id)).toEqual(["@zavx0z/storybook", "@zavx0z/immersive", "@zavx0z/highlighter"])
    const plan = projected.layout(projected.input.nodes.map((node: {id: string}) => ({id: node.id, width: 220, height: 80, anchors: []})))
    expect(plan.links.map((link: {title: string}) => link.title)).toEqual([
      "@zavx0z/storybook → @zavx0z/immersive · dependencies ^2.0.0",
      "@zavx0z/storybook → @zavx0z/highlighter · devDependencies ^1.0.0",
    ])
    const Graph = module.DevelopmentDependencyGraph as DOMComponentConstructor<DevelopmentDependencyGraphProps>
    const selected: string[] = []
    root.render(Graph, {catalog, selectedPackage: "@zavx0z/storybook", onSelectPackage: name => selected.push(name)})
    for (let attempt = 0; attempt < 20; attempt++) {
      root.flush()
      renderer.flush()
      if (!flushDocumentLayoutObservers(document)) break
    }
    expect(host.textContent).toContain("dependencies ^2.0.0")
    expect(host.textContent).toContain("devDependencies ^1.0.0")
    expect(host.textContent).not.toContain("Unrelated")
    expect(host.querySelector("[data-layout-pending='true']") === null).toBe(true)
    expect([...host.querySelectorAll("[data-link-id]")].map(link => link.getAttribute("aria-label"))).toEqual(plan.links.map((link: {title: string}) => link.title))
    const external = [...host.querySelectorAll("[data-node-id]")].find(node => node.getAttribute("data-node-id") === "@zavx0z/highlighter")
    if (!(external instanceof HTMLElement)) throw new Error("External package node was not rendered")
    external.dispatchEvent(new MouseEvent("click", {bubbles: true}))
    expect(selected).toEqual(["@zavx0z/highlighter"])
  } finally {root.unmount(); renderer.dispose(); await rm(directory, {recursive: true, force: true})}
})
