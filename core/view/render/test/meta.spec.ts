import { describe, expect, it } from "bun:test"
import { render } from "../index.ts"
import { parseTemplate } from "../../parser/index.ts"
import { View } from "../../index.ts"

describe("meta элементы", () => {
  it("передает context в meta-элемент", () => {
    const container = document.createElement("div")

    const view = new View()
    const context = {
      name: "John",
      age: 30,
      isActive: true,
    }
    const core = {
      user: {
        family: "Doe",
        settings: {
          theme: "dark",
        },
      },
    }

    const schema = parseTemplate(
      `<meta-user context="\${{name: context.name, age: context.age, family: core.user.family}}"></meta-user>`
    )

    render({
      state: "idle",
      context,
      core,
      element: container,
      update: () => ({}),
      schema,
    })

    const metaElement = container.querySelector("meta-user")
    expect(metaElement, "meta-элемент создан").toBeTruthy()
    expect((metaElement as any).context, "context передан").toEqual({
      name: "John",
      age: 30,
      family: "Doe",
    })
  })

  it("передает core в meta-элемент", () => {
    const container = document.createElement("div")
    const context = {
      name: "John",
      age: 30,
    }
    const core = {
      user: {
        family: "Doe",
        settings: {
          theme: "dark",
        },
      },
      api: {
        baseUrl: "https://api.example.com",
      },
    }

    const schema = parseTemplate(
      `<meta-user core="\${{family: core.user.family, theme: core.user.settings.theme, apiUrl: core.api.baseUrl}}"></meta-user>`
    )

    render({
      state: "idle",
      context,
      core,
      element: container,
      update: () => ({}),
      schema,
    })

    const metaElement = container.querySelector("meta-user")
    expect(metaElement, "meta-элемент создан").toBeTruthy()
    expect((metaElement as any).core, "core передан").toEqual({
      family: "Doe",
      theme: "dark",
      apiUrl: "https://api.example.com",
    })
  })

  it("передает context и core одновременно", () => {
    const container = document.createElement("div")
    const context = {
      name: "John",
      age: 30,
    }
    const core = {
      user: {
        family: "Doe",
      },
    }

    const schema = parseTemplate(
      `<meta-user 
        context="\${{name: context.name, age: context.age}}"
        core="\${{family: core.user.family}}">
      </meta-user>`
    )

    render({
      state: "idle",
      context,
      core,
      element: container,
      update: () => ({}),
      schema,
    })

    const metaElement = container.querySelector("meta-user")
    expect(metaElement, "meta-элемент создан").toBeTruthy()
    expect((metaElement as any).context, "context передан").toEqual({
      name: "John",
      age: 30,
    })
    expect((metaElement as any).core, "core передан").toEqual({
      family: "Doe",
    })
  })

  it("обрабатывает примитивные значения в объектах", () => {
    const container = document.createElement("div")
    const context = {
      name: "John",
    }
    const core = {
      user: {
        family: "Doe",
      },
    }

    const schema = parseTemplate(
      `<meta-user context="\${{name: context.name, staticString: 'Hello', staticNumber: 42, staticBoolean: true, staticNull: null}}"></meta-user>`
    )

    render({
      state: "idle",
      context,
      core,
      element: container,
      update: () => ({}),
      schema,
    })

    const metaElement = container.querySelector("meta-user")
    expect(metaElement, "meta-элемент создан").toBeTruthy()
    expect((metaElement as any).context, "примитивные значения обработаны").toEqual({
      name: "John",
      staticString: "Hello",
      staticNumber: 42,
      staticBoolean: true,
      staticNull: null,
    })
  })

  it("обрабатывает несуществующие пути как undefined", () => {
    const container = document.createElement("div")
    const context = {
      name: "John",
    }
    const core = {
      user: {
        family: "Doe",
      },
    }

    const schema = parseTemplate(`<meta-user context="\${{name: context.name, missing: 'undefined'}}"></meta-user>`)

    render({
      state: "idle",
      context,
      core,
      element: container,
      update: () => ({}),
      schema,
    })

    const metaElement = container.querySelector("meta-user")
    expect(metaElement, "meta-элемент создан").toBeTruthy()
    expect((metaElement as any).context, "несуществующие пути обработаны").toEqual({
      name: "John",
      missing: "undefined",
    })
  })
})
