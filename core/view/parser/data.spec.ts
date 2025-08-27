import { describe, it, expect } from "bun:test"
import { parseMap, extractMapParams, parseCondition, parseText, splitText, enrichWithData } from "./data"

describe("data-parser", () => {
  describe("parseMap", () => {
    it("парсит простой map с одним параметром", () => {
      const result = parseMap("context.list.map((name) => html`")
      expect(result.path).toBe("/context/list")
      expect(result.metadata?.params).toEqual(["name"])
    })

    it("парсит map с деструктуризацией", () => {
      const result = parseMap("core.data.map(({ title, nested }) => html`")
      expect(result.path).toBe("/core/data")
      expect(result.metadata?.params).toEqual(["title", "nested"])
    })

    it("парсит map с несколькими параметрами", () => {
      const result = parseMap("items.map((item, index) => html`")
      expect(result.path).toBe("/items")
      expect(result.metadata?.params).toEqual(["item", "index"])
    })

    it("парсит вложенный map в контексте", () => {
      const context = { currentPath: "/core/list", pathStack: ["/core/list"], level: 1, mapParams: ["item"] }
      const result = parseMap("nested.map((n) => html`", context)
      expect(result.path).toBe("[item]/nested")
      expect(result.metadata?.params).toEqual(["n"])
    })

    it("парсит вложенный map с полным путем", () => {
      const context = { currentPath: "/core/list", pathStack: ["/core/list"], level: 1, mapParams: ["item"] }
      const result = parseMap("item.nested.map((n) => html`", context)
      expect(result.path).toBe("[item]/nested")
    })
  })

  describe("extractMapParams", () => {
    it("парсит простой параметр", () => {
      const params = extractMapParams("name")
      expect(params).toEqual(["name"])
    })

    it("парсит несколько параметров", () => {
      const params = extractMapParams("item, index")
      expect(params).toEqual(["item", "index"])
    })

    it("парсит деструктуризацию", () => {
      const params = extractMapParams("{ title, nested }")
      expect(params).toEqual(["title", "nested"])
    })

    it("парсит деструктуризацию с пробелами", () => {
      const params = extractMapParams("{ title , nested }")
      expect(params).toEqual(["title", "nested"])
    })

    it("возвращает пустой массив для пустых параметров", () => {
      const params = extractMapParams("")
      expect(params).toEqual([])
    })
  })

  describe("parseCondition", () => {
    it("парсит простое условие", () => {
      const result = parseCondition("context.flag")
      expect(result.path).toBe("/context/flag")
      expect(result.metadata?.expression).toBe("${0}")
    })

    it("парсит сложное условие", () => {
      const result = parseCondition("context.cond && context.cond2")
      expect(result.path).toEqual(["/context/cond", "/context/cond2"])
      expect(result.metadata?.expression).toBe("${0} && ${1}")
    })

    it("парсит условие с операторами", () => {
      const result = parseCondition("context.flag === context.cond2")
      expect(result.path).toEqual(["/context/flag", "/context/cond2"])
      expect(result.metadata?.expression).toBe("${0} === ${1}")
    })
  })

  describe("parseText", () => {
    it("парсит статический текст", () => {
      const result = parseText("Hello, world!")
      expect(result.value).toBe("Hello, world!")
      expect(result.data).toBeUndefined()
      expect(result.expr).toBeUndefined()
    })

    it("парсит текст с одной переменной", () => {
      const result = parseText("Hello, ${name}!")
      expect(result.data).toBe("/name")
      expect(result.expr).toBe("Hello, ${0}!")
      expect(result.value).toBeUndefined()
    })

    it("парсит текст с переменной в контексте map", () => {
      const context = { currentPath: "/context/list", pathStack: ["/context/list"], level: 1, mapParams: ["name"] }
      const result = parseText("Hello, ${name}!", context)
      expect(result.data).toBe("[item]")
      expect(result.expr).toBe("Hello, ${0}!")
      expect(result.value).toBeUndefined()
    })

    it("парсит текст с несколькими переменными", () => {
      const result = parseText("${title} - ${description}")
      expect(result.data).toEqual(["/title", "/description"])
      expect(result.expr).toBe("${0} - ${1}")
      expect(result.value).toBeUndefined()
    })
  })

  describe("splitText", () => {
    it("разбивает статический текст", () => {
      const parts = splitText("Hello, world!")
      expect(parts).toEqual([{ type: "static", text: "Hello, world!" }])
    })

    it("разбивает текст с одной переменной", () => {
      const parts = splitText("Hello, ${name}!")
      expect(parts).toEqual([
        { type: "static", text: "Hello, " },
        { type: "dynamic", text: "${name}" },
        { type: "static", text: "!" },
      ])
    })

    it("разбивает текст с несколькими переменными", () => {
      const parts = splitText("${title} - ${description}")
      expect(parts).toEqual([
        { type: "dynamic", text: "${title}" },
        { type: "static", text: " - " },
        { type: "dynamic", text: "${description}" },
      ])
    })

    it("разбивает текст с переменной в начале", () => {
      const parts = splitText("${name} is here")
      expect(parts).toEqual([
        { type: "dynamic", text: "${name}" },
        { type: "static", text: " is here" },
      ])
    })

    it("разбивает текст с переменной в конце", () => {
      const parts = splitText("Hello, ${name}")
      expect(parts).toEqual([
        { type: "static", text: "Hello, " },
        { type: "dynamic", text: "${name}" },
      ])
    })
  })

  describe("enrichWithData", () => {
    it("обогащает простую иерархию", () => {
      const enriched = enrichWithData([
        {
          type: "el",
          tag: "div",
          child: [
            {
              type: "text",
              text: "Hello, ${name}!",
            },
          ],
        },
      ])
      expect(enriched[0]?.type).toBe("el")
      const element = enriched[0] as any
      expect(element.child?.[0]?.type).toBe("text")
      expect(element.child?.[0]?.data).toBe("/name")
    })

    it("обогащает иерархию с map", () => {
      const enriched = enrichWithData([
        {
          type: "map",
          text: "context.list.map((name) => html`",
          child: [
            {
              type: "el",
              tag: "li",
              child: [
                {
                  type: "text",
                  text: "${name}",
                },
              ],
            },
          ],
        },
      ])
      expect(enriched[0]?.type).toBe("map")
      const mapNode = enriched[0] as any
      expect(mapNode.data).toBe("/context/list")
      expect(mapNode.child?.[0]?.child?.[0]?.data).toBe("[item]")
    })

    it("обогащает иерархию с условием", () => {
      const enriched = enrichWithData([
        {
          type: "cond",
          text: "context.flag",
          true: { type: "el", tag: "div", child: [] },
          false: { type: "el", tag: "span", child: [] },
        },
      ])
      expect(enriched[0]?.type).toBe("cond")
      const condNode = enriched[0] as any
      expect(condNode.data).toBe("/context/flag")
      expect(condNode.expr).toBeUndefined()
    })
  })
})
