import { $ } from "bun"

export const typegen = async (entrypoint: string, destination: string) => {
  const isTTY = process.stdout.isTTY
  const cmd = $`dts-bundle-generator --out-file ${destination} --export-referenced-types true --inline-declare-global true --inline-declare-externals true --external-inlines @zavx0z/context --external-inlines @zavx0z/renderer --external-inlines @dsl/template -- ${entrypoint}`
  if (isTTY) {
    let spinnerActive = true
    const spinnerFrames = ["|", "/", "-", "\\"]
    let spinnerIndex = 0
    process.stdout.write("   ")
    const spinner = setInterval(() => {
      process.stdout.write(`\r${spinnerFrames[spinnerIndex++ % spinnerFrames.length]}  Генерация типов...`)
    }, 120)
    // Включаем все необходимые типы для полноценного автодополнения
    await cmd.quiet()

    spinnerActive = false
    clearInterval(spinner)
    process.stdout.write("\r✅ Типы успешно сгенерированы!           \n")
  } else {
    console.log("🛠️  Генерация типов...")
    // Включаем все необходимые типы для полноценного автодополнения
    await cmd.quiet()
    console.log("✅ Типы успешно сгенерированы!")
  }
}
