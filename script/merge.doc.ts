import { $ } from "bun"

async function mergeDocBranch() {
  console.log("🔄 Начинаем процесс мерджа изменений в doc ветку...")

  try {
    // Проверяем текущую ветку
    const currentBranch = await $`git branch --show-current`.text()
    console.log(`📍 Текущая ветка: ${currentBranch.trim()}`)

    // Сохраняем текущую ветку
    const originalBranch = currentBranch.trim()

    // Переключаемся на doc ветку
    console.log("📋 Переключаемся на doc ветку...")
    await $`git checkout doc`

    // Обновляем doc ветку
    console.log("📥 Обновляем doc ветку...")
    await $`git pull origin doc`

    // Проверяем, можно ли сделать fast-forward merge
    console.log("🔍 Проверяем возможность fast-forward merge...")
    const docCommit = await $`git rev-parse HEAD`.text()
    const mergeBase = await $`git merge-base ${docCommit.trim()} ${originalBranch}`.text()

    if (mergeBase.trim() === docCommit.trim()) {
      console.log("✅ Возможен fast-forward merge, выполняем...")
      await $`git merge ${originalBranch} --ff-only`
    } else {
      console.log("⚠️  Fast-forward merge невозможен, выполняем обычный merge...")
      await $`git merge ${originalBranch} --no-ff -m "[merge] merge ${originalBranch} into doc"`
    }

    // Проверяем, есть ли изменения в коде
    const status = await $`git status --porcelain`.text()

    if (status.trim()) {
      console.log("📝 Обнаружены изменения в коде, коммитим...")
      await $`git add .`
      await $`git commit -m "[merge] обновлен код после мерджа из ${originalBranch}"`

      // Пушим изменения в doc ветку
      console.log("📤 Пушим изменения в doc ветку...")
      await $`git push origin doc`
      console.log("✅ Изменения успешно запушены в doc ветку")
    } else {
      console.log("ℹ️  Изменений в коде не обнаружено")
    }

    // Возвращаемся на исходную ветку
    console.log(`🔄 Возвращаемся на исходную ветку: ${originalBranch}`)
    await $`git checkout ${originalBranch}`

    console.log("🎉 Процесс мерджа завершен успешно!")
    console.log("📋 Документация будет автоматически сгенерирована и опубликована в workflow")
  } catch (error) {
    console.error("❌ Ошибка при мердже:", error)

    // Пытаемся вернуться на исходную ветку в случае ошибки
    try {
      const originalBranch = await $`git branch --show-current`.text()
      console.log(`🔄 Возвращаемся на исходную ветку: ${originalBranch.trim()}`)
      await $`git checkout ${originalBranch.trim()}`
    } catch (checkoutError) {
      console.error("❌ Не удалось вернуться на исходную ветку:", checkoutError)
    }

    process.exit(1)
  }
}

// Запускаем скрипт
mergeDocBranch()
