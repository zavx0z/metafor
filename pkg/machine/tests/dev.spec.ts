import {describe, expect, it} from "bun:test"
import {Atom, t} from "../atom.js"

describe("Неполноценный атом в режиме разработки", async () => {
  it("При отсутствии триггеров в коллапсах, переход не будет выполнен", async () => {
    const channel = new BroadcastChannel("validator")
    const messages: {id: string; message: string}[] = []
    channel.onmessage = ({data}) => messages.push(data)

    const atom = Atom("dev-test")
      .states("ОЖИДАНИЕ", "РАБОТА")
      .context({
        parameter: t.number({default: 0})
      })
      .collapses([
        {
          from: "ОЖИДАНИЕ",
          to: [{state: "РАБОТА", trigger: {}}]
        }
      ])
      .core(() => ({}))
      .actions({})
      .reactions([]).create({state: "ОЖИДАНИЕ"})

    expect(atom.state).toBe("ОЖИДАНИЕ")
    await Bun.sleep(100)
    expect(messages[0]).toEqual({
      id: "dev-test",
      message: 'Пустой триггер в переходе из состояния "ОЖИДАНИЕ" в "РАБОТА". Триггер должен содержать хотя бы одно условие.'
    })
  })

  it("При наличии пустого состояния выводится предупреждение", async () => {
    const channel = new BroadcastChannel("validator")
    const messages: {id: string; message: string}[] = []
    channel.onmessage = ({data}) => messages.push(data)

    Atom("dev-test")
      .states("", "ОТКРЫТ", "ЗАКРЫТ")
      .context({
        parameter: t.number({default: 0})
      })
      .collapses([])
      .core()
      .actions({})
      .reactions([]).create({state: "ОТКРЫТ"})

    await Bun.sleep(100)
    expect(messages[0]).toEqual({
      id: "dev-test",
      message: "Состояние с индексом 0 имеет пустое имя. Все состояния должны иметь непустые строковые имена"
    })
    it.todo("В графе отобразить состояние с пустым именем для редактирования")
  })
})
