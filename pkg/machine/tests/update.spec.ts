import {describe, expect, test} from "bun:test"
import {Atom, t} from "../atom.js"
import {messagesFixture} from "@quantum/fixtures"

describe("update", async () => {
  const {waitForMessages} = messagesFixture()

  const atom = Atom("test")
    .states("INITIAL", "NEXT", "FINAL")
    .context({
      field1: t.string({nullable: true}),
      field2: t.number({default: 0})
    })
    .collapses([
      {
        from: "INITIAL",
        action: "actionInit",
        to: [
          {
            state: "NEXT",
            trigger: {field2: 42}
          }
        ]
      },
      {
        from: "NEXT",
        action: "actionDouble",
        to: [
          {
            state: "FINAL",
            trigger: {field2: 100, field1: "test"}
          }
        ]
      }
    ])
    .core(({update}) => ({
      coreMethod: () => {
        update({field1: "test"})
      },
      complexMethod: () => {
        update({field1: "test1", field2: 1})
      }
    }))
    .actions({
      actionInit: ({update}) => {
        update({field2: 42})
      },
      actionDouble: ({update}) => {
        update({field1: "action1", field2: 42})
      }
    })
    .reactions([]).create({state: "INITIAL"})

  const messages = await waitForMessages()

  expect(messages[0].patch.op, "Первое сообщение о добавлении нового атома").toBe("add")

  test("actionInit в INITIAL", () => {
    expect(atom.state).toBe("NEXT")
    expect(messages[1]).toMatchObject({
      meta: {
        atom: "test",
        func: "actionInit",
        target: "action",
        timestamp: expect.any(Number)
      },
      patch: {
        op: "replace",
        path: "/context",
        value: {field2: 42}
      }
    })
    expect(messages[2].patch.path, "После обновления контекста получаем сообщение об изменении состояния").toBe("/state")
  })

  test("actionDouble в NEXT", () => {
    expect(atom.state).toBe("NEXT")
    expect(messages[3]).toMatchObject({
      meta: {
        atom: "test",
        func: "actionDouble",
        target: "action",
        timestamp: expect.any(Number)
      },
      patch: {
        op: "replace",
        path: "/context",
        value: {field1: "action1"}
      }
    })
  })

  test("update должен логировать источник вызова и измененные поля", async () => {
    // Проверяем одиночный вызов update из core
    atom.core.coreMethod()
    await Bun.sleep(10)
    expect(messages[4]).toMatchObject({
      meta: {
        atom: "test",
        func: "coreMethod",
        target: "core",
        timestamp: expect.any(Number)
      },
      patch: {
        op: "replace",
        path: "/context",
        value: {field1: "test"}
      }
    })

    // Проверяем множественные вызовы update из core
    atom.core.complexMethod()
    await Bun.sleep(10)
    expect(messages[5]).toEqual({
      meta: {
        atom: "test",
        func: "complexMethod",
        target: "core",
        timestamp: expect.any(Number)
      },
      patch: {
        op: "replace",
        path: "/context",
        value: {field1: "test1", field2: 1}
      }
    })
  })
})
