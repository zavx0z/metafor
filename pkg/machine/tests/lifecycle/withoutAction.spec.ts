import {describe, expect, test} from "bun:test"
import {Atom, t} from "../../atom.js"
import {messagesFixture} from "@quantum/fixtures"

describe("Инициализация без действия", async () => {
  const {waitForMessages} = messagesFixture()

  const initialState = "INITIAL"
  const initialContext = {value: "initial"}

  const atom = Atom("TestAtom")
    .states("INITIAL", "OTHER")
    .context({
      value: t.string({nullable: true})
    })
    .collapses([])
    .core()
    .actions({})
    .reactions([]).create({
      state: initialState,
      context: initialContext
    })

  const messages = await waitForMessages(10)

  describe("Присваивание контекста/состояния и отправка snapshot атома", async () => {
    const message = messages[0]

    test("Тип патча add", () => {
      expect(message.patch.op, "Патч типа add должен быть при первой инициализации атома").toBe("add")
    })

    test("Состояние равно параметру state в create", () => {
      expect(message.patch.value.state).toBe(initialState)
    })

    test("Контекст равен параметру context в create", () => {
      expect(message.patch.value.context).toEqual(initialContext)
    })
  })

  test("Сообщение единственное", () => {
    expect(messages, "Других сообщений не должно быть").toHaveLength(1)
  })

  describe("Атом инициализирован", async () => {
    test("Состояние равно параметру state в create", () => {
      expect(atom.state).toBe(initialState)
    })

    test("Контекст равен параметру context в create", () => {
      expect(atom.context).toEqual(initialContext)
    })
  })
})
