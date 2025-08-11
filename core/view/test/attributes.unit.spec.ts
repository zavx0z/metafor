import { expect, test, describe, it } from "bun:test"
import { parseAttributeValue, parseAttributes, parseAttributesForArray } from "../parser/attributes.ts"

describe("unit.attributes", () => {
  describe("parseAttributeValue.conditional.placeholder", () => {
    const map = new Map<string, { src: string; key: string; trueValue: string; falseValue?: string }>()
    map.set("COND_1", { src: "context", key: "flag", trueValue: "x", falseValue: "y" })
    const res = parseAttributeValue("COND_1", undefined, map)
    it("парсинг", () => {
      expect((res as any).type, "должен быть условный тип").toBe("conditional")
      expect((res as any).trueValue, "trueValue восстанавливается").toBe("x")
      expect((res as any).falseValue, "falseValue восстанавливается").toBe("y")
    })
    it("рендер", () => {})
  })

  describe("parseAttributeValue.conditional.mixed", () => {
    const map = new Map<string, { src: string; key: string; trueValue: string; falseValue?: string }>()
    map.set("COND_2", { src: "core", key: "ok", trueValue: "enabled", falseValue: "" })
    const res = parseAttributeValue("pre-COND_2-suf", undefined, map)
    it("парсинг", () => {
      expect((res as any).type, "условный тип в mixed режиме").toBe("conditional")
      expect((res as any).result, "result должен содержать восстановленную строку").toContain("${core.ok")
    })
    it("рендер", () => {})
  })

  describe("parseAttributeValue.interpolation.placeholder", () => {
    const map = new Map<string, { src: string; key: string }>()
    map.set("I0", { src: "context", key: "name" })
    const res = parseAttributeValue("I0", map)
    it("парсинг", () => {
      expect((res as any).src, "src восстанавливается").toBe("context")
      expect((res as any).key, "key восстанавливается").toBe("name")
    })
    it("рендер", () => {})
  })

  describe("parseAttributeValue.interpolation.mixed", () => {
    const map = new Map<string, { src: string; key: string }>()
    map.set("I1", { src: "core", key: "v" })
    const res = parseAttributeValue("a-I1-b", map)
    it("парсинг", () => {
      expect((res as any).result, "mixed должен вернуть исходную строку").toBe("a-${core.v}-b")
    })
    it("рендер", () => {})
  })

  describe("parseAttributes.events.from-map", () => {
    const eventMap = new Map<string, string>()
    eventMap.set("EV0", "${() => 1}")
    const attrs = parseAttributes('onclick="EV0"', undefined, undefined, eventMap)
    it("парсинг", () => {
      expect(attrs.onclick, "должен достать исходную строку обработчика").toBe("${() => 1}")
    })
    it("рендер", () => {})
  })

  describe("parseAttributes.events.from-interpolation", () => {
    const attrs = parseAttributes('onclick="${context.cb}"')
    it("парсинг", () => {
      expect(attrs.onclick, "должен сериализовать ссылку на функцию").toBe("${context.cb}")
    })
    it("рендер", () => {})
  })

  describe("parseAttributesForArray.events.from-map", () => {
    const eventMap = new Map<string, string>()
    eventMap.set("EV1", "${(e) => e}")
    const attrs = parseAttributesForArray('onclick="EV1"', new Map(), new Map(), eventMap)
    it("парсинг", () => {
      expect(attrs.onclick, "в массивах тоже достаем исходную строку обработчика").toBe("${(e) => e}")
    })
    it("рендер", () => {})
  })

  describe("parseAttributes.unquoted.static", () => {
    const attrs = parseAttributes("id=root class=box data-a=1")
    it("парсинг", () => {
      expect(attrs.id, "id без кавычек").toBe("root")
      expect(attrs.class, "class без кавычек").toBe("box")
      expect((attrs as any)["data-a"], "data-a без кавычек").toBe("1")
    })
    it("рендер", () => {})
  })

  describe("parseAttributes.unquoted.events.boolean", () => {
    const attrs = parseAttributes("onclick")
    it("парсинг", () => {
      expect(attrs.onclick, "булев on* без значения").toBe("")
    })
    it("рендер", () => {})
  })

  describe("parseAttributesForArray.unquoted.static", () => {
    const attrs = parseAttributesForArray("type=text disabled", new Map(), new Map())
    it("парсинг", () => {
      expect(attrs.type, "type без кавычек").toBe("text")
      expect(attrs.disabled, "disabled булев").toBe("")
    })
    it("рендер", () => {})
  })
})
