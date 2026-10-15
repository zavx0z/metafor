import {expect, test} from "bun:test"
import {mkdtemp, rm, symlink} from "node:fs/promises"
import {join, resolve} from "node:path"
import {pathToFileURL} from "node:url"
import {createDocument, type DOMComponent, type DOMComponentConstructor} from "@zavx0z/immersive"
import {createVisualTemplatePlugin} from "../build/template.plugin"
import type {DevelopmentWorkbenchProps, DevelopmentWorkbenchModel} from "./development-workbench"

test("общий Workbench компилируется в Visual и удерживает один Document при закрытии Cosmos", async () => {
  const directory = await mkdtemp(join(import.meta.dir, ".compiled-development-workbench-"))
  const document = createDocument(), host = document.createElement("space"), hud = document.createElement("hud")
  hud.id = "cosmos-development-hud"
  document.append(host)
  let component: DOMComponent<DevelopmentWorkbenchProps> | undefined
  try {
    await symlink(resolve(import.meta.dir, "../node_modules"), join(directory, "node_modules"), "dir")
    const built = await Bun.build({entrypoints: [join(import.meta.dir, "development-workbench.tsx")], outdir: directory, target: "bun",
      external: ["@zavx0z/immersive", "@zavx0z/immersive/*"], plugins: [createVisualTemplatePlugin()]})
    if (!built.success) throw new AggregateError(built.logs, "Cosmos Workbench did not compile")
    const module = await import(pathToFileURL(join(directory, "development-workbench.js")).href)
    const Workbench = module.DevelopmentWorkbench as DOMComponentConstructor<DevelopmentWorkbenchProps>
    let ready: DevelopmentWorkbenchModel | undefined
    const props: DevelopmentWorkbenchProps = {active: false, packageName: null, width: 1000, height: 700,
      observe() {throw new Error("Inactive Workbench cannot request a model")}, navigate() {}, quantum() {}, onReady(model) {ready = model}}
    document.transaction(() => {component = new Workbench(document, props); host.append(component, hud)})
    for (let turn = 0; turn < 8; turn++) {document.flushTasks(); await Bun.sleep(0)}
    const display = document.getElementById("cosmos-development-display")
    const space = document.querySelector("space")
    expect(display?.ownerDocument).toBe(document)
    expect(display?.closest("space")).toBe(space)
    expect(hud?.ownerDocument).toBe(document)
    expect(host.textContent).toContain("Саморазработка Cosmos")
    expect(ready?.document).toBe(document)
    expect(ready?.getSnapshot().state["catalog.label"]).toBe("Пакеты")
    document.transaction(() => component!.update({...props, width: 1100}))
    document.flushTasks()
    expect(document.getElementById("cosmos-development-display")).toBe(display)
    expect(document.querySelectorAll("space")).toHaveLength(1)
    expect(document.querySelectorAll("display")).toHaveLength(1)
    expect(document.querySelectorAll("hud")).toHaveLength(1)
  } finally {component?.dispose(); await rm(directory, {recursive: true, force: true})}
}, 30000)
