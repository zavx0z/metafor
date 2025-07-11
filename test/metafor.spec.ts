import { describe, it, expect } from "bun:test"
import { MetaFor } from "../metafor"

describe("MetaFor", () => {
  describe("базовая функциональность", () => {
    it("должен создавать контекст с простой схемой", () => {
      const { context, onUpdate, update, schema } = MetaFor("user").context((types) => ({
        name: types.string.required("Гость")({ title: "Имя пользователя" }),
        age: types.number.optional(),
      }))

      let count = 0
      onUpdate((ctx) => {
        count++
      })

      expect(context).toBeDefined()

      expect(context.age).toBeNull()
      expect(context._title.name).toBe("Имя пользователя")

      update({ name: "user" })
      expect(count).toBe(1)
      expect(context.name).toBe("user")

      expect(schema).toEqual({
        name: {
          default: "Гость",
          required: true,
          title: "Имя пользователя",
          type: "string",
        },
        age: {
          type: "number",
          default: undefined,
          required: false,
        },
      })
    })
  })
})
