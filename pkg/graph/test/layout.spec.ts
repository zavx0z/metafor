import {describe, it, expect} from "bun:test"
import {Atom, t} from "../../machine/atom"

describe("layout", () => {
  const atom = Atom("layout-test")
    .states("state1", "state2")
    .context({
      param1: t.string({title: "Param 1"}),
      param2: t.string({title: "Param 2"})
    })
    .collapses([
      {
        from: "state1",
        to: [{state: "state2", trigger: {param1: "value1"}}]
      },
      {
        from: "state2",
        to: [{state: "state1", trigger: {param2: "value2"}}]
      }
    ])
    .core()
    .actions({})
    .create({state: "state1"})
  it("should be defined", () => {
    const snapshot = atom.snapshot()
    expect(snapshot).toMatchSnapshot()
  })
})
