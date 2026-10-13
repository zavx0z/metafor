import {expect, test} from "bun:test"
import runScenario, {type RunScenarioInput, type ScenarioResult} from "../run"

const result: ScenarioResult = {scenario: "agent-system.integrity", passed: true, checks: [{name: "Graph", passed: true}], atomCount: 4}
const request = JSON.stringify({id: "scenario-1", scenario: "agent-system.integrity"})
function fixture(stored: unknown = null) {
  let bytes = stored === null ? "" : JSON.stringify(stored)
  let writes = 0
  const input: RunScenarioInput = {request, signal: new AbortController().signal,
    mass: {result: {readText: async () => bytes, write: async value => {writes++; bytes = JSON.stringify(value)}}}}
  return {input, writes: () => writes, bytes: () => bytes}
}

test("completed scenario repeats its saved receipt without querying Oracle or rewriting Mass", async () => {
  const local = fixture({version: 1, requests: [{id: "scenario-1", scenario: result.scenario, result}]})
  expect(await runScenario(local.input)).toEqual({ackId: "scenario-1", response: JSON.stringify(result), error: null})
  expect(local.writes()).toBe(0)
})

test("new scenario needs an assigned Oracle Environment and preserves fresh Mass on refusal", async () => {
  const local = fixture()
  await expect(runScenario(local.input)).rejects.toThrow("не предоставлен")
  expect(local.writes()).toBe(0)
  expect(local.bytes()).toBe("")
})

test("malformed or contradictory saved evidence is never accepted as a successful scenario", async () => {
  for (const invalid of [{}, {...result, checks: [{name: "Graph", passed: false}]}, {...result, atomCount: NaN}]) {
    const local = fixture({version: 1, requests: [{id: "scenario-1", scenario: result.scenario, result: invalid}]})
    await expect(runScenario(local.input)).rejects.toThrow("Повреждён")
    expect(local.writes()).toBe(0)
  }
})

test("unsupported scenario and cancellation cannot create a durable receipt", async () => {
  const local = fixture()
  await expect(runScenario({...local.input, request: JSON.stringify({id: "scenario-1", scenario: "shell.exec"})})).rejects.toThrow("Недопустимый")
  const controller = new AbortController()
  controller.abort(new Error("cancelled"))
  await expect(runScenario({...local.input, signal: controller.signal})).rejects.toThrow("cancelled")
  expect(local.writes()).toBe(0)
})
