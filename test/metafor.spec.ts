import {describe, it, expect} from "bun:test"
import {MetaFor} from "../metafor"

describe("MetaFor", () => {
  describe("базовая функциональность", () => {
    it("должен создавать контекст с простой схемой", () => {
      document.body.innerHTML = `
        <metafor-user></metafor-user>
      `

      MetaFor("user").context((types) => ({
        name: types.string.required("Гость")({title: "Имя пользователя"}),
        age: types.number.optional(),
      }))

      const actor = document.querySelector(`metafor-user`)!
    })
  })
})
