import { describe, it, expect } from "bun:test"
import { parseAttributes } from "../index.ts"

describe("fields и mass", () => {
  describe("meta-компоненты с fields и mass", () => {
    it("meta-компонент с fields", () => {
      const attrs = parseAttributes("fields=${{user: currentUser, theme: currentTheme}}")
      expect(attrs).toEqual({
        fields: "{ user: currentUser, theme: currentTheme }",
      })
    })

    it("meta-компонент с mass", () => {
      const attrs = parseAttributes("mass=${{state: appState, actions: appActions}}")
      expect(attrs).toEqual({
        mass: "{ state: appState, actions: appActions }",
      })
    })

    it("meta-компонент с fields и mass", () => {
      const attrs = parseAttributes(
        "fields=${{user: currentUser, theme: currentTheme}} mass=${{state: appState, actions: appActions}}"
      )
      expect(attrs).toEqual({
        fields: "{ user: currentUser, theme: currentTheme }",
        mass: "{ state: appState, actions: appActions }",
      })
    })

    it("meta-компонент с динамическим fields", () => {
      const attrs = parseAttributes("fields=${{user: ${getCurrentUser()}, theme: ${getTheme()}}}")
      expect(attrs).toEqual({
        fields: "{ user: ${getCurrentUser()}, theme: ${getTheme()} }",
      })
    })

    it("meta-компонент с условным fields", () => {
      const attrs = parseAttributes(
        "fields=${{user: isLoggedIn ? currentUser : null, theme: isDark ? darkTheme : lightTheme}}"
      )
      expect(attrs).toEqual({
        fields: "{ user: isLoggedIn ? currentUser : null, theme: isDark ? darkTheme : lightTheme }",
      })
    })

    it("meta-компонент с вложенными объектами в fields", () => {
      const attrs = parseAttributes(
        'fields=${{user: { id: currentUser.id, name: currentUser.name }, settings: { theme: "dark", lang: "ru" }}}'
      )
      expect(attrs).toEqual({
        fields: '{ user: { id: currentUser.id, name: currentUser.name }, settings: { theme: "dark", lang: "ru" } }',
      })
    })

    it("meta-компонент с функциями в mass", () => {
      const attrs = parseAttributes(
        "mass=${{actions: { save: saveData, delete: deleteData }, utils: { format: formatText }}}"
      )
      expect(attrs).toEqual({
        mass: "{ actions: { save: saveData, delete: deleteData }, utils: { format: formatText } }",
      })
    })

    it("meta-компонент с template literals в fields", () => {
      const attrs = parseAttributes(
        'fields=${{apiUrl: `${baseUrl}/api`, wsUrl: `${baseUrl.replace("http", "ws")}/ws`}}'
      )
      expect(attrs).toEqual({
        fields: '{ apiUrl: `${baseUrl}/api`, wsUrl: `${baseUrl.replace("http", "ws")}/ws` }',
      })
    })

    it("meta-компонент с пустым fields", () => {
      const attrs = parseAttributes("fields=${{}}")
      expect(attrs).toEqual({})
    })

    it("meta-компонент с пустым mass", () => {
      const attrs = parseAttributes("mass=${{}}")
      expect(attrs).toEqual({})
    })

    it("meta-компонент с fields, core и другими атрибутами", () => {
      const attrs = parseAttributes(
        'class="container" fields=${{user: currentUser}} mass=${{state: appState}} data-testid="meta-component"'
      )
      expect(attrs).toEqual({
        fields: "{ user: currentUser }",
        mass: "{ state: appState }",
        string: {
          class: { type: "static", value: "container" },
          "data-testid": { type: "static", value: "meta-component" },
        },
      })
    })
  })
})
