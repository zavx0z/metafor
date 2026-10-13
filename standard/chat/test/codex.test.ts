import {afterAll, beforeAll, expect, test} from "bun:test"
import {mkdtemp, readFile, rm, stat} from "node:fs/promises"
import {join} from "node:path"
import {tmpdir} from "node:os"
import {createCodexDriver} from "@metafor/provider/codex-driver"

let directory = ""
let executable = ""
let descendantExecutable = ""
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "metafor-chat-acp-"))
  executable = join(directory, "fixture.js")
  const result = await Bun.build({entrypoints: [join(import.meta.dir, "fixture/agent.ts")], target: "bun", outdir: directory, naming: "fixture.js"})
  if (!result.success) throw new AggregateError(result.logs, "ACP fixture build failed")
  descendantExecutable = join(directory, "descendant.js")
  const descendant = await Bun.build({entrypoints: [join(import.meta.dir, "fixture/descendant.ts")], target: "bun", outdir: directory, naming: "descendant.js"})
  if (!descendant.success) throw new AggregateError(descendant.logs, "ACP descendant fixture build failed")
})
afterAll(async () => {if (directory) await rm(directory, {recursive: true, force: true})})

test("официальный ACP SDK driver продолжает native session после нового child, подавляя replay", async () => {
  const store = join(directory, "continued.json")
  const driver = createCodexDriver({command: [process.execPath, executable], cwd: directory,
    env: {ORACLE_AGENT_FIXTURE_STORE: store, ORACLE_AGENT_FIXTURE_PERMISSION: "1", ORACLE_AGENT_FIXTURE_PRELUDE: "1", ORACLE_AGENT_FIXTURE_ASSERT_FENCE: "1",
      COSMOS_QUANTUM_TOKEN: "synthetic-private-token", COSMOS_CONTROL_TOKEN: "synthetic-private-control",
      ORACLE_ENVIRONMENT_GRAPH_SCOPES: "synthetic-private-grant", ORACLE_ENVIRONMENT_FIXTURE_TOKEN: "synthetic-private-token",
      ORACLE_AGENT_PROVIDER_CONFIG: "/synthetic/private/provider.json",
      ORACLE_REPL_CONFIG: "/synthetic/private/repl.json",
      METAFOR_FIXTURE_CONTEXT: "synthetic-private-context"}})
  const signal = AbortSignal.timeout(5000)
  const first = await driver.open({sessionId: null, signal})
  const sessionId = first.sessionId
  try {expect(JSON.parse(await first.prompt("first", signal))).toEqual({echo: "first", turn: 1})}
  finally {await first.close()}
  const second = await driver.open({sessionId, signal})
  try {
    expect(second.sessionId).toBe(sessionId)
    expect(JSON.parse(await second.prompt("second", signal))).toEqual({echo: "second", turn: 2})
  } finally {await second.close()}
  expect(JSON.parse(await readFile(store, "utf8"))).toMatchObject({sessionId, prompts: ["first", "second"], resumes: 1})
})

test("restore failure не создаёт другую native session и освобождает child", async () => {
  const driver = createCodexDriver({command: [process.execPath, executable], cwd: directory,
    env: {ORACLE_AGENT_FIXTURE_STORE: join(directory, "missing.json")}})
  await expect(driver.open({sessionId: "missing-session", signal: AbortSignal.timeout(5000)})).rejects.toThrow("не восстановил сохранённую")
  await expect(stat(join(directory, "missing.json"))).rejects.toMatchObject({code: "ENOENT"})
})

test("чужой session update не становится ответом Chat", async () => {
  const driver = createCodexDriver({command: [process.execPath, executable], cwd: directory,
    env: {ORACLE_AGENT_FIXTURE_STORE: join(directory, "foreign.json"), ORACLE_AGENT_FIXTURE_FOREIGN: "1"}})
  const signal = AbortSignal.timeout(5000)
  const session = await driver.open({sessionId: null, signal})
  try {await expect(session.prompt("first", signal)).rejects.toThrow()}
  finally {await session.close()}
})

test("host installation отклоняется до запуска при относительном executable", async () => {
  const driver = createCodexDriver({command: ["bun", executable], cwd: directory})
  await expect(driver.open({sessionId: null, signal: new AbortController().signal})).rejects.toThrow("абсолютный executable")
})

test("finite native Codex check initializes and frees its child without creating a native session", async () => {
  const store = join(directory, "check-only.json")
  const driver = createCodexDriver({command: [process.execPath, executable], cwd: directory, env: {ORACLE_AGENT_FIXTURE_STORE: store}})
  await driver.check!(AbortSignal.timeout(5000))
  await expect(stat(store)).rejects.toMatchObject({code: "ENOENT"})
})

test("abort во время initialize завершает принадлежащий child без создания native session", async () => {
  const store = join(directory, "aborted.json")
  const driver = createCodexDriver({command: [process.execPath, executable], cwd: directory,
    env: {ORACLE_AGENT_FIXTURE_STORE: store, ORACLE_AGENT_FIXTURE_DELAY_INITIALIZE: "1"}})
  const started = performance.now()
  await expect(driver.open({sessionId: null, signal: AbortSignal.timeout(150)})).rejects.toThrow()
  expect(performance.now() - started).toBeLessThan(3000)
  await expect(stat(store)).rejects.toMatchObject({code: "ENOENT"})
})

test.skipIf(process.platform === "win32")("close очищает свою process group после выхода ACP leader, включая потомка, игнорирующего SIGTERM", async () => {
  const marker = join(directory, "descendant.json")
  const driver = createCodexDriver({command: [process.execPath, executable], cwd: directory,
    env: {ORACLE_AGENT_FIXTURE_STORE: join(directory, "descendant-session.json"),
      ORACLE_AGENT_FIXTURE_DESCENDANT_EXECUTABLE: descendantExecutable, ORACLE_AGENT_FIXTURE_DESCENDANT_MARKER: marker}})
  const session = await driver.open({sessionId: null, signal: AbortSignal.timeout(10_000)})
  const owned = JSON.parse(await readFile(marker, "utf8")) as {pid: number; leader: number}
  const alive = (pid: number) => {
    try {process.kill(pid, 0); return true}
    catch (error) {if ((error as NodeJS.ErrnoException).code === "ESRCH") return false; throw error}
  }
  try {
    expect(alive(owned.pid)).toBeTrue()
    expect(alive(owned.leader)).toBeTrue()
    await session.close()
    expect(alive(owned.leader)).toBeFalse()
    expect(alive(owned.pid)).toBeFalse()
  } finally {
    await session.close().catch(() => {})
    if (alive(owned.pid)) {
      try {process.kill(owned.pid, "SIGKILL")} catch (error) {if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error}
    }
  }
}, 15_000)
