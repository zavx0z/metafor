import {afterAll, beforeAll, expect, test} from "bun:test"
import {mkdtemp, rm, symlink} from "node:fs/promises"
import {join, resolve} from "node:path"
import {pathToFileURL} from "node:url"
import {createDocument, createDomRoot, type DOMComponentConstructor, type HTMLButtonElement} from "@zavx0z/immersive"
import {createSpaceElementFactories} from "@zavx0z/immersive/space"
import type {ReleaseManagementSnapshot, ReleaseSettingsClient} from "./release-settings"
import {createVisualTemplatePlugin} from "../build/template.plugin"

let directory = ""
let compiled: typeof import("./release-settings")
let Fixture: DOMComponentConstructor<{client: ReleaseSettingsClient; fetcher: typeof fetch}>

beforeAll(async () => {
  directory = await mkdtemp(join(import.meta.dir, ".compiled-release-settings-"))
  await symlink(resolve(import.meta.dir, "../node_modules"), join(directory, "node_modules"), "dir")
  await Bun.write(join(directory, "tsconfig.json"), JSON.stringify({extends: "../../tsconfig.json", include: ["*.tsx"]}))
  const entry = join(directory, "fixture.tsx")
  await Bun.write(entry, `
    import ExecutionSettings from '@zavx0z/storybook-app-web-page-shell-execution-settings'
    import {ReleaseSettings} from '../release-settings'
    import {useState} from '@zavx0z/immersive/XReact'
    export function Fixture(props) {
      const [active, setActive] = useState(false)
      return <ExecutionSettings
        initialState={{open: true}}
        fetcher={props.fetcher}
        optionalSection={{id: 'releases', label: 'Сборки и откат'}}
        onOptionalSectionActiveChange={setActive}
      >
        <ReleaseSettings active={active} client={props.client} />
      </ExecutionSettings>
    }
  `)
  const build = await Bun.build({entrypoints: [join(import.meta.dir, "release-settings.tsx"), entry], splitting: true,
    outdir: directory, root: import.meta.dir, target: "bun", conditions: ["metafor:main"],
    external: ["@zavx0z/immersive", "@zavx0z/immersive/*"], plugins: [createVisualTemplatePlugin()]})
  if (!build.success) throw new AggregateError(build.logs, "Release settings fixture did not compile")
  compiled = await import(pathToFileURL(join(directory, "release-settings.js")).href)
  Fixture = (await import(pathToFileURL(join(directory, directory.split("/").at(-1)!, "fixture.js")).href)).Fixture
}, 30_000)

afterAll(async () => {if (directory) await rm(directory, {recursive: true, force: true})})

function snapshot(): ReleaseManagementSnapshot {
  return {schemaVersion: 1, active: {digest: "b".repeat(64), version: "1.0.1"}, revision: 4, operation: null,
    candidates: [
      {digest: "b".repeat(64), version: "1.0.1", active: true, previousSuccessful: false, compatibilityLine: "state:1",
        activate: {allowed: false, reason: "Уже выбрана"}, downgrade: {allowed: false, reason: "Текущая сборка"}},
      {digest: "a".repeat(64), version: "1.0.0", active: false, previousSuccessful: true, compatibilityLine: "state:1",
        activate: {allowed: true}, downgrade: {allowed: true}},
      {digest: "c".repeat(64), version: "1.0.2", active: false, previousSuccessful: false, compatibilityLine: null,
        activate: {allowed: false, reason: "Байты повреждены"}, downgrade: {allowed: false, reason: "Успешный запуск не подтверждён"}},
    ]}
}

test("подтверждённый отказ до admission освобождает pending после readback и не повторяет intent", async () => {
  let sends = 0
  const controller = compiled.createReleaseSettingsController({read: async () => snapshot(), async request(input) {
    sends++
    return {operationId: input.operationId, state: "rejected", error: "Текущий выбор изменился"}
  }})
  try {
    await controller.refresh()
    await controller.request("downgrade", "a".repeat(64))
    expect(sends).toBe(1)
    expect(controller.getSnapshot().pending).toBeNull()
    expect(controller.getSnapshot().fresh).toBeTrue()
    expect(controller.getSnapshot().error).toContain("Запрос отклонён")
  } finally {controller.destroy()}
})

test("чтение не меняет сборку; запрещённые действия не отправляются; accepted ожидает terminal readback", async () => {
  let current = snapshot()
  const requests: Parameters<ReleaseSettingsClient["request"]>[0][] = []
  const controller = compiled.createReleaseSettingsController({read: async () => current, async request(input) {
    requests.push(input)
    current = {...current, operation: {id: input.operationId, kind: input.kind, target: input.target!, state: "accepted"}}
    return {operationId: input.operationId, state: "accepted"}
  }})
  try {
    await controller.refresh()
    expect(requests).toHaveLength(0)
    await controller.request("downgrade", "c".repeat(64))
    expect(requests).toHaveLength(0)
    await Promise.all([controller.request("downgrade", "a".repeat(64)), controller.request("downgrade", "a".repeat(64))])
    expect(requests).toHaveLength(1)
    expect(requests[0]).toMatchObject({kind: "downgrade", target: "a".repeat(64), expected: {digest: "b".repeat(64), revision: 4}})
    expect(controller.getSnapshot().pending).toBe(requests[0]!.operationId)
    expect(controller.getSnapshot().snapshot?.active?.digest).toBe("b".repeat(64))
    current = {...current, active: {digest: "a".repeat(64), version: "1.0.0"}, revision: 6,
      operation: {...current.operation!, state: "complete"}}
    await controller.refresh()
    expect(controller.getSnapshot().pending).toBeNull()
    expect(controller.getSnapshot().snapshot?.active?.digest).toBe("a".repeat(64))
    expect(requests).toHaveLength(1)
  } finally {controller.destroy()}
})

test("потерянный ответ и remount восстанавливают pending через read без повторного mutation", async () => {
  let current = snapshot(), calls = 0, reads = 0
  const values = new Map<string, string>()
  const storage = {getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {values.set(key, value)}, removeItem: (key: string) => {values.delete(key)}}
  const client: ReleaseSettingsClient = {async read() {reads++; return current}, async request(input) {
    calls++
    throw new Error("connection lost during restart")
  }}
  const first = compiled.createReleaseSettingsController(client, storage)
  await first.refresh()
  await first.request("activate", "a".repeat(64))
  const pending = first.getSnapshot().pending
  expect(pending).not.toBeNull()
  expect(first.getSnapshot().error).toContain("Ответ не получен")
  expect(first.getSnapshot().snapshot?.operation).toBeNull()
  first.destroy()
  const restored = compiled.createReleaseSettingsController(client, storage)
  try {
    expect(restored.getSnapshot().pending).toBe(pending)
    await restored.refresh()
    await restored.request("activate", "a".repeat(64))
    expect(calls).toBe(1)
    expect(reads).toBe(3)
    expect(restored.getSnapshot().pending).toBe(pending)
    current = {...current, operation: {id: pending!, kind: "activate", target: "a".repeat(64), state: "failed", error: "Admission rejected"}}
    await restored.refresh()
    expect(restored.getSnapshot().pending).toBeNull()
    expect(restored.getSnapshot().error).toBe("Admission rejected")
    expect(values.size).toBe(0)
  } finally {restored.destroy()}
})

test("потеря read блокирует действия до свежего snapshot и destroy отменяет transport", async () => {
  let offline = true, calls = 0, readSignal: AbortSignal | undefined
  const controller = compiled.createReleaseSettingsController({async read(signal) {
    readSignal = signal
    if (offline) throw new Error("offline")
    return snapshot()
  }, async request(input) {calls++; return {operationId: input.operationId, state: "accepted"}}})
  await controller.refresh()
  await controller.request("activate", "a".repeat(64))
  expect(calls).toBe(0)
  expect(controller.getSnapshot().fresh).toBe(false)
  offline = false
  await controller.refresh()
  expect(controller.getSnapshot().fresh).toBe(true)
  controller.destroy()
  expect(readSignal?.aborted).toBe(true)
  await controller.request("activate", "a".repeat(64))
  expect(calls).toBe(0)
})

test.each(["complete", "failed"] as const)("unknown после IPC timeout сохраняет один POST до owner receipt %s", async terminal => {
  let current = snapshot()
  let sends = 0
  const client: ReleaseSettingsClient = {read: async () => current, async request(input) {
    sends++
    current = {...current, operation: {id: input.operationId, kind: input.kind, target: input.target!, state: "unknown",
      error: "Startup не подтвердил переключение"}}
    return {operationId: input.operationId, state: "accepted"}
  }}
  const first = compiled.createReleaseSettingsController(client)
  await first.refresh()
  await first.request("activate", "a".repeat(64))
  const pending = first.getSnapshot().pending
  expect(pending).not.toBeNull()
  expect(first.getSnapshot().snapshot?.operation?.state).toBe("unknown")
  first.destroy()

  // Новый UI без сохранённой sessionStorage получает pending из server projection.
  const restored = compiled.createReleaseSettingsController(client)
  try {
    await restored.refresh()
    expect(restored.getSnapshot().pending).toBe(pending)
    expect(restored.getSnapshot().error).toBe("Startup не подтвердил переключение")
    await restored.request("activate", "a".repeat(64))
    expect(sends).toBe(1)
    current = {...current, operation: {...current.operation!, id: "unrelated-operation", state: "failed"}}
    await restored.refresh()
    expect(restored.getSnapshot().pending).toBe(pending)
    current = {...current, operation: {id: pending!, kind: "activate", target: "a".repeat(64), state: "running"}}
    await restored.refresh()
    expect(restored.getSnapshot().pending).toBe(pending)
    expect(restored.getSnapshot().error).toBe("")
    await restored.request("activate", "a".repeat(64))
    expect(sends).toBe(1)
    current = {...current, operation: {...current.operation!, state: terminal,
      ...(terminal === "failed" ? {error: "Admission rejected"} : {})}}
    await restored.refresh()
    expect(restored.getSnapshot().pending).toBeNull()
    expect(restored.getSnapshot().error).toBe(terminal === "failed" ? "Admission rejected" : "")
    expect(sends).toBe(1)
  } finally {restored.destroy()}
})

test("52 сборки показывают полезные действия, архив скрыт, подробности раскрываются в том же окне", async () => {
  let reads = 0
  let current = snapshot()
  current = {...current, candidates: [...current.candidates,
    ...Array.from({length: 45}, (_, index) => ({digest: index.toString(16).padStart(64, "0"), version: `0.1.${index}`,
      active: false, previousSuccessful: false, compatibilityLine: null,
      activate: {allowed: false, reason: "Legacy build cannot read the current persisted state"},
      downgrade: {allowed: false, reason: "No successful receipt"}})),
    ...[{digest: "d".repeat(64), version: "1.0.2"}, {digest: "f".repeat(64), version: "1.0.10"}, {digest: "e".repeat(64), version: "0.9.9"}, {digest: "9".repeat(64), version: "1.0.1"}]
      .map(candidate => ({...candidate, active: false, previousSuccessful: false, compatibilityLine: "state:1",
        activate: {allowed: true}, downgrade: {allowed: false, reason: "Not the previous successful release"}})),
  ]}
  expect(current.candidates).toHaveLength(52)
  const requests: Parameters<ReleaseSettingsClient["request"]>[0][] = []
  const client: ReleaseSettingsClient = {async read() {reads++; return current}, async request(input) {
    requests.push(input)
    current = {...current, operation: {id: input.operationId, kind: input.kind, target: input.target!, state: "accepted"}}
    return {operationId: input.operationId, state: "accepted"}
  }}
  const document = createDocument({elementFactories: createSpaceElementFactories()})
  const html = document.createElement("html"), body = document.createElement("body"), space = document.createElement("space"), hud = document.createElement("hud")
  document.append(html)
  html.append(body)
  body.append(space)
  space.append(hud)
  const root = createDomRoot(hud)
  const settle = async () => {root.flush(); await Bun.sleep(0); root.flush(); await Bun.sleep(0); root.flush()}
  const click = async (text: string) => {
    const button = [...document.querySelectorAll("button")].find(node => node.textContent === text) as HTMLButtonElement
    expect(button).toBeDefined()
    button.click()
    await settle()
  }
  try {
    root.render(Fixture, {client, fetcher: (async () => Response.json({schemaVersion: 1, revision: 0,
      connections: [], general: {}, types: {}})) as unknown as typeof fetch})
    await settle()
    expect(reads).toBe(0)
    expect(document.querySelectorAll("hud")).toHaveLength(1)
    expect(document.querySelectorAll("canvas")).toHaveLength(0)
    expect(document.querySelectorAll('[id="storybook-execution-settings"]')).toHaveLength(1)
    const tabs = [...document.querySelectorAll('button[role="tab"]')].map(node => node.textContent)
    expect(tabs).toEqual(["Модели по умолчанию", "Провайдеры", "Сборки и откат"])
    await click("Сборки и откат")
    expect(reads).toBe(1)
    expect(requests).toHaveLength(0)
    const section = document.querySelector('[data-settings-section="releases"]')!
    expect(section.ownerDocument).toBe(document)
    expect(section.getAttribute("hidden")).toBeNull()
    expect(section.textContent).toContain("Текущая версия: 1.0.1")
    const labels = [...section.querySelectorAll("button")].map(node => node.textContent)
    expect(labels.filter(label => label.startsWith("Вернуть предыдущую рабочую версию"))).toEqual(["Вернуть предыдущую рабочую версию 1.0.0"])
    expect(labels.filter(label => label.startsWith("Установить обновление"))).toEqual(["Установить обновление 1.0.10", "Установить обновление 1.0.2"])
    expect(labels.filter(label => label.startsWith("Активировать") || label.startsWith("Вернуться к"))).toEqual([])
    expect(section.textContent).toContain("Архив (46)")
    expect(section.textContent).not.toContain("Legacy build")
    expect(section.textContent).not.toContain("Байты повреждены")
    expect(section.textContent).not.toContain("Успешный запуск не подтверждён")
    expect(section.textContent).not.toContain("Версия 0.9.9")
    expect(section.textContent).not.toContain("b".repeat(64))
    expect(section.textContent).not.toContain("state:1")
    expect(section.querySelector("code")?.textContent).toBe("metafor downgrade")
    expect(section.textContent).toContain("Беседы и исходные файлы сохраняют текущее состояние")
    const technical = [...section.querySelectorAll("button")].find(node => node.textContent === "Технические подробности")!
    expect(technical.getAttribute("aria-expanded")).toBe("false")
    await click("Технические подробности")
    expect(section.textContent).toContain("b".repeat(64))
    expect(section.textContent).toContain("state:1")
    expect(requests).toHaveLength(0)
    await click("Технические подробности")
    expect(section.textContent).not.toContain("b".repeat(64))
    expect(section.textContent).not.toContain("Установить другой состав 1.0.1")
    await click("Другие совместимые сборки (2)")
    expect(section.textContent).toContain("Установить версию 0.9.9")
    expect(section.textContent).toContain("Установить другой состав 1.0.1")
    expect([...section.querySelectorAll("button")].some(node => node.textContent === "Установить обновление 0.9.9")).toBeFalse()
    await click("Установить другой состав 1.0.1")
    expect(requests).toHaveLength(1)
    expect(requests[0]).toMatchObject({kind: "activate", target: "9".repeat(64)})
    current = {...current, operation: {...current.operation!, state: "failed", error: "Установка отклонена до изменения версии"}}
    await click("Обновить состояние")
    expect(requests).toHaveLength(1)
    await click("Другие совместимые сборки (2)")
    expect(section.textContent).not.toContain("Установить версию 0.9.9")
    await click("Вернуть предыдущую рабочую версию 1.0.0")
    expect(requests).toHaveLength(2)
    expect(requests[1]).toMatchObject({kind: "downgrade", target: "a".repeat(64)})
    expect(section.textContent).toContain("Запрос ожидает завершения")
    expect(section.textContent).not.toContain("Смена сборки завершена")
    current = {...current, operation: {...current.operation!, state: "unknown"}}
    await click("Обновить состояние")
    expect(section.textContent).toContain("Подтверждение этой операции не получено; выполняется только чтение состояния")
    expect(section.textContent).not.toContain("Смена сборки не выполнена")
    const unknownAction = [...section.querySelectorAll("button")].find(node => node.textContent === "Вернуть предыдущую рабочую версию 1.0.0") as HTMLButtonElement
    expect(unknownAction.disabled).toBe(true)
    unknownAction.click()
    await settle()
    expect(requests).toHaveLength(2)
    current = {...current, operation: null}
    await click("Обновить состояние")
    expect(section.textContent).toContain("Подтверждение этой операции не получено; выполняется только чтение состояния")
    expect(section.textContent).not.toContain("Запрос ожидает завершения")
    const pendingAction = [...section.querySelectorAll("button")].find(node => node.textContent === "Вернуть предыдущую рабочую версию 1.0.0") as HTMLButtonElement
    expect(pendingAction.disabled).toBe(true)
    expect(requests).toHaveLength(2)
    await click("Провайдеры")
    expect(section.hasAttribute("hidden")).toBe(true)
    await click("Сборки и откат")
    expect(requests).toHaveLength(2)
    expect(reads).toBeGreaterThan(1)
  } finally {root.unmount()}
}, 30_000)

test.each([
  {name: "первая рабочая версия", blocked: false, message: "После первого совместимого обновления текущая версия станет предыдущей рабочей"},
  {name: "несовместимый предшественник", blocked: true, message: "Совместимой точки возврата сейчас нет"},
])("$name объясняется без недоступных действий", async ({blocked, message}) => {
  const current = snapshot()
  const initial = {...current, candidates: blocked ? current.candidates.map(candidate => candidate.previousSuccessful
    ? {...candidate, compatibilityLine: "state:old", activate: {allowed: false}, downgrade: {allowed: false}}
    : candidate) : current.candidates.filter(candidate => !candidate.previousSuccessful)}
  let requests = 0
  const document = createDocument({elementFactories: createSpaceElementFactories()})
  const html = document.createElement("html"), body = document.createElement("body")
  document.append(html)
  html.append(body)
  const root = createDomRoot(body)
  const client: ReleaseSettingsClient = {read: async () => initial, async request(input) {
    requests++
    return {operationId: input.operationId, state: "accepted"}
  }}
  try {
    root.render(compiled.ReleaseSettings as unknown as DOMComponentConstructor<{active: boolean; client: ReleaseSettingsClient}>, {active: true, client})
    root.flush()
    await Bun.sleep(0)
    root.flush()
    const section = document.querySelector('[data-release-settings]')!
    expect(section.textContent).toContain("Текущая версия: 1.0.1")
    expect(section.textContent).toContain(message)
    if (blocked) expect(section.textContent).not.toContain("После первого совместимого обновления")
    expect([...section.querySelectorAll("button")].map(node => node.textContent)).toEqual(["Обновить состояние", "Технические подробности"])
    expect(section.textContent).not.toContain("b".repeat(64))
    expect(requests).toBe(0)
  } finally {root.unmount()}
})
