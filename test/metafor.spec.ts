import { describe, it, expect } from "bun:test"
import { MetaFor } from "../metafor"

describe("MetaFor", () => {
  describe("базовая функциональность", () => {
    it("должен создавать контекст с простой схемой", () => {
      document.body.innerHTML = `
        <metafor-user></metafor-user>
      `

      const Actor = MetaFor("user").context((types) => ({
        name: types.string.required("Гость")({ title: "Имя пользователя" }),
        age: types.number.optional(),
      }))

      const actor = document.querySelector(`metafor-user`) as InstanceType<typeof Actor>
      const { context, onUpdate, update, schema } = actor

      let count = 0
      onUpdate((ctx) => {
        count++
      })

      expect(actor).toBeDefined()

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
