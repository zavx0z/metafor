import {expect, test} from "bun:test"
import {mkdtemp, rm, symlink} from "node:fs/promises"
import {join, resolve} from "node:path"
import {pathToFileURL} from "node:url"
import {createDocument, createDomRoot, flushDocumentLayoutObservers, Event, InputEvent, HTMLInputElement, HTMLSelectElement, HTMLButtonElement, type DOMComponentConstructor} from "@zavx0z/immersive"
import {createVisualTemplatePlugin} from "../build/template.plugin"
import type {DevelopmentAgentProfile, DevelopmentAgentProfileUpdate} from "../../../release/shared/development-agent"

test("compiled Source settings редактируют имя и пол, а ошибка сохраняет исходные CAS для явного retry", async () => {
  const directory = await mkdtemp(join(import.meta.dir, ".compiled-source-settings-"))
  const document = createDocument(), host = document.createElement("div")
  document.append(host)
  const root = createDomRoot(host)
  try {
    await symlink(resolve(import.meta.dir, "../node_modules"), join(directory, "node_modules"), "dir")
    const build = await Bun.build({entrypoints: [join(import.meta.dir, "development-agent-settings.tsx")], outdir: directory, target: "bun",
      conditions: ["internal:main", "metafor:main"], external: ["@zavx0z/immersive", "@zavx0z/immersive/*"], plugins: [createVisualTemplatePlugin()]})
    expect(build.success, build.logs.map(String).join("\n")).toBeTrue()
    const View = (await import(pathToFileURL(join(directory, "development-agent-settings.js")).href)).DevelopmentAgentSettings as DOMComponentConstructor<any>
    let profile: DevelopmentAgentProfile = {version: 1, scope: {packageName: "@fixture/source", executorId: "agent"}, revision: 4, name: "Исходное", gender: "male"}
    const calls: DevelopmentAgentProfileUpdate[] = []
    const save = async (update: DevelopmentAgentProfileUpdate) => {
      calls.push(update)
      if (calls.length === 1) throw new Error("Частичная запись имени; повторите сохранение")
      profile = {...profile, revision: 5, name: update.name, gender: update.gender}
      render()
    }
    const render = () => root.render(View, {profile, onSave: save})
    const settle = async () => {for (let i = 0; i < 8; i++) {root.flush(); flushDocumentLayoutObservers(document); await Bun.sleep(0)}}
    const button = (label: string) => {
      const element = [...host.querySelectorAll("button")].find(value => value.getAttribute("aria-label") === label || value.textContent === label)
      if (!(element instanceof HTMLButtonElement)) throw new Error(`Missing button: ${label}`)
      return element
    }
    render(); await settle()
    button("Настройки агента · Исходное").click(); await settle()
    const name = host.querySelector("input"), gender = host.querySelector("select")
    if (!(name instanceof HTMLInputElement) || !(gender instanceof HTMLSelectElement)) throw new Error("Settings fields are unavailable")
    name.value = "Ада"
    name.dispatchEvent(new InputEvent("input", {bubbles: true, data: "Ада"}))
    gender.value = "female"
    gender.dispatchEvent(new Event("change", {bubbles: true}))
    await settle()
    button("Сохранить настройки агента").click(); await settle()
    expect(host.textContent).toContain("Частичная запись")
    expect(name.value).toBe("Ада")
    // Snapshot имени мог прийти из уже записанного header; черновик не теряет старую CAS.
    profile = {...profile, name: "Ада"}
    render(); await settle()
    button("Сохранить настройки агента").click(); await settle()
    expect(calls).toEqual(Array.from({length: 2}, () => ({expectedRevision: 4, expectedName: "Исходное", name: "Ада", gender: "female"})))
    expect(host.querySelector("input")).toBe(name)
    expect(profile).toMatchObject({revision: 5, name: "Ада", gender: "female"})
    expect(host.textContent).not.toContain("Частичная запись")
  } finally {root.unmount(); await rm(directory, {recursive: true, force: true})}
}, 30000)
