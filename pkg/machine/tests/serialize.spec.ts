import {describe, expect, test} from "bun:test"
import {Atom, t} from "../atom.js"
import {AtomFromSnapshot} from "../snapshot.js"

describe("Сериализация и десериализация атома с состояниями IDLE, RUNNING, ERROR, SUCCESS", () => {
  const atomTask = Atom("Задача")
    .states("IDLE", "RUNNING", "ERROR", "SUCCESS")
    .context({
      url: t.string({title: "Адрес"}),
      retries: t.number({title: "Количество попыток"}),
      errorCode: t.number({title: "Код ошибки"}),
      isComplete: t.string({title: "Завершено"})
    })
    .collapses([
      {
        from: "IDLE",
        to: [{state: "RUNNING", trigger: {url: {include: "https"}, retries: {gt: 0, lt: 5}}}]
      },
      {
        from: "RUNNING",
        to: [
          {state: "SUCCESS", trigger: {isComplete: "true"}},
          {state: "ERROR", trigger: {errorCode: {gt: 400, lt: 599}}}
        ]
      },
      {
        from: "ERROR",
        to: [{state: "IDLE", trigger: {retries: {gt: 0, lt: 5}}}]
      }
    ])
    .core(({update, context}) => ({
      updateUrl: () => update({url: context.url + ":8000"}),
    }))
    .actions({})
    .reactions([])


  // describe.todo("Проверка сериализации ядра", () => {
  //   test.todo("Если параметр или функция ядра не используется в атоме, не сериализовать его", () => {
  //   })
  // })

  describe("Создание и начальная проверка состояния", () => {
    test("Должно корректно инициализировать атом и проверять начальные данные", async () => {
      const atom = atomTask.create({
        state: "IDLE",
        context: {url: "https://task.com", retries: 0}
      })
      // Теперь состояние должно быть IDLE, так как мы его указали в create()
      expect(atom.state).toBe("IDLE")
      // Выполняем проверку перехода из IDLE в RUNNING
      atom.update({url: "https://task.com", retries: 1})
      await Bun.sleep(100)
      expect(atom.state).toBe("RUNNING")
    })
  })

  describe("Сериализация атома", () => {
    test("Должна корректно сериализовать атом", () => {
      const atom = atomTask.create({
        state: "IDLE",
        context: {url: "https://task.com", retries: 1}
      })

      // Сериализация атома через метод класса
      const serialized = atom.snapshot()
      expect(serialized).toMatchSnapshot()
    })
  })
  const template = Atom("Задача")
    .states("IDLE", "RUNNING", "ERROR", "SUCCESS")
    .context({
      url: t.string({title: "Адрес"}),
      retries: t.number({title: "Количество попыток"}),
      errorCode: t.number({title: "Код ошибки"}),
      isComplete: t.string({title: "Завершено"})
    })
    .collapses([
      {
        from: "IDLE",
        to: [{state: "RUNNING", trigger: {url: {include: "https"}, retries: {gt: 0, lt: 5}}}]
      },
      {
        from: "RUNNING",
        to: [
          {state: "SUCCESS", trigger: {isComplete: "true"}},
          {state: "ERROR", trigger: {errorCode: {gt: 400, lt: 599}}}
        ]
      }
    ])


  describe.skip("Десериализация атома", () => {
    const atom = template
      .core()
      .actions({})
      .reactions([]).create({
        state: "RUNNING",
        context: {url: "https://task.com", retries: 1}
      })
    const serialized = atom.snapshot()
    const restoredAtom = AtomFromSnapshot(serialized)

    test("Должна корректно восстановить состояние после десериализации", () => {
      console.log("Restored Atom State:", restoredAtom.state)
      console.log("Restored Atom Context:", restoredAtom.context)
      expect(restoredAtom.state).toBe("RUNNING")
    })
    test("Должна корректно выполнять переходы после восстановления", () => {
      restoredAtom.update({isComplete: "true"})
      expect(restoredAtom.state).toBe("SUCCESS")
    })
  })
})
