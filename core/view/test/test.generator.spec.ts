import { describe, it, expect } from "bun:test"
import { join } from "node:path"
import { mkdir } from "node:fs/promises"

const CONF = {
  on: true,
  domain: "attributes",
  type: "conditions",
}

const ROOT_DIR = join(import.meta.dir, "../../../")

const dirTests = join(ROOT_DIR, "core", "view", "test", CONF.domain, CONF.type)

if (!(await Bun.file(dirTests).exists())) {
  await mkdir(dirTests, { recursive: true })
} else {
  console.log(dirTests, "существует")
}

describe.each([
  { ru: "корневой", en: null },
  { ru: "вложенный", en: "nested" },
])("DOM уровень", (domLevel) => {
  describe.each([
    { ru: "в массиве", en: "in-array" },
    { ru: "не в массиве", en: null },
  ])("в массиве", (inArray) => {
    describe.each([
      { ru: "в условии", en: "in-condition" },
      { ru: "не в условии", en: null },
    ])(`в условии`, (condition) => {
      describe.each([
        { ru: "одиночный", en: "single" },
        { ru: "список", en: "list" },
      ])("значение атрибута", (type) => {
        const title = `${domLevel.ru} > ${inArray.ru} > ${condition.ru} > ${type.ru}`

        it.skipIf(!CONF.on)(title, async () => {
          const path = [domLevel.en, inArray.en, condition.en, type.en]
          const pathString = path.filter(Boolean).reverse().join(".") + ".spec.ts"
          if (!(await Bun.file(join(dirTests, pathString)).exists())) {
            console.log(pathString, "отсутствует")
            const modulePath = join(dirTests, pathString)

            // Вычисляем глубину вложенности от modulePath до корня
            const depth = modulePath.split("/").length - ROOT_DIR.split("/").length - 1
            const relativePath = "../".repeat(depth)

            await Bun.write(
              modulePath,
              template({
                label: title,
                relativeViewPath: `${relativePath}view/index.ts`,
                relativeContextPath: `${relativePath}context/index.ts`,
              })
            )
            expect(await Bun.file(modulePath).exists()).toBeTrue()
          } else {
            const size = Bun.file(join(dirTests, pathString)).size
            expect(size).toBeGreaterThan(0)
          }
        })
      })
    })
  })
})

const template = ({
  label,
  relativeViewPath,
  relativeContextPath,
}: {
  label: string
  relativeViewPath: string
  relativeContextPath: string
}) => `import { describe, it, expect } from "bun:test"
import { View } from "${relativeViewPath}"
import { Context } from "${relativeContextPath}"
const html = String.raw

describe.todo("${label}", () => {
  const container = document.createElement("div")

  const { context, schema, update } = new Context((t) => ({
    string: t.string.required(""),
    number: t.number.required(0),
    boolean: t.boolean.required(false),
    numberArray: t.array.required([0, 1, 2]),
    stringArray: t.array.required(["a", "b", "c"]),
    numberEnum: t.enum(0, 1, 2).required(0),
    stringEnum: t.enum("a", "b", "c").required("a"),
  }))
  const core = {} as const
  const state = "initial" as const

  const view = new View<typeof schema, typeof core, typeof state>({
    render: ({ html, core, context, state }) => html\`
      <div></div>
    \`,
  })

  it.todo("парсер", () => {
    const testedSchema = view.schema

    expect(testedSchema).toBe([])
  })

  it.todo("рендер", () => {
    view.render({ container, core, context, state })

    expect(container.innerHTML).toMatchStringHTML(html\`
      <div></div>
    \`)
  })

  it.todo("обновление", () => {
    update({})

    expect(container.innerHTML).toMatchStringHTML(html\`
      <div></div>
    \`)
  })


  it.todo("перемещение", () => {


    expect(container.innerHTML).toMatchStringHTML(html\`

    \`)  
  })
  
  it.todo("уничтожение", () => {


    expect(container.innerHTML).toMatchStringHTML(html\`

    \`)
  })
})

`
