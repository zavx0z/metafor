import {expect, test} from "bun:test"
import "@metafor/dsl"
import root from "../../../../meta"

test("native peer lifecycle requests independent persistent network/Capsule children in ordered phases", () => {
  expect(root.lifecycle).toEqual({started: {field: "input", value: "started"}, stopping: {field: "input", value: "stopping"}})
  expect(root.processes?.filter(process => process.declaration.type === "action").map(process => process.key)).toEqual([
    "starting-network", "recovering-network", "starting-capsule", "recovering-capsule", "stopping-capsule", "stopping-network",
  ])
  expect(root.matter).toHaveLength(2)
  expect(JSON.stringify(root.matter)).toContain("@internal/peer")
  expect(JSON.stringify(root.matter)).toContain('"capsule"')
  for (const process of root.processes ?? []) {
    if (process.declaration.type === "action") expect(process.declaration.action.src).toBe("@cosmos/peer-lifecycle")
  }
  expect(root.superposition?.find(state => state.name === "waiting-capsule")?.transitions).toHaveProperty("stopping-capsule")
})


test("network recovery starts an unstarted Capsule and preserves a healthy existing Capsule", () => {
  const transitions = root.superposition?.find(state => state.name === "waiting-network-recovery")?.transitions
  expect(transitions).toMatchObject({
    "starting-capsule": {networkAck: {eq: true}, capsuleStatus: {eq: "stopped"}},
    "recovering-capsule": {networkAck: {eq: true}, capsuleStatus: {eq: "failed"}},
    ready: {networkAck: {eq: true}, capsuleStatus: {eq: "running"}},
  })
})
