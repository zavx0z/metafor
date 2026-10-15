import {expect, test} from "bun:test"
import {mkdtemp, rm, symlink} from "node:fs/promises"
import {join, resolve} from "node:path"
import {pathToFileURL} from "node:url"
import {createDocument, createDomRoot, HTMLButtonElement, HTMLElement, InputEvent, type DOMComponentConstructor} from "@zavx0z/immersive"
import createJsxBunPlugin from "@zavx0z/immersive/compiler"
import type {DevelopmentSourceClient, DevelopmentSourceProps} from "./development-source"

test("исходник редактируется и сохраняется по hash; конфликт оставляет draft без перезаписи", async () => {
  const directory = await mkdtemp(join(import.meta.dir, ".compiled-development-source-"))
  const document = createDocument(), host = document.createElement("div")
  document.append(host)
  const root = createDomRoot(host)
  let stored = {path: "src/index.ts", content: "const answer = 1\n", hash: "hash-1", writable: true}
  const writes: Array<{packageName: string; path: string; content: string; expectedHash: string}> = []
  const client: DevelopmentSourceClient = {
    async list(packageName, path) {
      expect(packageName).toBe("@example/source")
      return path === "." ? {entries: [{path: "src", type: "directory"}, {path: "README.md", type: "file"}], truncated: true} as const
        : path === "src" ? {entries: [{path: stored.path, type: "file"}], truncated: false} as const
        : {entries: [], truncated: false} as const
    },
    async read(_packageName, path) {
      if (path === "README.md") return {path, content: "# Example\n", hash: "readme-hash", writable: false}
      if (path !== stored.path) throw new Error("unknown file")
      return {...stored}
    },
    async save(packageName, path, content, expectedHash) {
      writes.push({packageName, path, content, expectedHash})
      if (expectedHash !== stored.hash) throw Object.assign(new Error("stale source"), {code: "CONFLICT"})
      stored = {path, content, hash: "hash-3", writable: true}
      return {path, hash: stored.hash}
    },
  }
  try {
    await symlink(resolve(import.meta.dir, "../node_modules"), join(directory, "node_modules"), "dir")
    const built = await Bun.build({entrypoints: [join(import.meta.dir, "development-source.tsx")], outdir: directory, target: "bun",
      external: ["@zavx0z/immersive", "@zavx0z/immersive/*"],
      plugins: [createJsxBunPlugin({cwd: resolve(import.meta.dir, ".."), sourceRoots: [import.meta.dir], styleSourceRootIds: ["@internal/visual"]})]})
    if (!built.success) throw new AggregateError(built.logs, "Development source did not compile")
    const module = await import(pathToFileURL(join(directory, "development-source.js")).href)
    const Source = module.DevelopmentSource as DOMComponentConstructor<DevelopmentSourceProps>
    const dirty: boolean[] = []
    root.render(Source, {packageName: "@example/source", writable: true, client, onDirtyChange: value => dirty.push(value)})
    const settle = async () => {for (let attempt = 0; attempt < 6; attempt++) {root.flush(); await Bun.sleep(0)}}
    const button = (label: string) => {
      const found = [...host.querySelectorAll("button")].find(item => item.getAttribute("aria-label") === label || item.textContent === label)
      if (!(found instanceof HTMLButtonElement)) throw new Error(`Button missing: ${label}`)
      return found
    }
    const code = () => {
      const found = host.querySelector("code")
      if (!(found instanceof HTMLElement)) throw new Error("CodeEditor missing")
      return found
    }
    await settle()
    expect(code().textContent).toBe("# Example\n")
    expect(code().getAttribute("contenteditable")).toBe("false")
    expect(host.textContent).toContain("Список ограничен")
    button("src").click()
    await settle()
    expect(code().getAttribute("contenteditable")).toBe("plaintext-only")
    expect(code().textContent).toBe("const answer = 1\n")
    expect(host.textContent).toContain("src/index.ts")
    expect(button("Сохранить").disabled).toBe(true)
    code().focus()
    code().dispatchEvent(new InputEvent("beforeinput", {bubbles: true, cancelable: true, inputType: "insertText", data: "!"}))
    await settle()
    expect(host.textContent).toContain("Изменён")
    expect(button("Сохранить").disabled).toBe(false)
    button("Назад").click()
    await settle()
    expect(host.textContent).toContain("Сохраните изменения")
    expect(code().textContent).toContain("answer")
    const draft = code().textContent
    stored = {path: stored.path, content: "const answer = 2\n", hash: "hash-2", writable: true}
    button("Сохранить").click()
    await settle()
    expect(writes).toEqual([{packageName: "@example/source", path: "src/index.ts", content: draft, expectedHash: "hash-1"}])
    expect(host.textContent).toContain("перезапись отклонена")
    expect(code().textContent).toBe(draft)
    expect(button("Сохранить").disabled).toBe(true)
    button("Загрузить версию с диска").click()
    await settle()
    expect(code().textContent).toBe("const answer = 2\n")
    expect(host.textContent).toContain("Сохранён")
    code().focus()
    code().dispatchEvent(new InputEvent("beforeinput", {bubbles: true, cancelable: true, inputType: "insertText", data: "?"}))
    await settle()
    button("Сохранить").click()
    await settle()
    expect(writes[1]?.expectedHash).toBe("hash-2")
    expect(stored.content).toBe(code().textContent)
    expect(dirty).toContain(true)
    expect(dirty.at(-1)).toBe(false)
  } finally {root.unmount(); await rm(directory, {recursive: true, force: true})}
})
