import {afterAll, beforeAll, expect, test} from "bun:test"
import {createDocument} from "@zavx0z/immersive"
import {mkdtemp, rm, symlink} from "node:fs/promises"
import {join, resolve} from "node:path"
import {pathToFileURL} from "node:url"
import {createVisualTemplatePlugin} from "../build/template.plugin"

let directory = ""
let createDevelopmentScenarioPresentation: typeof import("./development-scenarios").createDevelopmentScenarioPresentation
beforeAll(async () => {
  directory = await mkdtemp(join(import.meta.dir, ".compiled-scenarios-"))
  await symlink(resolve(import.meta.dir, "../node_modules"), join(directory, "node_modules"), "dir")
  const result = await Bun.build({entrypoints: [join(import.meta.dir, "development-scenarios.ts")], outdir: directory,
    target: "bun", conditions: ["metafor:main"], format: "esm", splitting: true,
    external: ["@zavx0z/immersive", "@zavx0z/immersive/*"], plugins: [createVisualTemplatePlugin()]})
  if (!result.success) throw new AggregateError(result.logs, "Scenario view did not compile")
  createDevelopmentScenarioPresentation = (await import(pathToFileURL(join(directory, "development-scenarios.js")).href)).createDevelopmentScenarioPresentation
}, 60_000)
afterAll(async () => {if (directory) await rm(directory, {recursive: true, force: true})})

test("Source сценарий получает назначенный digest, поток Bun и реальный отчёт в одном Document", async () => {
  const original = globalThis.fetch
  const requests: string[] = []
  const report = {sourcePath: "spec/scenario.spec.ts", digest: "a".repeat(64), exitCode: 0,
    source: 'test("пример", () => {})', tests: [{label: "пример", groupId: null, status: "passed", message: null}], groups: [],
    validation: {status: "incomplete", checks: [{rule: "meaning", status: "not-checked", issues: []}]}, stdout: "", stderr: ""}
  globalThis.fetch = Object.assign(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input)
    requests.push(url)
    if (url.endsWith("/reader")) return Response.json({readerToken: "granted"})
    expect(init?.headers).toMatchObject({"x-storybook-session": "granted"})
    if (url.endsWith("/scenarios/list")) return Response.json({packageName: "@cosmos/release", nodeId: "package:@cosmos/release",
      sources: [{path: report.sourcePath, digest: report.digest}], revision: "one"})
    if (url.endsWith("/scenarios/run")) {
      expect(JSON.parse(String(init?.body))).toMatchObject({packageName: "@cosmos/release", nodeId: "package:@cosmos/release",
        sourcePath: report.sourcePath, expectedDigest: report.digest})
      const encoder = new TextEncoder()
      return new Response(new ReadableStream({start(controller) {
        controller.enqueue(encoder.encode(JSON.stringify({type: "progress", progress: {phase: "running", text: "Bun Test…"}}) + "\n"))
        controller.enqueue(encoder.encode(JSON.stringify({type: "result", result: report}) + "\n"))
        controller.close()
      }}), {headers: {"content-type": "application/x-ndjson"}})
    }
    throw new Error(`Unexpected request ${url}`)
  }, {preconnect: original.preconnect}) as typeof fetch
  const document = createDocument()
  const presentation = createDevelopmentScenarioPresentation(document, "@cosmos/release")
  try {
    document.append(presentation.node)
    await presentation.configure("package:@cosmos/release", [report.sourcePath])
    expect(presentation.model.getSnapshot().selectedPath).toBe(report.sourcePath)
    const completed = new Promise<void>((resolve, reject) => {
      const stop = presentation.model.subscribe(() => {
        const state = presentation.model.getSnapshot()
        if (state.status === "complete") {stop(); resolve()}
        if (state.status === "error") {stop(); reject(new Error(state.error ?? "Scenario failed"))}
      })
    })
    presentation.model.run()
    expect(presentation.model.getSnapshot()).toMatchObject({status: "running", report: null})
    await completed
    presentation.componentRoot.flush()
    expect(presentation.model.getSnapshot()).toMatchObject({status: "complete", output: "Bun Test…", report})
    expect(presentation.element.textContent).toContain("пройдено 1 из 1 проверок")
    expect(presentation.element.textContent).toContain("пример")
    expect(requests.filter(path => path.endsWith("/scenarios/run"))).toHaveLength(1)
    presentation.model.run()
    expect(presentation.model.getSnapshot()).toMatchObject({status: "running", report: null})
    expect(presentation.element.ownerDocument).toBe(document)
  } finally {
    presentation.dispose()
    globalThis.fetch = original
  }
})

test("неназначенное исполнение не вызывает reader и остаётся явным состоянием вкладки", async () => {
  const original = globalThis.fetch
  let requests = 0
  globalThis.fetch = Object.assign(async () => {requests++; throw new Error("reader must not be called")},
    {preconnect: original.preconnect}) as typeof fetch
  const document = createDocument(), presentation = createDevelopmentScenarioPresentation(document, "@fixture/source")
  try {
    document.append(presentation.node)
    await presentation.configure("package:@fixture/source", ["spec/scenario.spec.ts"], false)
    presentation.componentRoot.flush()
    expect(requests).toBe(0)
    expect(presentation.model.getSnapshot()).toMatchObject({status: "error", selectedPath: null})
    expect(presentation.element.textContent).toContain("выполнение Bun Test не назначено")
  } finally {presentation.dispose(); globalThis.fetch = original}
})

test("назначенный Package без собственного сценария показывает пустое состояние без запуска других Packages", async () => {
  const original = globalThis.fetch
  let requests = 0
  globalThis.fetch = Object.assign(async () => {requests++; throw new Error("reader must not be called")},
    {preconnect: original.preconnect}) as typeof fetch
  const document = createDocument(), presentation = createDevelopmentScenarioPresentation(document, "metafor")
  try {
    document.append(presentation.node)
    await presentation.configure("package:metafor", [], true)
    presentation.model.run()
    presentation.componentRoot.flush()
    expect(requests).toBe(0)
    expect(presentation.model.getSnapshot()).toMatchObject({sources: [], selectedPath: null, status: "idle", report: null})
    expect(presentation.element.textContent).toContain("У выбранного узла нет собственных сценариев")
    expect(presentation.element.textContent).not.toContain("пройдено")
  } finally {presentation.dispose(); globalThis.fetch = original}
})
