import {expect, test} from "bun:test"
import {Atom, t} from "../atom.js"

test("блокировка триггеров перед входом в новое состояние", async () => {
  let value = -1

  const atom = Atom("test sync")
    .states("INIT", "PROCESS", "DONE")
    .context({
      value: t.number({nullable: true})
    })
    .collapses([
      {
        from: "INIT",
        action: "initAction",
        to: [{state: "PROCESS", trigger: {value: {gt: 10}}}]
      },
      {
        from: "PROCESS",
        action: "syncAction",
        to: [
          {state: "DONE", trigger: {value: {gt: 14}}},
          {state: "INIT", trigger: {value: {lt: 4}}}
        ]
      }
    ])
    .core()
    .actions({
      initAction: ({update}) => {
        update({value: 11})
      },
      syncAction: ({update}) => {
        update({value: 15})
        const end = Date.now() + 500
        while (Date.now() < end) {
          // Блокируем поток
        }
      }
    })
    .reactions([]).create({
      state: "INIT",
      onCollapse: async (_, newState, atom) => {
        // console.log("НОВОЕ СОСТОЯНИЕ: ", newState, {...atom.context})
        if (newState === "PROCESS") {
          atom.update({value: 1}) // не должен вызвать переход, но контекст должен быть обновлен даже при блокировке триггеров
          value = atom.context.value
        }
      }
    })
  await Bun.sleep(1000)
  expect(value).toBe(1)
  expect(atom.state).toBe("DONE")
})

test("блокировка триггеров для асинхронного действия", async () => {
  const atom = Atom("test")
    .states("INIT", "PROCESS", "DONE")
    .context({
      value: t.number({nullable: true})
    })
    .collapses([
      {
        from: "INIT",
        action: "asyncAction",
        to: [
          {
            state: "DONE",
            trigger: {value: {gt: 10}}
          }
        ]
      }
    ])
    .core()
    .actions({
      asyncAction: async ({update}) => {
        await new Promise(resolve => setTimeout(resolve, 10))
        update({value: 15}) // Это не должно вызвать переход
      }
    })
    .reactions([]).create({state: "INIT"})
  // @ts-ignore
  const result: unknown = atom.update({value: 1})
  if (result instanceof Promise) {
    expect(atom.process).toBe(true)
    await result
    expect(atom.process).toBe(false)
  }
  expect(atom.state).toBe("INIT") // Проверяем что триггер заблокирован во время действия
})

test("снятие блокировки после действия", async () => {
  const atom = Atom("test")
    .states("INIT", "DONE")
    .context({
      value: t.number({nullable: true})
    })
    .collapses([
      {
        from: "INIT",
        action: "longAction",
        to: [
          {
            state: "DONE",
            trigger: {value: {gt: 10}}
          }
        ]
      }
    ])
    .core()
    .actions({
      longAction: async ({update}) => {
        await new Promise(resolve => setTimeout(resolve, 50))
        update({value: 15})
      }
    })
    .reactions([]).create({state: "INIT", context: {value: 2}})

  expect(atom.state).toBe("INIT")
  expect(atom.process).toBe(true)
  await Bun.sleep(100)
  expect(atom.process).toBe(false)
  expect(atom.state).toBe("DONE")
})
