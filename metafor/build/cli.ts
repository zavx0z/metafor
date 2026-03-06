#!/usr/bin/env bun
import { watch } from "fs"
import { dirname, basename, join, isAbsolute } from "path"
import { pathToFileURL } from "url"
import { convertMetaToMonadJson } from "./monadJson"
import "@metafor/meta"

// Обработка аргументов командной строки
const args = process.argv.slice(2)
const isWatchMode = args.includes("--watch")

// Извлекаем аргумент --file или используем позиционный аргумент
let inputFile = "meta.ts"
let outputFile: string | undefined

const fileArgIndex = args.indexOf("--file")
if (fileArgIndex !== -1 && args[fileArgIndex + 1]) {
  inputFile = args[fileArgIndex + 1]!
} else {
  const positionalArg = args.find(arg => !arg.startsWith("--"))
  if (positionalArg) {
    inputFile = positionalArg
  }
}

// Извлекаем аргумент --out для указания выходного файла
const outArgIndex = args.indexOf("--out")
if (outArgIndex !== -1 && args[outArgIndex + 1]) {
  outputFile = args[outArgIndex + 1]!
}

// Флаг для debounce в режиме watch
let isBuilding = false

// Хэш последнего собранного файла для обнаружения реальных изменений
let lastContentHash: string | null = null

// Анимация статуса
let animationFrame = 0
const animationFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]
const statusEmojis = ["💤", "🔄", "❌", "✅"]

/**
 * Вычисляет простой хэш строки
 */
function hashContent(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32bit integer
  }
  return hash.toString(36)
}

/**
 * Анимационный индикатор для watch режима
 */
class StatusRunner {
  private interval: NodeJS.Timeout | null = null
  public status: string = "💤"
  private message: string = "Ожидание"
  public errorMessage: string | null = null
  private lastErrorMessage: string | null = null

  start(message?: string) {
    this.message = message ?? "Ожидание"
    this.status = statusEmojis[0]!

    // Запускаем анимацию
    this.interval = setInterval(() => {
      this.render()
    }, 80)
  }

  update(status: number, message?: string) {
    this.status = statusEmojis[status]!
    this.message = message ?? "Ожидание"
  }

  render() {
    // Очищаем строку статуса
    process.stdout.write(`\r\x1b[K`)
    // Если была ошибка, очищаем строку с ней
    if (this.lastErrorMessage && !this.errorMessage) {
      process.stdout.write(`\n\x1b[K\x1b[1A`)
    }
    const frame = animationFrames[animationFrame++ % animationFrames.length]
    process.stdout.write(`${this.status} ${frame} ${this.message}`)
    if (this.errorMessage) {
      // Выводим ошибку на следующей строке и возвращаем курсор на строку статуса
      process.stdout.write(`\r\n${this.errorMessage}\x1b[1A`)
    }
    this.lastErrorMessage = this.errorMessage
  }

  clearError() {
    // Только сбрасываем сообщение об ошибке, строка очистится в render()
    this.errorMessage = null
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval)
      this.interval = null
    }
    process.stdout.write("\r\x1b[K")
    if (this.lastErrorMessage || this.errorMessage) {
      process.stdout.write(`\n\x1b[K\x1b[1A`)
    }
  }
}

const runner = new StatusRunner()

/**
 * Извлекает понятное сообщение об ошибке из вывода Bun
 * Убирает стек трейс, оставляя только суть ошибки
 */
function extractErrorMessage(errorText: string): string {
  const lines = errorText.split("\n")
  const errorLines: string[] = []

  for (const line of lines) {
    const trimmedLine = line.trim()

    // Пропускаем строки стека (начинаются с "at ")
    if (trimmedLine.startsWith("at ")) continue
    // Пропускаем строки с путями к файлам и номерами строк в скобках
    if (/^\([^)]+\):\d+:\d+\)$/.test(trimmedLine)) continue
    // Пропускаем строки вида "Bun v1.3.10 (macOS x64)"
    if (trimmedLine.startsWith("Bun v")) continue
    // Пропускаем строки с номерами строк кода (вида "2084 |     result.desc...")
    if (/^\d+\s*\|/.test(trimmedLine)) continue
    // Пропускаем строки только с "^"
    if (trimmedLine === "^") continue
    // Пропускаем строки "error:" в начале
    if (trimmedLine.startsWith("error:")) continue
    // Пропускаем пустые строки
    if (trimmedLine === "" && errorLines.length > 0 && errorLines[errorLines.length - 1] === "") continue

    errorLines.push(line)
  }

  // Убираем trailing пустые строки
  while (errorLines.length > 0 && errorLines[errorLines.length - 1]?.trim() === "") {
    errorLines.pop()
  }

  const message = errorLines.join("\n")

  // Если сообщение пустое, возвращаем оригинал
  return message || errorText
}

/**
 * Выполняет сборку meta-файла
 * @returns true если сборка успешна, или сообщение об ошибке
 */
async function build(): Promise<boolean | string> {
  if (isBuilding) {
    console.log("⏳ Предыдущая сборка еще не завершена, пропускаю...")
    return false
  }

  isBuilding = true

  try {
    const cwd = process.cwd()
    const inputFilePath = isAbsolute(inputFile) ? inputFile : join(cwd, inputFile)
    const inputFileHandle = Bun.file(inputFilePath)

    if (!(await inputFileHandle.exists())) {
      return `Файл ${inputFile} не найден`
    }

    let outputPath: string
    if (outputFile) {
      outputPath = isAbsolute(outputFile) ? outputFile : join(cwd, outputFile)
    } else {
      const inputDir = dirname(inputFilePath)
      const inputBaseName = basename(inputFilePath, ".ts")
      outputPath = join(inputDir, `${inputBaseName}.json`)
    }

    // Читаем исходный текст
    const sourceText = await inputFileHandle.text()

    // Обновляем хэш после успешной сборки
    lastContentHash = hashContent(sourceText)

    // Для обхода кэша Bun создаем временный файл и запускаем его
    // Используем абсолютный путь к корню проекта (где находится dsl/build)
    const scriptDir = dirname(new URL(import.meta.url).pathname)
    const projectRoot = join(scriptDir, "..", "..")
    const tempDir = join(projectRoot, "node_modules", ".metafor-build")
    await Bun.$`mkdir -p ${tempDir}`
    const tempFile = join(tempDir, `build-${Date.now()}.mjs`)

    // Генерируем код для временного файла
    const tempCode = `
      import { pathToFileURL } from "url"
      import { convertMetaToMonadJson } from "${pathToFileURL(join(projectRoot, "dsl/build/monadJson.ts")).href}"
      import "@metafor/meta"

      const sourceText = ${JSON.stringify(sourceText)}
      const inputFilePath = ${JSON.stringify(inputFilePath)}

      try {
        const fileUrl = pathToFileURL(inputFilePath).href + "?t=" + Date.now() + "&r=" + Math.random()
        const module = await import(fileUrl)
        const data = module.default

        if (!data) {
          console.error("Default export не найден в " + inputFilePath)
          process.exit(1)
        }

        const normalized = convertMetaToMonadJson(data, sourceText)
        const json = JSON.stringify(normalized, null, 2)

        // Выводим JSON в stdout
        console.log(json)
      } catch (error) {
        // Выводим только сообщение об ошибке без стека
        const errorMessage = error instanceof Error ? error.message : String(error)
        console.error(errorMessage)
        process.exit(1)
      }
    `

    await Bun.write(tempFile, tempCode)

    const { stdout, stderr, success } = await Bun.spawnSync({
      cmd: ["bun", tempFile],
      cwd: projectRoot,
      stdout: "pipe",
      stderr: "pipe",
    })

    // Удаляем временный файл
    try {
      await Bun.$`rm -f ${tempFile}`
    } catch {
      // Игнорируем ошибки удаления
    }

    if (!success) {
      const errorText = new TextDecoder().decode(stderr)
      // Извлекаем понятные ошибки без стека
      const errorMessage = extractErrorMessage(errorText)
      return errorMessage
    }

    const json = new TextDecoder().decode(stdout)
    await Bun.write(outputPath, json)

    const stat = await Bun.file(outputPath).stat()
    let humanSize: string

    if (stat.size > 1000000) {
      humanSize = `${(stat.size / 1000000).toFixed(2)} Мб`
    } else {
      humanSize = `${(stat.size / 1024).toFixed(2)} Кб`
    }

    // Выводим сообщение только в режиме однократной сборки
    if (!isWatchMode) {
      console.log(`✓ Собрано ${outputPath} (${humanSize})`)
    }

    return true
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  } finally {
    isBuilding = false
  }
}

// Первоначальная сборка
const initialBuildResult = await build()
if (initialBuildResult !== true && !isWatchMode) {
  // Выводим ошибку в однократном режиме
  console.error(typeof initialBuildResult === "string" ? initialBuildResult : "Ошибка сборки")
  process.exit(1)
}

// Запуск watcher только если передан --watch
if (isWatchMode) {
  try {
    const cwd = process.cwd()
    const watchPath = isAbsolute(inputFile) ? inputFile : join(cwd, inputFile)

    console.log(`👀 Отслеживание: ${inputFile}`)
    console.log("Нажмите Ctrl+C для остановки\n")

    // Если начальная сборка была с ошибкой, отображаем её
    if (initialBuildResult !== true) {
      runner.errorMessage = typeof initialBuildResult === "string" ? initialBuildResult.replace(/\s+/g, " ").trim() : null
      runner.start("Ошибка сборки...")
      runner.status = statusEmojis[2]! // ❌
    } else {
      // Запускаем анимацию статуса
      runner.start("Ожидание изменений...")
    }

    // Debounce таймер
    let debounceTimer: NodeJS.Timeout | null = null

    const watcher = watch(watchPath, async (event, filename) => {
      if (filename && event === "change") {
        // Сбрасываем предыдущий таймер
        if (debounceTimer) clearTimeout(debounceTimer)

        // Устанавливаем новый таймер с задержкой 300мс
        debounceTimer = setTimeout(async () => {
          // Сначала читаем файл и проверяем хэш
          try {
            const inputFileHandle = Bun.file(watchPath)
            const sourceText = await inputFileHandle.text()
            const currentHash = hashContent(sourceText)

            if (lastContentHash === currentHash) {
              // Содержимое не изменилось, молча пропускаем
              isBuilding = false
              return
            }

            lastContentHash = currentHash
            runner.update(1, "Пересборка...")
            const result = await build()
            if (result === true) {
              runner.update(0, "Ожидание изменений...")
              runner.clearError()
            } else {
              // result содержит сообщение об ошибке — нормализуем в одну строку
              runner.errorMessage = typeof result === "string" ? result.replace(/\s+/g, " ").trim() : (null as string | null)
              runner.update(2, "Ошибка сборки...")
            }
          } catch {
            // Ошибка чтения, пропускаем
            isBuilding = false
            runner.clearError()
            runner.update(2, "Ошибка...")
          }
        }, 300)
      }
    })

    watcher.on("error", (error) => {
      console.error("Ошибка watcher:", error)
    })

    process.on("SIGINT", () => {
      if (debounceTimer) clearTimeout(debounceTimer)
      runner.stop()
      console.log("\n👋 Watcher остановлен")
      process.exit(0)
    })
  } catch (error) {
    console.error("Не удалось запустить watcher:", error)
  }
} else {
  console.log("ℹ️  Режим однократной сборки")
  console.log("Для отслеживания изменений используйте --watch")
  console.log(`Используется файл: ${inputFile}`)
  console.log("Укажите другой файл через: bun run build --file <file> или bun run build <file>")
}
