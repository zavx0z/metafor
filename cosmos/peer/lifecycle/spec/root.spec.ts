import {expect, test} from "bun:test"
import "@metafor/dsl"
import root from "../../../../meta"

test("native peer lifecycle requests independent persistent network/Capsule children in ordered phases", () => {
  expect(root.lifecycle).toEqual({started: {field: "input", value: "started"}, stopping: {field: "input", value: "stopping"}})
  expect(root.processes?.filter(process => process.declaration.type === "action").map(process => process.key)).toEqual([
    "preparing-network", "starting-network", "recovering-network", "starting-capsule", "recovering-capsule", "stopping-capsule", "stopping-network",
  ])
  expect(root.matter).toHaveLength(2)
  expect(JSON.stringify(root.matter)).toContain("@internal/peer")
  expect(JSON.stringify(root.matter)).toContain('"capsule"')
  for (const process of root.processes ?? []) {
    if (process.declaration.type === "action") {
      expect(process.declaration.env).toEqual(["server"])
      expect(process.declaration.action.src).toBe("@cosmos/peer-lifecycle")
      expect(process.declaration.action.src).not.toMatch(/startReleaseNode|openProfile|Bun\.spawn/)
    }
  }
  expect(root.superposition?.find(state => state.name === "waiting-capsule")?.transitions).toHaveProperty("stopping-capsule")
})

test("prepared birth admits only network preparation and waits before any Capsule intent", () => {
  expect(root.superposition.find(state => state.name === "waiting")?.transitions).toMatchObject({
    "preparing-network": {input: {eq: "started"}, prepareOnBirth: {eq: true}},
    "starting-network": {input: {eq: "started"}, prepareOnBirth: {eq: false}},
  })
  const preparing = root.processes!.find(process => process.key === "preparing-network")!
  if (!("success" in preparing.declaration) || !preparing.declaration.success) throw new Error("Preparation action is missing")
  let values: unknown
  const success = new Function(`return (${preparing.declaration.success.src})`)()
  success({data: {request: "start", requestId: "prepared-birth"}, update: (value: unknown) => {values = value}})
  expect(values).toEqual({networkRequest: "prepare", networkRequestId: "prepared-birth", networkAck: false, networkError: null, input: null})
  expect(root.superposition.find(state => state.name === "prepared")?.transitions).toEqual({stopped: {input: {eq: "stopping"}}})
})


test("network recovery starts an unstarted Capsule and preserves a healthy existing Capsule", () => {
  const transitions = root.superposition?.find(state => state.name === "waiting-network-recovery")?.transitions
  expect(transitions).toMatchObject({
    "starting-capsule": {networkAck: {eq: true}, capsuleStatus: {eq: "stopped"}},
    "recovering-capsule": {networkAck: {eq: true}, capsuleStatus: {eq: "failed"}},
    ready: {networkAck: {eq: true}, capsuleStatus: {eq: "running"}},
  })
})
