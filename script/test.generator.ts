import { join, dirname, relative } from "node:path"
import { mkdir, readdir, rename, unlink } from "node:fs/promises"
import { createReadStream, createWriteStream } from "node:fs"
import { diffChars } from "diff"
import { afterAll } from "bun:test"

export type GenerateParams = {
  label: string
  generateRelativePath: (path: string) => string
}

export type GeneratorMode = "create" | "check"

export interface GeneratorConfig {
  on: boolean
  mode: GeneratorMode
  rootDir: string
  domain: string
  type: string
}

interface CaseInput {
  title: string
  path: Array<string | null>
}

export const createGenerator = async (conf: GeneratorConfig, registerFinalize?: (fn: () => Promise<void>) => void) => {
  const dirTests = join(conf.rootDir, "core", "view", "test", conf.domain, conf.type)
  if (!(await Bun.file(dirTests).exists())) {
    await mkdir(dirTests, { recursive: true })
  }

  const filesNeedToBeCreated = new Map<string, string>()
  const allFiles = new Map<string, string>()
  const expectedPaths = new Set<string>()
  const expectedPathToTitle = new Map<string, string>()
  const expectedTitles = new Set<string>()

  // helpers first to avoid use-before-declare
  const readDescribeTitle = async (filePath: string): Promise<string | null> => {
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
        if (buffer.length > 256 * 1024) buffer = buffer.slice(-1024)
      })
      stream.on("close", () => {
        if (!done) resolve(null)
      })
      stream.on("error", () => resolve(null))
    })
  }

  const replaceDescribeTitle = async (filePath: string, newTitle: string): Promise<boolean> => {
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

  if (conf.mode === "check") {
    for (const file of await readdir(dirTests)) {
      if (!file.endsWith(".spec.ts")) continue
      const abs = join(dirTests, file)
      const title = await readDescribeTitle(abs)
      if (title) allFiles.set(title, file)
    }
  }

  const add = async ({ title, path }: CaseInput) => {
    const pathString =
      path
        .filter((x): x is string => typeof x === "string")
        .reverse()
        .join(".") + ".spec.ts"
    expectedPaths.add(pathString)
    expectedPathToTitle.set(pathString, title)
    expectedTitles.add(title)

    const size = Bun.file(join(dirTests, pathString)).size
    switch (conf.mode) {
      case "create": {
        if (!size) filesNeedToBeCreated.set(title, pathString)
        else allFiles.delete(title)
        break
      }
      case "check": {
        if (!size) filesNeedToBeCreated.set(title, pathString)
        else allFiles.delete(title)
        break
      }
    }
  }

  const finalize = async () => {
    if (conf.mode === "check") {
      if (filesNeedToBeCreated.size) {
        console.log("-----------создать---------------------")
        console.table(Array.from(filesNeedToBeCreated.entries()))
      }
      if (allFiles.size) {
        console.log("-----------переименовать или удалить---------------------")
        console.table(Array.from(allFiles.entries()))
      }

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
          for (const [et, file] of existing) {
            const score = similarity(expectedPath, file)
            if (score > best.score) best = { file, score }
          }
          if (!best.file) continue
          const pathParts = diffChars(best.file, expectedPath)
          const oldPathColored = pathParts
            .map((p) => (p.removed ? color.red(p.value) : !p.added ? p.value : ""))
            .join("")
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
      return
    }

    // create mode
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

    // rename only candidates outside expectedPaths
    const candidateFiles = existingFiles.filter((f) => !expectedPaths.has(f))
    const used = new Set<string>()
    for (const [, expectedPath] of missing) {
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

      const newTitle = expectedPathToTitle.get(expectedPath)
      if (newTitle) await replaceDescribeTitle(to, newTitle)
    }

    // create missing
    for (const [title, expectedPath] of filesNeedToBeCreated) {
      const modulePath = join(dirTests, expectedPath)
      if (await Bun.file(modulePath).exists()) continue
      const depth = modulePath.split("/").length - conf.rootDir.split("/").length - 1
      const relativePath = "../".repeat(depth)
      await mkdir(join(modulePath, ".."), { recursive: true })
      await Bun.write(
        Bun.file(modulePath),
        template({
          label: title,
          relativeViewPath: `${relativePath}view/index.ts`,
          relativeContextPath: `${relativePath}context/index.ts`,
        })
      )
    }

    // sync titles even if path unchanged
    for (const [expectedPath, newTitle] of expectedPathToTitle.entries()) {
      const modulePath = join(dirTests, expectedPath)
      if (!(await Bun.file(modulePath).exists())) continue
      const currentTitle = await readDescribeTitle(modulePath)
      if (currentTitle && currentTitle !== newTitle) {
        await replaceDescribeTitle(modulePath, newTitle)
      }
    }

    // delete any files not in expectedPaths
    const actual = await readdir(dirTests)
    for (const file of actual) {
      if (!file.endsWith(".spec.ts")) continue
      if (!expectedPaths.has(file)) await unlink(join(dirTests, file))
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
})
`

  return {
    on: conf.on,
    add,
    finalize,
  }
}

// ---------------- High-level generator API (used by tests) ----------------
type ParamItem = { label: string; path: string | null }
type TemplateHelpers = { label: string; generateRelativePath: (p: string) => string }
type GenerateReturn = {
  mode: GeneratorMode
  path: string // relative to core/view/test, e.g. "./attributes/conditions"
  params: ParamItem[]
  template: (helpers: TemplateHelpers) => string
  base?: string // base directory relative to core/view/test (e.g. "./attributes")
}

export type GenerateConfig = GenerateReturn

type Aggregator = ReturnType<typeof createAggregator>
const aggregators = new Map<string, Aggregator>()

const projectRoot = () => join(import.meta.dir, "../")

const readTitle = async (filePath: string): Promise<string | null> => {
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
      if (buffer.length > 256 * 1024) buffer = buffer.slice(-1024)
    })
    stream.on("close", () => {
      if (!done) resolve(null)
    })
    stream.on("error", () => resolve(null))
  })
}

const replaceTitle = async (filePath: string, newTitle: string): Promise<boolean> => {
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

function createAggregator(dirTests: string, mode: GeneratorMode) {
  const filesNeedToBeCreated = new Map<string, string>()
  const allFiles = new Map<string, string>()
  const expectedPaths = new Set<string>()
  const expectedPathToTitle = new Map<string, string>()
  const expectedPathToTemplate = new Map<string, (helpers: TemplateHelpers) => string>()
  let initialized = false

  const ensureInit = async () => {
    if (initialized) return
    initialized = true
    if (!(await Bun.file(dirTests).exists())) {
      await mkdir(dirTests, { recursive: true })
    }
    if (mode === "check") {
      for (const file of await readdir(dirTests)) {
        if (!file.endsWith(".spec.ts")) continue
        const abs = join(dirTests, file)
        const title = await readTitle(abs)
        if (title) allFiles.set(title, file)
      }
    }
    afterAll(async () => {
      await finalize()
    })
  }

  const add = async (title: string, expectedPath: string, template: (helpers: TemplateHelpers) => string) => {
    await ensureInit()
    expectedPaths.add(expectedPath)
    expectedPathToTitle.set(expectedPath, title)
    expectedPathToTemplate.set(expectedPath, template)
    const size = Bun.file(join(dirTests, expectedPath)).size
    if (!size) filesNeedToBeCreated.set(title, expectedPath)
    else allFiles.delete(title)
  }

  const finalize = async () => {
    if (mode === "check") {
      if (filesNeedToBeCreated.size) {
        console.log("-----------создать---------------------")
        console.table(Array.from(filesNeedToBeCreated.entries()))
      }
      if (allFiles.size) {
        console.log("-----------переименовать или удалить---------------------")
        console.table(Array.from(allFiles.entries()))
      }

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
          const oldPathColored = pathParts
            .map((p) => (p.removed ? color.red(p.value) : !p.added ? p.value : ""))
            .join("")
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
      return
    }

    // create mode
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

    const candidateFiles = existingFiles.filter((f) => !expectedPaths.has(f))
    const used = new Set<string>()
    for (const [, expectedPath] of missing) {
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

      const newTitle = expectedPathToTitle.get(expectedPath)
      if (newTitle) await replaceTitle(to, newTitle)
    }

    // create missing
    for (const [title, expectedPath] of filesNeedToBeCreated) {
      const modulePath = join(dirTests, expectedPath)
      if (await Bun.file(modulePath).exists()) continue
      await mkdir(dirname(modulePath), { recursive: true })
      const tpl = expectedPathToTemplate.get(expectedPath)!
      const helpers: TemplateHelpers = {
        label: expectedPathToTitle.get(expectedPath)!,
        generateRelativePath: (p: string) => {
          const norm = p
            .replace(/^\.\/?/, "")
            .replace(/\/+/g, "/")
            .replace(/\/$/, "")
          // p приходит как "core/view" или "core/context" — от корня проекта
          const target = join(projectRoot(), norm, "index.ts")
          const rel = relative(dirname(modulePath), target)
          return rel.split("\\").join("/").replace(/\.ts$/, "")
        },
      }
      await Bun.write(Bun.file(modulePath), tpl(helpers))
      // sync title to be safe
      await replaceTitle(modulePath, helpers.label)
    }

    // sync titles even if path unchanged
    for (const [expectedPath, newTitle] of expectedPathToTitle.entries()) {
      const modulePath = join(dirTests, expectedPath)
      if (!(await Bun.file(modulePath).exists())) continue
      const currentTitle = await readTitle(modulePath)
      if (currentTitle && currentTitle !== newTitle) {
        await replaceTitle(modulePath, newTitle)
      }
    }

    // delete any files not in expectedPaths
    const actual = await readdir(dirTests)
    for (const file of actual) {
      if (!file.endsWith(".spec.ts")) continue
      if (!expectedPaths.has(file)) await unlink(join(dirTests, file))
    }
  }

  return { add, finalize }
}

export const generate = async (configOrBuilder: GenerateConfig | ((helpers: TemplateHelpers) => GenerateConfig)) => {
  const dummy: TemplateHelpers = { label: "", generateRelativePath: () => "" }
  const cfg = typeof configOrBuilder === "function" ? configOrBuilder(dummy) : configOrBuilder
  const testsRoot = join(projectRoot(), "core", "view", "test")
  const normalize = (p?: string) => (p ? p.replace(/\\/g, "/").replace(/\/+/g, "/") : "")

  const callerDir = (() => {
    const stack = new Error().stack || ""
    const lines = stack.split("\n").slice(1)
    for (const line of lines) {
      const m = line.match(/\(?((?:file:\/\/)?\/[^:]+\.spec\.ts)(?::\d+:\d+)?\)?/)
      if (m && m[1]) {
        const url = m[1]
        try {
          const path = url.startsWith("file:") ? new URL(url).pathname : url
          return dirname(path)
        } catch {}
      }
    }
    return testsRoot
  })()

  const rawPath = normalize(cfg.path)
  let dirTests: string
  if (rawPath.startsWith("/")) {
    dirTests = rawPath
  } else if (rawPath.startsWith("./") || rawPath.startsWith("../") || rawPath.length === 0) {
    dirTests = join(callerDir, rawPath)
  } else {
    dirTests = join(testsRoot, rawPath)
  }
  let agg = aggregators.get(dirTests)
  if (!agg) {
    agg = createAggregator(dirTests, cfg.mode)
    aggregators.set(dirTests, agg)
  }
  const expectedPath =
    cfg.params
      .map((p) => p.path)
      .filter((x): x is string => typeof x === "string")
      .reverse()
      .join(".") + ".spec.ts"
  const title = cfg.params.map((p) => p.label).join(" > ")
  await agg.add(title, expectedPath, cfg.template)
}
