import { watch } from "fs"
import { dirname, basename, join, isAbsolute } from "path"
import { pathToFileURL } from "url"
import { convertMetaToFieldIntermediate } from "./braneToField"


// Обработка аргументов командной строки
const args = process.argv.slice(2)
const isWatchMode = args.includes("--watch")

// Извлекаем аргумент --file или используем позиционный аргумент
let inputFile = "meta.ts"
const fileArgIndex = args.indexOf("--file")
if (fileArgIndex !== -1 && args[fileArgIndex + 1]) {
  inputFile = args[fileArgIndex + 1]!
} else {
  // Ищем позиционный аргумент (не начинающийся с --)
  const positionalArg = args.find(arg => !arg.startsWith("--"))
  if (positionalArg) {
    inputFile = positionalArg
  }
}

/**
 * Выполняет сборку meta-файла:
 * - Проверяет существование входного файла.
 * - Импортирует модуль с query-параметром для обхода кэша.
 * - Преобразует через convertMetaToFieldIntermediate с передачей исходного текста.
 * - Записывает результат в JSON рядом с исходным файлом.
 * - Выводит размер сгенерированного файла.
 */
async function build() {
  try {
    const cwd = process.cwd()

    // Проверяем существование входного файла
    const inputFilePath = isAbsolute(inputFile) ? inputFile : join(cwd, inputFile)
    const inputFileHandle = Bun.file(inputFilePath)

    if (!(await inputFileHandle.exists())) {
      console.error(`Файл ${inputFile} не найден`)
      return
    }

    // Формируем путь к выходному файлу (рядом с исходным, с тем же именем, но .json)
    const inputDir = dirname(inputFilePath)
    const inputBaseName = basename(inputFilePath, ".ts")
    const outputPath = join(inputDir, `${inputBaseName}.json`)


    // Импорт модуля с добавлением временной метки для обхода кэша
    const fileUrl = pathToFileURL(inputFilePath).href
    const timestamp = Date.now()
    const module = await import(`${fileUrl}?t=${timestamp}`)

    const data = module.default

    if (!data) {
      console.error(`Default export не найден в ${inputFile}`)
      return
    }

    const sourceText = await inputFileHandle.text()
    const normalized = convertMetaToFieldIntermediate(data, sourceText)
    const json = JSON.stringify(normalized, null, 2)
    await Bun.write(outputPath, json)

    // Расчет размера файла
    const stat = await Bun.file(outputPath).stat()
    let humanSize: string

    if (stat.size > 1000000) {
      humanSize = `${(stat.size / 1000000).toFixed(2)} Мб`
    } else {
      humanSize = `${(stat.size / 1024).toFixed(2)} Кб`
    }

    console.log(`✓ Собрано ${outputPath} (${humanSize})`)
  } catch (error) {
    console.error("Ошибка сборки:", error)
  }
}

// Первоначальная сборка
build()

// Запуск watcher только если передан --watch
if (isWatchMode) {
  try {
    const cwd = process.cwd()
    const watchPath = isAbsolute(inputFile) ? inputFile : join(cwd, inputFile)
    
    console.log(`👀 Отслеживание изменений в ${inputFile}...`)
    console.log("Нажмите Ctrl+C для остановки")

    const watcher = watch(watchPath, async (event, filename) => {
      if (filename && event === "change") {
        console.log(`\n🔄 ${filename} изменен, пересборка...`)

        // Даем файловой системе время на запись
        await new Promise((resolve) => setTimeout(resolve, 100))

        build()
      }
    })

    // Обработка ошибок watcher
    watcher.on("error", (error) => {
      console.error("Ошибка watcher:", error)
    })

    // Обработка завершения процесса
    process.on("SIGINT", () => {
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
