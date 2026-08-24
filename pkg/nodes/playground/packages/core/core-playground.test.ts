import {describe, expect, test} from "bun:test"
import {createCoreRuntimeScenario} from "./core-runtime-scenario.ts"

describe("@nodes/core centralized playground", () => {
  test("shows Parameter, snapshot, ordered document and atomic topology without UI", () => {
    const scenario = createCoreRuntimeScenario()
    expect(scenario.tree.revision).toBe(0)
    expect(scenario.document().nodes.order).toEqual(["source"])
    expect(scenario.snapshot().nodes[0]?.parameters.map(({id}) => id)).toEqual(["gain", "value"])

    expect(scenario.setGain(2)).toBeTrue()
    expect(scenario.addParameter()).toBeTrue()
    expect(scenario.addParameter()).toBeFalse()
    expect(scenario.tree.revision).toBe(2)
    expect(scenario.tree.topologyRevision).toBe(1)
    expect(scenario.document().nodes.byId["source"]?.parameters.order).toEqual(["gain", "value", "extra"])
    expect(scenario.removeParameter()).toBeTrue()
    expect(scenario.removeParameter()).toBeFalse()
    expect(scenario.changes.map(({kind}) => kind)).toEqual(["parameter", "topology", "topology"])
  })
})
