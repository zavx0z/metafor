import { describe, it, expect, afterAll } from "bun:test"
import { join } from "node:path"
import { mkdir, readdir, rename, unlink } from "node:fs/promises"
import { createReadStream, createWriteStream } from "node:fs"
import { diffChars } from "diff"

const CONF = {
  on: true,
  domain: "attributes",
  type: "conditions",
  mode: "create" as "create" | "check",
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
const expectedPaths = new Set<string>()
const expectedPathToTitle = new Map<string, string>()
const expectedTitles = new Set<string>()

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
        describe.each([
          { ru: "еще один", en: "another" },
          { ru: "еще один2", en: "another2" },
        ])("новый уровень", (another) => {
          const title = `${domLevel.ru} > ${inArray.ru} > ${condition.ru} > ${type.ru} > ${another.ru}`

          it.skipIf(!CONF.on)(title, async () => {
            const path = [domLevel.en, inArray.en, condition.en, type.en, another.en]
            const pathString =
              path
                .filter((x): x is string => typeof x === "string")
                .reverse()
                .join(".") + ".spec.ts"
            expectedPaths.add(pathString)
            expectedPathToTitle.set(pathString, title)
            expectedTitles.add(title)

            switch (CONF.mode) {
              case "create":
                // В режиме create перенос/создание выполняется в afterAll.
                // Здесь только собираем ожидаемые/найденные для расчёта соответствий.
                {
                  const size = Bun.file(join(dirTests, pathString)).size
                  if (!size) {
                    filesNeedToBeCreated.set(title, pathString)
                  } else {
                    allFiles.delete(title)
                  }
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
})

afterAll(async () => {
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
  } else if (CONF.mode === "create") {
    // Рассчитать соответствия и текущее состояние файловой системы
    const missing = Array.from(filesNeedToBeCreated.entries())
    const existingFiles = (await readdir(dirTests)).filter((f) => f.endsWith(".spec.ts"))

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

    // Переименование существующих файлов по лучшему совпадению
    // Ренеймим только файлы, которых нет среди ожидаемых путей (устаревшие/не на месте)
    const candidateFiles = existingFiles.filter((f) => !expectedPaths.has(f))
    const used = new Set<string>()
    for (const [, expectedPath] of missing) {
      // если целевой уже существует — пропускаем
      if (await Bun.file(join(dirTests, expectedPath)).exists()) continue

      let best = { file: "", score: -1 }
      for (const file of candidateFiles) {
        if (used.has(file)) continue
        const score = similarity(expectedPath, file)
        if (score > best.score) best = { file, score }
      }
      if (!best.file) continue
      used.add(best.file)
      const from = join(dirTests, best.file)
      const to = join(dirTests, expectedPath)
      try {
        await mkdir(join(to, ".."), { recursive: true })
      } catch {}
      await rename(from, to)

      // Обновление label внутри файла на новый title (потоково, без чтения всего файла)
      const newTitle = expectedPathToTitle.get(expectedPath)
      if (newTitle) {
        await replaceDescribeTodoTitle(to, newTitle)
      }
    }

    // Создание недостающих файлов, оставшихся не покрытыми сопоставлением
    for (const [title, expectedPath] of filesNeedToBeCreated) {
      const modulePath = join(dirTests, expectedPath)
      if (await Bun.file(modulePath).exists()) continue

      const depth = modulePath.split("/").length - CONF.rootDir.split("/").length - 1
      const relativePath = "../".repeat(depth)
      await mkdir(join(modulePath, ".."), { recursive: true })
      await Bun.write(
        modulePath,
        template({
          label: title,
          relativeViewPath: `${relativePath}view/index.ts`,
          relativeContextPath: `${relativePath}context/index.ts`,
        })
      )
    }

    // Синхронизация label по title даже если путь не менялся (изменился только ru)
    for (const [expectedPath, newTitle] of expectedPathToTitle.entries()) {
      const modulePath = join(dirTests, expectedPath)
      if (!(await Bun.file(modulePath).exists())) continue
      const currentTitle = await readDescribeTodoTitle(modulePath)
      if (currentTitle && currentTitle !== newTitle) {
        await replaceDescribeTodoTitle(modulePath, newTitle)
      }
    }

    // Удаление устаревших файлов: любые .spec.ts, которых нет среди ожиданий
    const actual = await readdir(dirTests)
    for (const file of actual) {
      if (!file.endsWith(".spec.ts")) continue
      if (!expectedPaths.has(file)) {
        await unlink(join(dirTests, file))
      }
    }
  }
})

// Потоковая замена первого describe.todo("...") на новый title
const replaceDescribeTodoTitle = async (filePath: string, newTitle: string): Promise<boolean> => {
  try {
    const src = createReadStream(filePath, { encoding: "utf8" })
    const tmp = `${filePath}.tmp`
    const dst = createWriteStream(tmp, { encoding: "utf8" })
    let buffer = ""
    let replaced = false
    await new Promise<void>((resolve, reject) => {
      src.on("data", (chunk) => {
        if (replaced) {
          dst.write(chunk)
          return
        }
        buffer += chunk
        const tokens = ['describe.todo("', 'describe.skip("', 'describe.only("', 'describe("']
        let token = ""
        let idx = -1
        for (const t of tokens) {
          const i = buffer.indexOf(t)
          if (i !== -1 && (idx === -1 || i < idx)) {
            idx = i
            token = t
          }
        }
        if (idx === -1) {
          const keepTail = Math.max(buffer.length - 100, 0)
          if (keepTail > 0) {
            dst.write(buffer.slice(0, keepTail))
            buffer = buffer.slice(keepTail)
          }
          return
        }
        const start = idx + token.length
        const end = buffer.indexOf('"', start)
        if (end === -1) {
          const beforeStart = buffer.slice(0, idx)
          dst.write(beforeStart)
          buffer = buffer.slice(idx)
          return
        }
        const before = buffer.slice(0, start)
        const after = buffer.slice(end)
        dst.write(before)
        dst.write(newTitle)
        dst.write(after)
        replaced = true
        buffer = ""
      })
      src.on("end", () => {
        if (buffer) dst.write(buffer)
        dst.end()
      })
      src.on("error", reject)
      dst.on("error", reject)
      dst.on("close", () => resolve())
    })
    if (replaced) {
      await rename(tmp, filePath)
      return true
    } else {
      try {
        await unlink(tmp)
      } catch {}
      return false
    }
  } catch {
    return false
  }
}

// Потоковое извлечение первого describe("...")/describe.todo("...")/describe.skip("...")/describe.only("...") без чтения всего файла
const readDescribeTodoTitle = async (filePath: string): Promise<string | null> => {
  return await new Promise<string | null>((resolve) => {
    const stream = createReadStream(filePath, { encoding: "utf8", highWaterMark: 64 * 1024 })
    let buffer = ""
    let done = false
    const tokens = ['describe.todo("', 'describe.skip("', 'describe.only("', 'describe("']

    stream.on("data", (chunk) => {
      if (done) return
      buffer += chunk
      let token = ""
      let idx = -1
      for (const t of tokens) {
        const i = buffer.indexOf(t)
        if (i !== -1 && (idx === -1 || i < idx)) {
          idx = i
          token = t
        }
      }
      if (idx !== -1) {
        const start = idx + token.length
        const end = buffer.indexOf('"', start)
        if (end !== -1) {
          done = true
          stream.destroy()
          resolve(buffer.slice(start, end))
          return
        }
      }
      // ограничим буфер, чтобы не расти безмерно
      if (buffer.length > 256 * 1024) buffer = buffer.slice(-1024)
    })
    stream.on("close", () => {
      if (!done) resolve(null)
    })
    stream.on("error", () => resolve(null))
  })
}
if (CONF.mode === "check") {
  for (const file of await readdir(dirTests)) {
    if (!file.endsWith(".spec.ts")) continue
    const abs = join(dirTests, file)
    const title = await readDescribeTodoTitle(abs)
    if (title) allFiles.set(title, file)
  }
}
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
