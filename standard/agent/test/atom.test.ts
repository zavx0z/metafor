import {expect, test} from "bun:test"
import type {AtomRef} from "@metafor/types/metafor/graph"
import type {AgentConfiguration} from "@metafor/types/metafor/agents"
import {useAtom, type AtomContext, type AtomViewSnapshot} from "../atom"
import {DEFAULT_AGENT_PRESENTATION, projectAgentPresentation} from "../presentation"

export function configuration(id = "operator"): AgentConfiguration {
  return {id, atom: {kind: "atom", scope: "owner"}, presentation: DEFAULT_AGENT_PRESENTATION,
    tools: [{kind: "oracle-tool", name: "sensor.read", input: {channel: 7}, owner: {meta: "@devices/sensor"}}],
    displays: [{id: "sensor", source: {kind: "mass", key: "reading"}}, {id: "world", source: {kind: "graph"}}, {id: "self", source: {kind: "atom", scope: "owner"}}]}
}

test("useAtom использует только явно переданный owning context без singleton или собственного Store", () => {
  const first = "atom:first" as AtomRef, second = "atom:second" as AtomRef
  const snapshot: AtomViewSnapshot = {ref: first, revision: "r1", state: "idle", configuration: configuration(), chat: [], provider: null, operations: [], context: {allowed: true}}
  let read = snapshot
  let subscriptions = 0
  const atom: AtomContext = {ref: first, getSnapshot: () => read, subscribe: () => {subscriptions++; return () => {}}, actions: {}}
  expect(useAtom(atom)).toBe(atom)
  expect(useAtom(atom).getSnapshot()).toBe(snapshot)
  expect(subscriptions).toBe(0)
  read = {...snapshot, ref: second}
  expect(() => useAtom(atom)).toThrow("другой identity")
  expect(() => useAtom({kind: "atom", scope: "owner"} as unknown as AtomContext)).toThrow("AtomContext")
})

test("canonical displays/tools переживают JSON persistence, default chat tabs не превращаются в права", () => {
  const persisted = JSON.parse(JSON.stringify(configuration())) as AgentConfiguration
  const presentation = projectAgentPresentation(persisted)
  expect(presentation.defaultTab).toBe("chat")
  expect(presentation.tabs).toEqual(["chat", "provider", "tools", "context"])
  expect(presentation.atom).toEqual({kind: "atom", scope: "owner"})
  expect(presentation.displays).toBe(persisted.displays)
  expect(presentation.tools).toBe(persisted.tools)
  expect(presentation.tools[0]?.name).toBe("sensor.read")
  expect(presentation.displays.map(display => display.source.kind)).toEqual(["mass", "graph", "atom"])
  expect(JSON.stringify(persisted)).not.toContain("execute")
  expect(() => projectAgentPresentation({...persisted, displays: [...persisted.displays, persisted.displays[0]!]})).toThrow("identity")
})
