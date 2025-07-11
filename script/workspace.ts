import path from "node:path"
import { stat } from "node:fs/promises"
import { $ } from "bun"

if (import.meta.main) {
  console.log("Поиск зависимостей в workspace...")

  const packageJson = await Bun.file("package.json").json()
  const packages: string[] = Object.entries({ ...packageJson.dependencies, ...packageJson.devDependencies })
    .filter(([dependency, version]) => {
      if (dependency.startsWith("@zavx0z/") && (version as string).startsWith("workspace:"))
        return dependency.split("/")[1] as string
    })
    .map(([dependency]) => dependency.split("/")[1] as string)

  console.log("\uD83D\uDE80 Запуск сборки пакетов:", packages.join(", "), "\n")

  const zavx0zPath = path.resolve(".", "@zavx0z")
  let isDir = false
  try {
    isDir = (await stat(zavx0zPath)).isDirectory()
  } catch {
    isDir = false
  }
  if (!isDir) {
    console.log(`\uD83D\uDCC1 Создаю директорию для пакетов: ./@zavx0z`)
    await $`mkdir -p ./@zavx0z`.cwd(path.resolve("."))
  }

  for (const packageName of packages) {
    console.log(`====== ${packageName} ======`)
    const srcPackageDir = path.resolve("..", packageName)
    const destPackageDir = path.resolve(".", `@zavx0z/${packageName}`)

    // Получаем версию исходного пакета
    const srcPackageJsonPath = path.resolve(srcPackageDir, "package.json")
    const srcPackageJson = await Bun.file(srcPackageJsonPath).json()
    const srcVersion = srcPackageJson.version

    const destPackageJsonPath = path.resolve(destPackageDir, "package.json")

    // Проверяем, существует ли пакет в целевой директории
    const isExist = await Bun.file(destPackageJsonPath).exists()
    if (!isExist) {
      console.log(`\uD83D\uDCC1 Создаю ${packageName}`)
      await $`mkdir -p ${destPackageDir}`.cwd(path.resolve("."))
      await Bun.write(path.resolve(destPackageDir, "package.json"), JSON.stringify(srcPackageJson, null, 2))
      console.log(`\uD83D\uDCC4 package.json создан, версия: ${srcVersion}`)
      await $`bun run build:dev`.cwd(srcPackageDir)
      await $`cp -r ${srcPackageDir}/dist ${destPackageDir}`.cwd(path.resolve("."))
      console.log(`\uD83D\uDCC2 dist скопирован в ${packageName}`)
      continue
    }

    // Получаем версию целевого пакета
    const destPackageJson = await Bun.file(destPackageJsonPath).json()

    // Проверяем, совпадает ли версия исходного и целевого пакета
    if (destPackageJson.version !== srcPackageJson.version) {
      console.log(`\uD83D\uDD04 Обновляю ${packageName} с ${destPackageJson.version} \u2192 ${srcVersion}`)
      destPackageJson.version = srcPackageJson.version
      await Bun.write(destPackageJsonPath, JSON.stringify(destPackageJson, null, 2))
      await $`bun run build:dev`.cwd(srcPackageDir)
      await $`cp -r ${srcPackageDir}/dist ${destPackageDir}`.cwd(path.resolve("."))
      console.log(`\uD83D\uDCC2 dist обновлён в ${packageName}`)
      continue
    } else {
      console.log(`\u2705 ${packageName} актуален (v${destPackageJson.version})`)
    }
  }
}
