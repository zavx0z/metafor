import { describe, it, expect } from "bun:test"
import { MetaFor } from "./metafor"

describe("MetaFor", () => {
  describe("базовая функциональность", () => {

    it("должен создавать контекст с простой схемой", () => {
      const {context, onUpdate, update} = MetaFor("user").context((types) => ({
        name: types.string.required( "Гость" )({title: "Имя пользователя"}),
        age: types.number.optional(),
      }))

      expect(context).toBeDefined()
      update({name: "user"})
      expect(context.name).toBe("Гость")
      expect(context.age).toBeNull()
      expect(context._title.name)
    })
  })
})
