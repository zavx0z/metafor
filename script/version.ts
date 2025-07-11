import { join } from "node:path"
import { $ } from "bun"

type VersionType = "patch" | "minor" | "major"

/**
 * Обновляет версию в package.json в указанной директории и выполняет полную автоматизацию релиза.
 * @param path Путь к директории с package.json
 * @param versionType Тип версии: patch, minor, major
 */
export const updateVersion = async (path: string, versionType: VersionType = "patch") => {
  // Валидация типа версии
  if (!["patch", "minor", "major"].includes(versionType)) {
    throw new Error(`Неверный тип версии: ${versionType}. Допустимые значения: patch, minor, major`)
  }

  const packageJson = JSON.parse(await Bun.file(join(path, "package.json")).text())
  console.log(`📝 Текущая версия: ${packageJson.version}`)

  // Увеличиваем версию без создания коммита
  await $`bun pm version ${versionType} --no-git-tag-version`

  // Читаем новую версию для вывода
  const updated = JSON.parse(await Bun.file(join(path, "package.json")).text())
  console.log(`🚀 Новая версия: ${updated.version} (${versionType})`)

  // Добавляем package.json и делаем amend-коммит
  console.log(`📝 Создаём amend-коммит...`)
  await $`git add package.json`
  await $`git commit --amend --no-edit`

  // Создаём тег
  console.log(`🏷️ Создаём тег v${updated.version}...`)
  await $`git tag v${updated.version}`

  // Пушим main и тег
  console.log(`📤 Пушим изменения...`)
  await $`git push`
  await $`git push origin v${updated.version}`

  console.log(`✅ Релиз ${updated.version} успешно создан и запушен!`)
}

if (import.meta.main) {
  const versionType = (process.argv[2] as VersionType) || "patch"
  await updateVersion(process.cwd(), versionType)
}
