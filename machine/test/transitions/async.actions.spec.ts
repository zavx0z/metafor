import { describe, test, expect } from "bun:test"
import { Machine } from "../../index.ts"

describe("Machine - автоматические переходы с update", async () => {
  type TestContext = {
    value: { type: "string"; required: false; default: "ctx_1" }
  }

  test("Machine - переходы по всем состояниям с асинхронными действиями", async () => {
    const context = { value: "ctx_1" }

    const machine = new Machine<"state_1" | "state_2" | "state_3", TestContext>(
      {
        state_1: { state_2: { value: "ctx_2" } },
        state_2: { state_3: { value: "ctx_3" } },
        state_3: {},
      },
      {
        state_1: {
          action: async () => {
            await Bun.sleep(100)
            return { value: "ctx_2" }
          },
          success: ({ update, data }: { update: (v: Partial<{ value: string }>) => void; data: { value: string } }) => {
            update({ value: data.value })
          },
        },
        state_2: {
          action: async () => {
            await Bun.sleep(100)
            return { value: "ctx_3" }
          },
          success: ({ update, data }: { update: (v: Partial<{ value: string }>) => void; data: { value: string } }) => {
            update({ value: data.value })
          },
        },
        state_3: {
          action: async () => {
            await Bun.sleep(100)
            return { value: "ctx_4" }
          },
          success: ({ update, data }: { update: (v: Partial<{ value: string }>) => void; data: { value: string } }) => {
            update({ value: data.value })
          },
        },
      },
      "state_1",
      (values) => {
        Object.assign(context, values)
        console.log("update", values)
        machine.update(context)
        return context
      }
    )
    machine.update(context)
    await Bun.sleep(500)

    expect(machine.currentState, "Машина должна перейти в конечное состояние state_3").toBe("state_3")
    expect(context.value, "Значение контекста должно быть ctx_4").toBe("ctx_4")
  })
})
