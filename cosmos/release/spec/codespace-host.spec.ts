import {expect, test} from "bun:test"
import {createCodespaceHostAdapter, readCodespaceHostAssignment, type CodespaceHostRunner} from "../server/codespace-host"

const assignment = {command: ["/usr/bin/python3", "/private/assigned-helper.py"] as const, account: "fixture-account", target: "fixture-codespace"}
function fixture(state = "Shutdown", account = assignment.account) {
  const calls: string[][] = []
  let failure = false
  const run: CodespaceHostRunner = async (argv, deadline) => {
    expect(deadline).toBeLessThanOrEqual(30_000)
    calls.push([...argv])
    if (failure) return {exitCode: 1, stdout: "private failure must not escape"}
    if (argv.includes("/user")) return {exitCode: 0, stdout: account}
    if (argv.includes("POST")) return {exitCode: 0, stdout: ""}
    return {exitCode: 0, stdout: JSON.stringify({name: assignment.target, owner: assignment.account, state})}
  }
  return {adapter: createCodespaceHostAdapter(assignment, run), calls, fail() {failure = true}}
}

test("host assignment is disabled by default and rejects partial, executable and account injection", () => {
  expect(readCodespaceHostAssignment({})).toBeNull()
  expect(readCodespaceHostAssignment({ORACLE_CODESPACE_HELPER_COMMAND: JSON.stringify(assignment.command), ORACLE_CODESPACE_ACCOUNT: assignment.account, ORACLE_CODESPACE_TARGET: assignment.target})).toEqual(assignment)
  for (const command of ["shell", '["python","helper"]', '["/python","/helper","--arbitrary"]']) {
    expect(() => readCodespaceHostAssignment({ORACLE_CODESPACE_HELPER_COMMAND: command, ORACLE_CODESPACE_ACCOUNT: assignment.account, ORACLE_CODESPACE_TARGET: assignment.target})).toThrow()
  }
  expect(() => readCodespaceHostAssignment({ORACLE_CODESPACE_ACCOUNT: assignment.account})).toThrow()
})

test("status emits fixed identity and existing-resource argv only", async () => {
  const f = fixture()
  expect(await f.adapter.execute("status")).toMatchObject({operation: "status", state: "Shutdown", outcome: "observed", target: {name: assignment.target, account: assignment.account}})
  expect(f.calls).toEqual([
    [...assignment.command, "api", "/user", "--jq", ".login"],
    [...assignment.command, "api", "/user/codespaces/fixture-codespace", "--jq", "{name: .name, state: .state, owner: .owner.login}"],
  ])
})

test("start sends exactly one POST, and Available/Starting do not send a POST", async () => {
  const f = fixture()
  expect(await f.adapter.execute("start")).toMatchObject({outcome: "start-accepted", state: "Shutdown"})
  expect(f.calls.filter(call => call.includes("POST"))).toEqual([[...assignment.command, "api", "--method", "POST", "/user/codespaces/fixture-codespace/start", "--silent"]])
  for (const [state, outcome] of [["Available", "already-running"], ["Starting", "already-starting"]]) {
    const ready = fixture(state)
    expect(await ready.adapter.execute("start")).toMatchObject({state, outcome})
    expect(ready.calls.some(call => call.includes("POST"))).toBeFalse()
  }
})

test("wrong account, missing target and failures never fall back or expose private output", async () => {
  const wrong = fixture("Shutdown", "other-account")
  await expect(wrong.adapter.execute("start")).rejects.toThrow("does not match")
  expect(wrong.calls).toHaveLength(1)
  const failed = fixture()
  failed.fail()
  await expect(failed.adapter.execute("start")).rejects.toThrow("Assigned Codespace operation failed")
  expect(failed.calls).toHaveLength(1)
})

test("host close aborts its owned pending helper and refuses subsequent operations", async () => {
  const started = Promise.withResolvers<void>()
  const adapter = createCodespaceHostAdapter(assignment, async (_argv, _deadline, signal) => {
    started.resolve()
    await new Promise<void>((_resolve, reject) => signal?.addEventListener("abort", () => reject(signal.reason), {once: true}))
    return {exitCode: 0, stdout: ""}
  })
  const pending = adapter.execute("start")
  await started.promise
  adapter.close()
  await expect(pending).rejects.toThrow("uncertain")
  await expect(adapter.execute("status")).rejects.toThrow("closed")
})
