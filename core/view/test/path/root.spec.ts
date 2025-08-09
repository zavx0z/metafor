import { describe, it, expect } from "bun:test"
import { MetaFor } from "../../../../web/metafor"
import { messagesFixture } from "../../../../fixture/message"

describe("Путь корневого актора", () => {
  const root = MetaFor(crypto.randomUUID())
    .context(() => ({}))
    .states({})
    .core()
    .processes()
    .reactions()
    .view({
      render: ({ html }) => html`<div>root</div>`,
    })

  describe("Путь одного корневого актора", async () => {
    const { messages } = messagesFixture({ meta: root })

    document.body.innerHTML = `<meta-${root}></meta-${root}>`

    const metaElement = document.querySelector(`meta-${root}`)! as HTMLElement & { __path: string[] }

    it("компонент имеет параметр __path", () => {
      expect(metaElement?.getAttribute("__path"), "параметр __path должен присутствовать в акторе").toBeDefined()
      expect(metaElement.__path, "должен быть массивом").toBeArray()
    })
    it("параметр __path не должен быть пустым", () => {
      expect(metaElement.__path, "должен содержать значения").not.toBeEmpty()
    })
    it("параметр __path должен содержать первым элементом 'actors'", () => {
      expect(metaElement.__path[0], "должен содержать первым элементом 'actors'").toBe("actors")
    })
    it("параметр __path должен содержать последним элементом индекс актора    ", () => {
      expect(
        metaElement.__path[metaElement.__path.length - 1],
        "должен содержать последним элементом индекс актора"
      ).toBe("0")
    })
    it("в патче добавления актора, должен быть путь", () => {
      const { patches } = messages[0]!
      const patch = patches[0]!
      expect(patch.path, "должен содержать путь").toBeDefined()
      expect(patch.path, "должен быть строкой").toBeString()
      expect(patch.path, "должен содержать путь до актора").toContain("/actors/0")
      expect(patch.path.split("/"), "должен быть массивом").toBeArray()
      expect(patch.path.split("/")[1], "должен содержать первым элементом 'actors'").toBe("actors")
      expect(patch.path.split("/")[2], "должен содержать последним элементом '0'").toBe("0")
    })
  })
  describe("Пути нескольких корневых акторов", () => {
    document.body.innerHTML = `<meta-${root}></meta-${root}><meta-${root}></meta-${root}>`
    const metaElements = Array.from(document.querySelectorAll(`meta-${root}`)) as (HTMLElement & { __path: string[] })[]
    const actor1 = metaElements[0]!
    const actor2 = metaElements[1]!

    it("компоненты имеют параметр __path", () => {
      expect(metaElements, "должен быть массивом").toBeArray()
      expect(metaElements.length, "должен содержать 2 элемента").toBe(2)
    })
    it("параметр __path первого актора должен содержать 'actors'", () => {
      expect(actor1.__path[0], "должен содержать первым элементом 'actors'").toBe("actors")
    })
    it("параметр __path второго актора должен содержать 'actors'", () => {
      expect(actor2.__path[0], "должен содержать первым элементом 'actors'").toBe("actors")
    })
    it("параметр __path первого актора должен содержать '0'", () => {
      expect(actor1.__path[actor1.__path.length - 1], "должен содержать последним элементом '0'").toBe("0")
    })
    it("параметр __path второго актора должен содержать '1'", () => {
      expect(actor2.__path[actor2.__path.length - 1], "должен содержать последним элементом '1'").toBe("1")
    })
  })
  describe("Пути нескольких корневых акторов смешанные со стандартными элементами", () => {
    document.body.innerHTML = `<meta-${root}></meta-${root}><div></div><meta-${root}></meta-${root}>`
    const metaElements = Array.from(document.querySelectorAll(`meta-${root}`)) as (HTMLElement & { __path: string[] })[]
    const actor1 = metaElements[0]!
    const actor2 = metaElements[1]!

    it("компоненты имеют параметр __path", () => {
      expect(metaElements, "должен быть массивом").toBeArray()
      expect(metaElements.length, "должен содержать 2 элемента").toBe(2)
    })
    it("параметр __path первого актора должен содержать 'actors'", () => {
      expect(actor1.__path[0], "должен содержать первым элементом 'actors'").toBe("actors")
    })
    it("параметр __path второго актора должен содержать 'actors'", () => {
      expect(actor2.__path[0], "должен содержать первым элементом 'actors'").toBe("actors")
    })
    it("параметр __path первого актора должен содержать '0'", () => {
      expect(actor1.__path[actor1.__path.length - 1], "должен содержать последним элементом '0'").toBe("0")
    })
    it("параметр __path второго актора должен содержать '1'", () => {
      expect(actor2.__path[actor2.__path.length - 1], "должен содержать последним элементом '1'").toBe("1")
    })
  })
})
