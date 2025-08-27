import { describe, it, expect } from "bun:test"
import { parseAttributes } from "../../attributes.ts"

describe("стили в виде JavaScript объекта (styled components)", () => {
  describe("простые объекты стилей", () => {
    it("простой объект стилей", () => {
      const attrs = parseAttributes('<div style=${{backgroundColor: "red", color: "white"}}>')
      expect(attrs).toEqual({
        object: {
          style: '{ backgroundColor: "red", color: "white" }',
        },
      })
    })

    it("объект с числовыми значениями", () => {
      const attrs = parseAttributes("<div style=${{width: 100, height: 200, fontSize: 16}}>")
      expect(attrs).toEqual({
        object: {
          style: "{ width: 100, height: 200, fontSize: 16 }",
        },
      })
    })

    it("объект с единицами измерения", () => {
      const attrs = parseAttributes('<div style=${{width: "100px", height: "200px", margin: "10px 20px"}}>')
      expect(attrs).toEqual({
        object: {
          style: '{ width: "100px", height: "200px", margin: "10px 20px" }',
        },
      })
    })
  })

  describe("динамические объекты стилей", () => {
    it("объект с переменными", () => {
      const attrs = parseAttributes("<div style=${{backgroundColor: theme.primary, color: theme.text}}>")
      expect(attrs).toEqual({
        object: {
          style: "{ backgroundColor: theme.primary, color: theme.text }",
        },
      })
    })

    it("объект с условными стилями", () => {
      const attrs = parseAttributes('<div style=${{backgroundColor: isActive ? "green" : "red", color: "white"}}>')
      expect(attrs).toEqual({
        object: {
          style: '{ backgroundColor: isActive ? "green" : "red", color: "white" }',
        },
      })
    })

    it("объект с вычисляемыми значениями", () => {
      const attrs = parseAttributes("<div style=${{width: `${100 + 50}px`, height: `${200 * 2}px`}}>")
      expect(attrs).toEqual({
        object: {
          style: "{ width: `${100 + 50}px`, height: `${200 * 2}px` }",
        },
      })
    })
  })

  describe("сложные объекты стилей", () => {
    it("объект с вложенными свойствами", () => {
      const attrs = parseAttributes(
        '<div style=${{backgroundColor: "blue", border: { width: "2px", style: "solid", color: "black" }}}>'
      )
      expect(attrs).toEqual({
        object: {
          style: '{ backgroundColor: "blue", border: { width: "2px", style: "solid", color: "black" } }',
        },
      })
    })

    it("объект с функциями", () => {
      const attrs = parseAttributes("<div style=${{transform: `translateX(${getOffset()}px)`, opacity: getOpacity()}}>")
      expect(attrs).toEqual({
        object: {
          style: "{ transform: `translateX(${getOffset()}px)`, opacity: getOpacity() }",
        },
      })
    })

    it("объект с множественными условиями", () => {
      const attrs = parseAttributes(
        '<div style=${{backgroundColor: isActive ? "green" : isDisabled ? "gray" : "blue", color: isActive ? "white" : "black", fontSize: isLarge ? "18px" : "14px"}}>'
      )
      expect(attrs).toEqual({
        object: {
          style:
            '{ backgroundColor: isActive ? "green" : isDisabled ? "gray" : "blue", color: isActive ? "white" : "black", fontSize: isLarge ? "18px" : "14px" }',
        },
      })
    })
  })

  describe("стили с другими атрибутами", () => {
    it("стили с классом", () => {
      const attrs = parseAttributes('<div class="container" style=${{backgroundColor: "red", color: "white"}}>')
      expect(attrs).toEqual({
        object: {
          style: '{ backgroundColor: "red", color: "white" }',
        },
        string: {
          class: { type: "static", value: "container" },
        },
      })
    })

    it("стили с событиями", () => {
      const attrs = parseAttributes('<button style=${{backgroundColor: "blue"}} onclick="${(e) => handleClick(e)}">')
      expect(attrs).toEqual({
        object: {
          style: '{ backgroundColor: "blue" }',
        },
        event: {
          onclick: "(e) => handleClick(e)",
        },
      })
    })

    it("стили с булевыми атрибутами", () => {
      const attrs = parseAttributes('<button style=${{backgroundColor: "green"}} disabled=${isLoading}>')
      expect(attrs).toEqual({
        object: {
          style: '{ backgroundColor: "green" }',
        },
        boolean: {
          disabled: { type: "dynamic", value: "isLoading" },
        },
      })
    })
  })

  describe("граничные случаи", () => {
    it("пустой объект стилей", () => {
      const attrs = parseAttributes("<div style=${{}}>")
      expect(attrs).toEqual({
        object: {
          style: "{}",
        },
      })
    })

    it("объект с одним свойством", () => {
      const attrs = parseAttributes('<div style=${{color: "red"}}>')
      expect(attrs).toEqual({
        object: {
          style: '{ color: "red" }',
        },
      })
    })

    it("объект с template literals", () => {
      const attrs = parseAttributes("<div style=${{backgroundImage: `url(${imageUrl})`, color: `#${colorHex}`}}>")
      expect(attrs).toEqual({
        object: {
          style: "{ backgroundImage: `url(${imageUrl})`, color: `#${colorHex}` }",
        },
      })
    })
  })

  describe("различные элементы", () => {
    it("стили для button", () => {
      const attrs = parseAttributes('<button style=${{backgroundColor: "blue", color: "white", padding: "10px"}}>')
      expect(attrs).toEqual({
        object: {
          style: '{ backgroundColor: "blue", color: "white", padding: "10px" }',
        },
      })
    })

    it("стили для input", () => {
      const attrs = parseAttributes('<input style=${{border: "1px solid gray", borderRadius: "4px", padding: "8px"}}>')
      expect(attrs).toEqual({
        object: {
          style: '{ border: "1px solid gray", borderRadius: "4px", padding: "8px" }',
        },
      })
    })

    it("стили для img", () => {
      const attrs = parseAttributes('<img style=${{width: "100px", height: "100px", objectFit: "cover"}}>')
      expect(attrs).toEqual({
        object: {
          style: '{ width: "100px", height: "100px", objectFit: "cover" }',
        },
      })
    })

    it("стили для span", () => {
      const attrs = parseAttributes('<span style=${{fontSize: "14px", fontWeight: "bold", color: "red"}}>')
      expect(attrs).toEqual({
        object: {
          style: '{ fontSize: "14px", fontWeight: "bold", color: "red" }',
        },
      })
    })
  })

  describe("meta-компоненты с context и core", () => {
    it("meta-компонент с context", () => {
      const attrs = parseAttributes("<meta-component context=${{user: currentUser, theme: currentTheme}}>")
      expect(attrs).toEqual({
        object: {
          context: "{ user: currentUser, theme: currentTheme }",
        },
      })
    })

    it("meta-компонент с core", () => {
      const attrs = parseAttributes("<meta-component core=${{state: appState, actions: appActions}}>")
      expect(attrs).toEqual({
        object: {
          core: "{ state: appState, actions: appActions }",
        },
      })
    })

    it("meta-компонент с context и core", () => {
      const attrs = parseAttributes(
        "<meta-component context=${{user: currentUser, theme: currentTheme}} core=${{state: appState, actions: appActions}}>"
      )
      expect(attrs).toEqual({
        object: {
          context: "{ user: currentUser, theme: currentTheme }",
          core: "{ state: appState, actions: appActions }",
        },
      })
    })

    it("meta-компонент с context и core", () => {
      const attrs = parseAttributes(
        "<meta-component context=${{user: currentUser, theme: currentTheme}} core=${{state: appState, actions: appActions}}>"
      )
      expect(attrs).toEqual({
        object: {
          context: "{ user: currentUser, theme: currentTheme }",
          core: "{ state: appState, actions: appActions }",
        },
      })
    })

    it("meta-компонент с динамическим context", () => {
      const attrs = parseAttributes("<meta-component context=${{user: ${getCurrentUser()}, theme: ${getTheme()}}}>")
      expect(attrs).toEqual({
        object: {
          context: "{ user: ${getCurrentUser()}, theme: ${getTheme()} }",
        },
      })
    })

    it("meta-компонент с динамическим context без кавычек", () => {
      const attrs = parseAttributes("<meta-component context=${{user: ${getCurrentUser()}, theme: ${getTheme()}}}>")
      expect(attrs).toEqual({
        object: {
          context: "{ user: ${getCurrentUser()}, theme: ${getTheme()} }",
        },
      })
    })

    it("meta-компонент с условным context", () => {
      const attrs = parseAttributes(
        "<meta-component context=${{user: isLoggedIn ? currentUser : null, theme: isDark ? darkTheme : lightTheme}}>"
      )
      expect(attrs).toEqual({
        object: {
          context: "{ user: isLoggedIn ? currentUser : null, theme: isDark ? darkTheme : lightTheme }",
        },
      })
    })

    it("meta-компонент с условным context без кавычек", () => {
      const attrs = parseAttributes(
        "<meta-component context=${{user: isLoggedIn ? currentUser : null, theme: isDark ? darkTheme : lightTheme}}>"
      )
      expect(attrs).toEqual({
        object: {
          context: "{ user: isLoggedIn ? currentUser : null, theme: isDark ? darkTheme : lightTheme }",
        },
      })
    })

    it("meta-компонент с вложенными объектами в context", () => {
      const attrs = parseAttributes(
        '<meta-component context=${{user: { id: currentUser.id, name: currentUser.name }, settings: { theme: "dark", lang: "ru" }}}>'
      )
      expect(attrs).toEqual({
        object: {
          context: '{ user: { id: currentUser.id, name: currentUser.name }, settings: { theme: "dark", lang: "ru" } }',
        },
      })
    })

    it("meta-компонент с вложенными объектами в context без кавычек", () => {
      const attrs = parseAttributes(
        '<meta-component context=${{user: { id: currentUser.id, name: currentUser.name }, settings: { theme: "dark", lang: "ru" }}}>'
      )
      expect(attrs).toEqual({
        object: {
          context: '{ user: { id: currentUser.id, name: currentUser.name }, settings: { theme: "dark", lang: "ru" } }',
        },
      })
    })

    it("meta-компонент с функциями в core", () => {
      const attrs = parseAttributes(
        "<meta-component core=${{actions: { save: saveData, delete: deleteData }, utils: { format: formatText }}}>"
      )
      expect(attrs).toEqual({
        object: {
          core: "{ actions: { save: saveData, delete: deleteData }, utils: { format: formatText } }",
        },
      })
    })

    it("meta-компонент с функциями в core без кавычек", () => {
      const attrs = parseAttributes(
        "<meta-component core=${{actions: { save: saveData, delete: deleteData }, utils: { format: formatText }}}>"
      )
      expect(attrs).toEqual({
        object: {
          core: "{ actions: { save: saveData, delete: deleteData }, utils: { format: formatText } }",
        },
      })
    })

    it("meta-компонент с template literals в context", () => {
      const attrs = parseAttributes(
        '<meta-component context=${{apiUrl: `${baseUrl}/api`, wsUrl: `${baseUrl.replace("http", "ws")}/ws`}}>'
      )
      expect(attrs).toEqual({
        object: {
          context: '{ apiUrl: `${baseUrl}/api`, wsUrl: `${baseUrl.replace("http", "ws")}/ws` }',
        },
      })
    })

    it("meta-компонент с template literals в context без кавычек", () => {
      const attrs = parseAttributes(
        '<meta-component context=${{apiUrl: `${baseUrl}/api`, wsUrl: `${baseUrl.replace("http", "ws")}/ws`}}>'
      )
      expect(attrs).toEqual({
        object: {
          context: '{ apiUrl: `${baseUrl}/api`, wsUrl: `${baseUrl.replace("http", "ws")}/ws` }',
        },
      })
    })

    it("meta-компонент с пустым context", () => {
      const attrs = parseAttributes("<meta-component context=${{}}>")
      expect(attrs).toEqual({
        object: {
          context: "{}",
        },
      })
    })

    it("meta-компонент с пустым context без кавычек", () => {
      const attrs = parseAttributes("<meta-component context=${{}}>")
      expect(attrs).toEqual({
        object: {
          context: "{}",
        },
      })
    })

    it("meta-компонент с пустым core", () => {
      const attrs = parseAttributes("<meta-component core=${{}}>")
      expect(attrs).toEqual({
        object: {
          core: "{}",
        },
      })
    })

    it("meta-компонент с пустым core без кавычек", () => {
      const attrs = parseAttributes("<meta-component core=${{}}>")
      expect(attrs).toEqual({
        object: {
          core: "{}",
        },
      })
    })

    it("meta-компонент с context, core и другими атрибутами", () => {
      const attrs = parseAttributes(
        '<meta-component class="container" context=${{user: currentUser}} core=${{state: appState}} data-testid="meta-component">'
      )
      expect(attrs).toEqual({
        object: {
          context: "{ user: currentUser }",
          core: "{ state: appState }",
        },
        string: {
          class: { type: "static", value: "container" },
          "data-testid": { type: "static", value: "meta-component" },
        },
      })
    })

    it("meta-компонент с context, core и другими атрибутами без кавычек", () => {
      const attrs = parseAttributes(
        '<meta-component class="container" context=${{user: currentUser}} core=${{state: appState}} data-testid="meta-component">'
      )
      expect(attrs).toEqual({
        object: {
          context: "{ user: currentUser }",
          core: "{ state: appState }",
        },
        string: {
          class: { type: "static", value: "container" },
          "data-testid": { type: "static", value: "meta-component" },
        },
      })
    })
  })
})
