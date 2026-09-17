import {choose} from "../../directives/choose.js"
import {test, describe, expect} from "bun:test"

describe("choose", () => {
  test("no cases", () => {
    expect(choose(1, [])).toBeUndefined()
  })

  test("matching cases", () => {
    expect(choose(1, [[1, () => "A"]])).toBe("A")
    expect(
      choose(2, [
        [1, () => "A"],
        [2, () => "B"]
      ])
    ).toBe("B")

    const a = {}
    const b = {}
    expect(
      choose(b, [
        [a, () => "A"],
        [b, () => "B"]
      ])
    ).toBe("B")
  })

  test("default case", () => {
    expect(
      choose(
        3,
        [
          [1, () => "A"],
          [2, () => "B"]
        ],
        () => "C"
      )
    ).toBe("C")
  })

  // Type-only regression test
  test.skip("type-only: correctly infers type of possible cases from value", () => {
    type CheckoutStep = "register" | "delivery" | "payment"
    const step = "register" as CheckoutStep
    return choose(step, [
      // @ts-expect-error 'test' is not assignable to 'CheckoutStep'
      ["test", () => 1],
      // @ts-expect-error 'random' is not assignable to 'CheckoutStep'
      ["random", () => 2],
      // This should compile fine
      ["register", () => 3]
    ])
  })
})
