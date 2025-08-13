import { describe, it, expect, afterAll } from "bun:test"
import { join } from "node:path"
import { mkdir, readdir } from "node:fs/promises"
import { diffChars } from "diff"

const CONF = {
  on: true,
  domain: "attributes",
  type: "conditions",
  mode: "check" as "create" | "check",
  rootDir: join(import.meta.dir, "../../../"),
}

const dirTests = join(CONF.rootDir, "core", "view", "test", CONF.domain, CONF.type)

if (!(await Bun.file(dirTests).exists())) {
  await mkdir(dirTests, { recursive: true })
} else {
  console.log(dirTests, "существует")
}
const filesNeedToBeCreated = new Map<string, string>()
const allFiles = new Map<string, string>()
if (CONF.mode === "check") {
  for (const file of await readdir(dirTests)) {
    const text = await Bun.file(join(dirTests, file)).text()
    const extracted = text.match(/describe\.todo\("(.*)"/)
    if (extracted) {
      allFiles.set(extracted[1]!, file)
    }
  }
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
          const pathString =
            path
              .filter((x): x is string => typeof x === "string")
              .reverse()
              .join(".") + ".spec.ts"

          switch (CONF.mode) {
            case "create":
              if (!(await Bun.file(join(dirTests, pathString)).exists())) {
                console.log(pathString, "отсутствует")
                const modulePath = join(dirTests, pathString)

                // Вычисляем глубину вложенности от modulePath до корня
                const depth = modulePath.split("/").length - CONF.rootDir.split("/").length - 1
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
              break
            case "check":
              const size = Bun.file(join(dirTests, pathString)).size
              expect(title).toBeDefined()
              if (!size) {
                filesNeedToBeCreated.set(title, pathString)
              } else {
                allFiles.delete(title)
              }
              break
          }
        })
      })
    })
  })
})

afterAll(() => {
  if (CONF.mode === "check") {
    if (filesNeedToBeCreated.size) {
      console.log("-----------создать---------------------")
      console.table(Array.from(filesNeedToBeCreated.entries()))
    }
    if (allFiles.size) {
      console.log("-----------переименовать или удалить---------------------")
      console.table(Array.from(allFiles.entries()))
    }
    const comparedDiff = new Map<string, string>()
    for (const [title, pathString] of filesNeedToBeCreated) {
      if (allFiles.has(title)) {
        comparedDiff.set(title, pathString)
      }
    }

    // ближайшие совпадения по именам (только 1 лучший кандидат)
    const missing = Array.from(filesNeedToBeCreated.entries()).filter(([t]) => !allFiles.has(t))
    const existing = Array.from(allFiles.entries())

    const levenshtein = (a: string, b: string) => {
      const s = a.toLowerCase()
      const t = b.toLowerCase()
      const m = s.length
      const n = t.length
      if (m === 0) return n
      if (n === 0) return m
      const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0))
      for (let i = 0; i <= m; i++) dp[i]![0] = i
      for (let j = 0; j <= n; j++) dp[0]![j] = j
      for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
          const cost = s.charCodeAt(i - 1) === t.charCodeAt(j - 1) ? 0 : 1
          dp[i]![j] = Math.min(dp[i - 1]![j]! + 1, dp[i]![j - 1]! + 1, dp[i - 1]![j - 1]! + cost)
        }
      }
      return dp[m]![n]!
    }
    const similarity = (a: string, b: string) => {
      const maxLen = Math.max(a.length, b.length)
      if (!maxLen) return 1
      return 1 - levenshtein(a, b) / maxLen
    }

    const color = {
      red: (s: string) => `\x1b[31m${s}\x1b[0m`,
      green: (s: string) => `\x1b[32m${s}\x1b[0m`,
    }

    if (missing.length && existing.length) {
      const rows: Array<{ "старый путь": string; "новый путь": string }> = []
      for (const [, expectedPath] of missing) {
        let best = { file: "", score: -1 }
        for (const [, file] of existing) {
          const score = similarity(expectedPath, file)
          if (score > best.score) best = { file, score }
        }
        if (!best.file) continue

        const pathParts = diffChars(best.file, expectedPath)
        const oldPathColored = pathParts.map((p) => (p.removed ? color.red(p.value) : !p.added ? p.value : "")).join("")
        const newPathColored = pathParts
          .map((p) => (p.added ? color.green(p.value) : !p.removed ? p.value : ""))
          .join("")

        rows.push({ "старый путь": oldPathColored, "новый путь": newPathColored })
      }
      if (rows.length) {
        console.log("-----------возможные переименования (пути)---------------------")
        console.table(rows)
      }
    }
  }
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
