import {describe, expect, test} from "bun:test"
import {Atom, t} from "../atom.js"

describe("Корректные переходы состояний при загрузке данных", () => {
  const template = Atom("Загрузчик данных")
    .states("IDLE", "LOADING", "SUCCESS", "ERROR")
    .context({
      url: t.string({title: "URL", nullable: true}),
      responseTime: t.number({title: "Время ответа", nullable: true}),
      code: t.number({title: "Код ошибки", nullable: true})
    })
    .collapses([
      {
        from: "IDLE",
        to: [{state: "LOADING", trigger: {url: {startsWith: "https://"}, responseTime: {gt: 0, lt: 5000}}}]
      },
      {
        from: "LOADING",
        to: [
          {state: "SUCCESS", trigger: {responseTime: {gt: 0, lt: 5000}, code: 200}},
          {state: "ERROR", trigger: {code: {gt: 400, lt: 599}}}
        ]
      },
      {
        from: "ERROR",
        to: [{state: "LOADING", trigger: {responseTime: {gt: 0, lt: 5000}, code: {gt: 400, lt: 599}}}]
      },
      {
        from: "SUCCESS",
        to: [{state: "IDLE", trigger: {url: {include: "complete"}}}]
      }
    ])
  const atom = template
    .core()
    .actions({})
    .reactions([]).create({
      state: "IDLE",
      context: {url: "https://api.example.com/data", responseTime: 0, code: 0}
    })
  describe("Инициализация и начальные состояния", () => {
    test("Начальное состояние должно быть IDLE", () => {
      expect(atom.state).toBe("IDLE")
    })
  })

  describe("Корректные переходы состояний", () => {
    test("Переход из IDLE в LOADING", () => {
      atom.update({url: "https://api.example.com/data", responseTime: 3000, code: 0})
      expect(atom.state).toBe("LOADING")
    })

    test("Переход из LOADING в SUCCESS", () => {
      atom.update({responseTime: 2500, code: 200})
      expect(atom.state).toBe("SUCCESS")
    })

    test("Переход из SUCCESS в IDLE", () => {
      atom.update({url: "https://api.example.com/data/complete"})
      expect(atom.state).toBe("IDLE")
    })
    test("Переход из IDLE в LOADING", () => {
      atom.update({url: "https://api.example.com/data", responseTime: 3000, code: 0})
      expect(atom.state).toBe("LOADING")
    })
    test("Переход из LOADING в ERROR при ошибке", () => {
      atom.update({responseTime: 4500, code: 500})
      expect(atom.state).toBe("ERROR")
    })

    test("Переход из ERROR в LOADING при повторной попытке", () => {
      atom.update({url: "https://api.example.com/data", responseTime: 4500, code: 500})
      expect(atom.state).toBe("LOADING")
    })

    test("Переход из LOADING в SUCCESS после исправления ошибки", () => {
      atom.update({responseTime: 2000, code: 200})
      expect(atom.state).toBe("SUCCESS")
    })
  })
})
