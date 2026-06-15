import {afterEach, expect, test} from "bun:test"
import {force} from "./channel.ts"

afterEach(() => {
  force.close()
})

test("force emit сообщает observe и entropy, а absorb только observe", () => {
  const observed: string[] = []
  const entropy: string[] = []

  force.observe((event) => {
    observed.push(...event.data.parts.map((part) => part.part))
  })
  force.entropy((event) => {
    entropy.push(...event.data.parts.map((part) => part.part))
  })

  force.emit({parts: [{part: "photon", op: "replace", path: "wimp", value: "ready"}]})
  force.absorb({parts: [{part: "gluon", op: "replace", path: "field", value: 1}]})

  expect(observed).toEqual(["photon", "gluon"])
  expect(entropy).toEqual(["photon"])
})
