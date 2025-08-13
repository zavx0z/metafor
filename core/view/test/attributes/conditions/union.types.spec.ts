import { describe, it, expect } from "bun:test"
import { View } from "../../../index.ts"
import { Context } from "../../../../context/index.ts"

describe.each(["корневой", "вложенный"])("%s", (domLevel) => {
  describe.each(["в массиве", "не в массиве"])("%s", (inArray) => {
    describe.each(["в условии", "не в условии"])("%s", (condition) => {
      describe.each(["одиночный", "список"])("%s", (type) => {
        const params = `${domLevel} > ${inArray} > ${condition} > ${type}`
        switch (params) {
          case "корневой > в массиве > в условии > одиночный":
            {
              const { context, schema } = new Context((t) => ({}))
              const core = {} as const
              const view = new View<typeof schema, typeof core>({ render: ({ html, core, context, state }) => html`` })
              describe.todo("", () => {
                it.todo("парсер", () => {})
                it.todo("рендер", () => {})
              })
            }
            break
          case "корневой > в массиве > в условии > список":
            {
              const { context, schema } = new Context((t) => ({}))
              const core = {} as const
              const view = new View<typeof schema, typeof core>({ render: ({ html, core, context, state }) => html`` })
              describe.todo("", () => {
                it.todo("парсер", () => {})
                it.todo("рендер", () => {})
              })
            }
            break
          case "корневой > в массиве > не в условии > одиночный":
            {
              const { context, schema } = new Context((t) => ({}))
              const core = {} as const
              const view = new View<typeof schema, typeof core>({ render: ({ html, core, context, state }) => html`` })
              describe.todo("", () => {
                it.todo("парсер", () => {})
                it.todo("рендер", () => {})
              })
            }
            break
          case "корневой > в массиве > не в условии > список":
            {
              const { context, schema } = new Context((t) => ({}))
              const core = {} as const
              const view = new View<typeof schema, typeof core>({ render: ({ html, core, context, state }) => html`` })
              describe.todo("", () => {
                it.todo("парсер", () => {})
                it.todo("рендер", () => {})
              })
            }
            break
          case "корневой > не в массиве > в условии > одиночный":
            {
              const { context, schema } = new Context((t) => ({}))
              const core = {} as const
              const view = new View<typeof schema, typeof core>({ render: ({ html, core, context, state }) => html`` })
              describe.todo("", () => {
                it.todo("парсер", () => {})
                it.todo("рендер", () => {})
              })
            }
            break
          case "корневой > не в массиве > в условии > список":
            {
              const { context, schema } = new Context((t) => ({}))
              const core = {} as const
              const view = new View<typeof schema, typeof core>({ render: ({ html, core, context, state }) => html`` })
              describe.todo("", () => {
                it.todo("парсер", () => {})
                it.todo("рендер", () => {})
              })
            }
            break
          case "корневой > не в массиве > не в условии > одиночный":
            {
              const { context, schema } = new Context((t) => ({}))
              const core = {} as const
              const view = new View<typeof schema, typeof core>({ render: ({ html, core, context, state }) => html`` })
              describe.todo("", () => {
                it.todo("парсер", () => {})
                it.todo("рендер", () => {})
              })
            }
            break
          case "корневой > не в массиве > не в условии > список":
            {
              const { context, schema } = new Context((t) => ({}))
              const core = {} as const
              const view = new View<typeof schema, typeof core>({ render: ({ html, core, context, state }) => html`` })
              describe.todo("", () => {
                it.todo("парсер", () => {})
                it.todo("рендер", () => {})
              })
            }
            break
          case "вложенный > в массиве > в условии > одиночный":
            {
              const { context, schema } = new Context((t) => ({}))
              const core = {} as const
              const view = new View<typeof schema, typeof core>({ render: ({ html, core, context, state }) => html`` })
              describe.todo("", () => {
                it.todo("парсер", () => {})
                it.todo("рендер", () => {})
              })
            }
            break
          case "вложенный > в массиве > в условии > список":
            {
              const { context, schema } = new Context((t) => ({}))
              const core = {} as const
              const view = new View<typeof schema, typeof core>({ render: ({ html, core, context, state }) => html`` })
              describe.todo("", () => {
                it.todo("парсер", () => {})
                it.todo("рендер", () => {})
              })
            }
            break
          case "вложенный > в массиве > не в условии > одиночный":
            {
              const { context, schema } = new Context((t) => ({}))
              const core = {} as const
              const view = new View<typeof schema, typeof core>({ render: ({ html, core, context, state }) => html`` })
              describe.todo("", () => {
                it.todo("парсер", () => {})
                it.todo("рендер", () => {})
              })
            }
            break
          case "вложенный > в массиве > не в условии > список":
            {
              const { context, schema } = new Context((t) => ({}))
              const core = {} as const
              const view = new View<typeof schema, typeof core>({ render: ({ html, core, context, state }) => html`` })
              describe.todo("", () => {
                it.todo("парсер", () => {})
                it.todo("рендер", () => {})
              })
            }
            break
          case "вложенный > не в массиве > в условии > одиночный":
            {
              const { context, schema } = new Context((t) => ({}))
              const core = {} as const
              const view = new View<typeof schema, typeof core>({ render: ({ html, core, context, state }) => html`` })
              describe.todo("", () => {
                it.todo("парсер", () => {})
                it.todo("рендер", () => {})
              })
            }
            break
          case "вложенный > не в массиве > в условии > список":
            {
              const { context, schema } = new Context((t) => ({}))
              const core = {} as const
              const view = new View<typeof schema, typeof core>({ render: ({ html, core, context, state }) => html`` })
              describe.todo("", () => {
                it.todo("парсер", () => {})
                it.todo("рендер", () => {})
              })
            }
            break
          case "вложенный > не в массиве > не в условии > одиночный":
            {
              const { context, schema } = new Context((t) => ({}))
              const core = {} as const
              const view = new View<typeof schema, typeof core>({ render: ({ html, core, context, state }) => html`` })
              describe.todo("", () => {
                it.todo("парсер", () => {})
                it.todo("рендер", () => {})
              })
            }
            break
          case "вложенный > не в массиве > не в условии > список":
            {
              const { context, schema } = new Context((t) => ({}))
              const core = {} as const
              const view = new View<typeof schema, typeof core>({ render: ({ html, core, context, state }) => html`` })
              describe.todo("", () => {
                it.todo("парсер", () => {})
                it.todo("рендер", () => {})
              })
            }
            break
          default:
            console.log("отсутствует", params)
        }
      })
    })
  })
})
