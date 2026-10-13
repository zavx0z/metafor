import {expect, test} from "bun:test"
import {runInstalledAgentAcceptance} from "./runner"

test("prepared standard Agent runs two real Quantum tasks across source-less restart with a fake ACP provider", async () => {
  const result = await runInstalledAgentAcceptance()
  expect(result.provider).toBe("fixture")
  expect(result.producerRemovedBeforeBirth).toBeTrue()
  expect(result.runs).toHaveLength(2)
  const [first, second] = result.runs
  expect(first!.initialization.mode).toBe("initialized")
  expect(second!.initialization.mode).toBe("restored")
  expect(first!.identities).toEqual(second!.identities)
  expect(first!.agents.agents[0]!.configuration.value!.presentation.defaultTab).toBe("chat")
  expect(first!.agents.agents[0]!.configuration.value!.tools[0]!.name).toBe("scenario.run")
  expect(second!.agents.agents[0]!.configuration.value!.displays[0]!.id).toBe("after-first-task")
  const resumedMassRef = second!.identities.chat?.mass[0]?.ref
  if (resumedMassRef === undefined) throw new Error("Restored Chat Mass identity is absent")
  expect(second!.agents.agents[0]!.chat!.session!.ref).toBe(resumedMassRef)
  expect(first!.chat.sessionId).toBe(second!.chat.sessionId)
  expect(first!.provider.sessionId).toBe(second!.provider.sessionId)
  expect(second!.provider.sessionId).toBe(second!.chat.sessionId)
  expect(second!.provider.providerRef).toBe(second!.identities.provider!.ref)
  expect(first!.provider.requests).toHaveLength(2)
  expect(second!.provider.requests).toHaveLength(4)
  expect((second!.registry.entries as {connection: string}[])[0]!.connection).toBe("connected")
  expect(first!.chat.messages).toHaveLength(4)
  expect(second!.chat.messages).toHaveLength(8)
  expect(first!.chat.requests).toHaveLength(2)
  expect(second!.chat.requests).toHaveLength(4)
  const requests = second!.scenario.requests as {id: string; result: {scenario: string; passed: boolean; checks: {name: string; passed: boolean}[]; atomCount: number}}[]
  expect(requests).toHaveLength(2)
  expect(new Set(requests.map(request => request.id)).size).toBe(2)
  for (const request of requests) {
    expect(request.result.scenario).toBe("agent-system.integrity")
    expect(request.result.passed).toBeTrue()
    expect(request.result.atomCount).toBe(6)
    expect(request.result.checks.length).toBeGreaterThan(0)
    expect(request.result.checks.every(check => check.passed)).toBeTrue()
  }
  expect(result.native.sessionId).toBe(second!.chat.sessionId)
  expect(result.native.prompts).toHaveLength(4)
  expect(result.native.resumes).toBe(3)
  expect(first!.executions.some(execution => execution.status === "committed")).toBeTrue()
  expect(second!.frontier.throughSequence).toBeGreaterThan(first!.frontier.throughSequence)
}, 180_000)
