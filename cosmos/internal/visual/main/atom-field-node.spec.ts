import {expect, test} from "bun:test"
import {mkdtemp, rm, symlink} from "node:fs/promises"
import {join, resolve} from "node:path"
import {pathToFileURL} from "node:url"
import {createDocument, createDomRoot, Event, HTMLButtonElement, HTMLInputElement, HTMLSelectElement, InputEvent, type DOMComponentConstructor} from "@zavx0z/immersive"
import createJsxBunPlugin from "@zavx0z/immersive/compiler"
import {parseMetaAddress, type AtomRef, type MetaField, type RuntimeAtom} from "@metafor/types/metafor/graph"
import type {AgentFieldUpdate} from "./agent-workspace-types"
import type {AgentWorkspaceModel} from "./agent-workspace"

test("готовая нода сохраняет несколько черновиков одним пакетом с исходными значениями после обновления Graph", async () => {
  const directory = await mkdtemp(join(import.meta.dir, ".compiled-atom-field-node-"))
  const document = createDocument()
  const html = document.createElement("html")
  const body = document.createElement("body")
  document.append(html)
  html.append(body)
  const root = createDomRoot(body)
  try {
    await symlink(resolve(import.meta.dir, "../node_modules"), join(directory, "node_modules"), "dir")
    const entrypoint = join(import.meta.dir, "atom-field-node.tsx")
    const compiled = await Bun.build({
      entrypoints: [entrypoint],
      outdir: directory,
      target: "bun",
      conditions: ["internal:main", "metafor:main"],
      external: ["@zavx0z/immersive", "@zavx0z/immersive/*"],
      plugins: [createJsxBunPlugin({
        cwd: resolve(import.meta.dir, ".."),
        sourceRoots: [entrypoint],
        styleSourceRootIds: ["@internal/visual"],
      })],
    })
    if (!compiled.success) throw new AggregateError(compiled.logs, "Нода полей Atom не скомпилировалась")
    const Node: DOMComponentConstructor<{
      atom: RuntimeAtom
      fields: readonly MetaField[]
      workspace: Pick<AgentWorkspaceModel, "saveFields">
      signal: AbortSignal
    }> = (await import(pathToFileURL(join(directory, "atom-field-node.js")).href)).AtomFieldNode
    const fields: MetaField[] = [
      {key: "title", type: "string"},
      {key: "count", type: "number"},
      {key: "enabled", type: "boolean"},
      {key: "mode", type: "enum", values: ["first", "second"]},
      {key: "points", type: "array"},
    ]
    let atom: RuntimeAtom = {kind: "atom", ref: "atom:fields", meta: parseMetaAddress("@fixture/fields")!,
      declaration: "#/template/@fixture~1fields", state: null, mass: [],
      values: {title: null, count: 2, enabled: true, mode: "first", points: [1, 2]}}
    const calls: Array<{atomRef: AtomRef; updates: readonly AgentFieldUpdate[]}> = []
    let confirm = () => {}
    const workspace: Pick<AgentWorkspaceModel, "saveFields"> = {
      async saveFields(atomRef, updates, signal) {
        signal.throwIfAborted()
        calls.push({atomRef, updates: structuredClone(updates)})
        if (calls.length === 1) throw new Error("Конфликт значения Field")
        await new Promise<void>(resolve => {confirm = resolve})
      },
    }
    const signal = new AbortController().signal
    const render = () => root.render(Node, {atom, fields, workspace, signal})
    const settle = async () => {
      root.flush()
      await Bun.sleep(0)
      root.flush()
    }
    const input = (field: string) => {
      const node = body.querySelector(`[data-parameter-id="${field}"] input`)
      if (!(node instanceof HTMLInputElement)) throw new Error(`Нет готового input для ${field}`)
      return node
    }
    const type = async (field: string, value: string) => {
      const node = input(field)
      node.value = value
      node.dispatchEvent(new InputEvent("input", {bubbles: true, data: value, inputType: "insertText"}))
      await settle()
    }
    const saveButton = () => {
      const node = [...body.querySelectorAll("button")].find(button => button.getAttribute("aria-label")?.startsWith("Сохранить поля"))
      if (!(node instanceof HTMLButtonElement)) throw new Error("Нет действия сохранения в шапке ноды")
      return node
    }
    render()
    await settle()
    expect(body.querySelectorAll('[data-node-kind="parameter"]')).toHaveLength(1)
    expect([...body.querySelectorAll("[data-parameter-id]")].map(row => row.getAttribute("data-field-kind"))).toEqual(["text", "number", "checkbox", "select", "text"])
    const sockets = [...body.querySelectorAll("[data-socket-id]")]
    expect(sockets).toHaveLength(fields.length * 2)
    expect(sockets.every(socket => socket instanceof HTMLButtonElement && socket.disabled && socket.ownerDocument === document)).toBe(true)
    expect(body.querySelectorAll("canvas")).toHaveLength(0)
    expect(saveButton().disabled).toBe(true)

    await type("title", "Черновик")
    await type("count", "3")
    await type("points", "[1, bad]")
    expect(saveButton().disabled).toBe(true)
    expect(body.textContent).toContain("Введите JSON-массив конечных чисел")
    await type("points", "[4, 5, 6, 7, 8]")
    const select = body.querySelector('[data-parameter-id="mode"] select')
    if (!(select instanceof HTMLSelectElement)) throw new Error("Нет готового SelectParameter")
    select.value = "second"
    select.dispatchEvent(new Event("change", {bubbles: true}))
    await settle()
    expect(calls).toEqual([])

    atom = {...atom, values: {...atom.values, title: "Фоновое обновление", count: 9, points: [9], mode: "second"}}
    render()
    await settle()
    expect(input("title").value).toBe("Черновик")
    expect(input("count").value).toBe("3")
    expect(input("points").value).toBe("[4, 5, 6, 7, 8]")
    saveButton().click()
    await settle()
    expect(calls).toEqual([{atomRef: atom.ref, updates: [
      {field: "title", value: "Черновик", expectedValue: null},
      {field: "count", value: 3, expectedValue: 2},
      {field: "points", value: [4, 5, 6, 7, 8], expectedValue: [1, 2]},
      {field: "mode", value: "second", expectedValue: "first"},
    ]}])
    expect(body.textContent).toContain("Конфликт значения Field")
    expect(input("title").value).toBe("Черновик")
    expect(saveButton().disabled).toBe(false)

    saveButton().click()
    await settle()
    expect(calls).toHaveLength(2)
    expect(calls[1]).toEqual(calls[0])
    expect(input("title").disabled).toBe(true)
    expect(body.textContent).toContain("Сохранение…")
    atom = {...atom, values: {...atom.values, title: "Черновик", count: 3, points: [4, 5, 6, 7, 8]}}
    render()
    confirm()
    await settle()
    expect(body.textContent).toContain("Поля сохранены")
    expect(body.textContent).toContain("Изменено: 0")
    expect(input("title").disabled).toBe(false)
    expect(saveButton().disabled).toBe(true)
  } finally {
    root.unmount()
    await rm(directory, {recursive: true, force: true})
  }
}, 30_000)
