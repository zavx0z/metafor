/** Первый выпуск, обновление и использование готовой версии. Правило нулевой пересборки заменяет прежнюю cold recovery Cosmos. */
import {afterAll, beforeAll, describe, expect, test} from "bun:test"
import {resolve} from "node:path"
import {releaseFixture} from "./fixture"

describe.each([
  {
    name: "Первый выпуск",
    props: {
      path: resolve(import.meta.dir, "fixture/first.json")
    },
    expected: {
      versions: {
        "@example/host": "1.0.0",
        "@example/view": "1.0.0"
      },
      buildPackages: ["@example/host", "@example/view"]
    }
  },
  {
    name: "Первый выпуск с готовым пакетом",
    props: {
      path: resolve(import.meta.dir, "fixture/first-with-ready.json")
    },
    expected: {
      versions: {
        "@example/host": "1.0.0",
        "@example/view": "1.0.0"
      },
      buildPackages: ["@example/host"]
    }
  },
  {
    name: "Новая версия одного пакета",
    props: {
      path: resolve(import.meta.dir, "fixture/update-one.json")
    },
    expected: {
      versions: {
        "@example/host": "1.0.0",
        "@example/view": "1.0.1"
      },
      buildPackages: ["@example/view"]
    }
  },
  {
    name: "Группа новых версий",
    props: {
      path: resolve(import.meta.dir, "fixture/update-group.json")
    },
    expected: {
      versions: {
        "@example/host": "1.0.1",
        "@example/view": "1.0.1"
      },
      buildPackages: ["@example/host", "@example/view"]
    }
  },
  {
    name: "Повтор готового состава",
    props: {
      path: resolve(import.meta.dir, "fixture/unchanged.json")
    },
    expected: {
      versions: {
        "@example/host": "1.0.0",
        "@example/view": "1.0.0"
      },
      buildPackages: []
    }
  },
  {
    name: "Исходники изменились без новой версии",
    props: {
      path: resolve(import.meta.dir, "fixture/source-changed.json")
    },
    expected: {
      versions: {
        "@example/host": "1.0.0",
        "@example/view": "1.0.0"
      },
      buildPackages: []
    }
  },
  {
    name: "TSDoc изменён без новой версии",
    props: {
      path: resolve(import.meta.dir, "fixture/docs-changed.json")
    },
    expected: {
      versions: {
        "@example/host": "1.0.0",
        "@example/view": "1.0.0"
      },
      buildPackages: []
    }
  },
  {
    name: "Профиль запуска изменён без новой версии",
    props: {
      path: resolve(import.meta.dir, "fixture/profile-changed.json")
    },
    expected: {
      versions: {
        "@example/host": "1.0.0",
        "@example/view": "1.0.0"
      },
      buildPackages: []
    }
  }
])("$name", ({name, props, expected}) => {
  let workspace: Awaited<ReturnType<typeof releaseFixture>>
  let versions: Record<string, string>
  beforeAll(async () => {
    workspace = await releaseFixture(props.path)
    const request = workspace.snapshot.request
    if (request?.packages) {
      const result = await workspace.release.publishPackages(request.packages)
      if (!result.success) throw new Error(JSON.stringify(result.results))
    } else {
      await workspace.release.recoverPublication()
    }
    versions = Object.fromEntries((await workspace.release.readReleaseComposition()).map(({name, version}) => [name, version]))
  }, 30_000)
  afterAll(async () => { await workspace?.cleanup() })

  test("Полный опубликованный состав", () => {
    expect(
      versions,
      "Результат содержит согласованные точные версии всех участников, а не промежуточную смесь",
    ).toEqual(expected.versions)
  })

  test("Подготовка только новых версий", () => {
    expect(
      [...new Set(workspace.builds.map(({name}) => name))].sort(),
      "Сборщик вызывается только для ещё не опубликованных целевых версий; существующая версия не пересобирается из-за старта, запроса, профиля или изменения source",
    ).toEqual([...expected.buildPackages])
  })

  test.todo("Полнота артефактов", () => {
    expect<unknown>(
      undefined,
      "До объявления выпуска готовым проверены все environments, public outputs, generated chunks, ресурсы и integrity всего графа",
    ).toEqual(true)
  })

  test.todo("Сохранение предшественника", () => {
    expect<unknown>(
      undefined,
      "Опубликованные байты, maps и public identities предыдущего выпуска сохраняются; сборка нового не заменяет файлы старой версии",
    ).toEqual(true)
  })

  test.todo("Порядок публикации", () => {
    expect<unknown>(
      undefined,
      "Намерение записывается до подготовки, versions участников фиксируются только после полного подтверждения artifacts, наблюдатель получает один итог",
    ).toEqual(true)
  })

  test.todo("Граница выпуска", () => {
    expect<unknown>(
      undefined,
      "Публикация не активирует runtime и не управляет браузером, WebSocket или Cache Storage",
    ).toEqual(true)
  })

  /** @remarks До операции нет опубликованного полного состава. */
  describe.skipIf(!["Первый выпуск", "Первый выпуск с готовым пакетом"].includes(name))("Первоначальный выпуск", () => {
    test.todo("Начальные версии", () => {
      expect<unknown>(
        undefined,
        "Первый выпуск использует объявленные начальные версии без автоматического увеличения",
      ).toEqual(true)
    })
  })

  /** @remarks Одна версия уже существует в immutable storage до создания первого состава. */
  describe.skipIf(name !== "Первый выпуск с готовым пакетом")("Готовый участник", () => {
    test.todo("Повторное использование", () => {
      expect<unknown>(
        undefined,
        "Готовый view включается в выпуск без вызова сборщика и переписывания его outputs",
      ).toEqual(true)
    })
  })

  /** @remarks Явный запрос меняет версии выбранных участников. */
  describe.skipIf(!["Новая версия одного пакета", "Группа новых версий"].includes(name))("Обновление", () => {
    test.todo("Согласованное изменение", () => {
      expect<unknown>(
        undefined,
        "Неизменённые участники сохраняют версии; одновременно изменяемые участники публикуются одной группой после проверки зависимостей",
      ).toEqual(true)
    })

    test.todo("Сохранность старых адресов", () => {
      expect<unknown>(
        undefined,
        "Прежние root, public subpaths и lazy chunks доступны по старой версии даже после изменения exports, outfile или набора environments в новых исходниках",
      ).toEqual(true)
    })
  })

  /** @remarks Во всех этих случаях целевые версии уже опубликованы. */
  describe.skipIf(!["Повтор готового состава", "Исходники изменились без новой версии", "TSDoc изменён без новой версии", "Профиль запуска изменён без новой версии"].includes(name))("Готовый выпуск", () => {
    test.todo("Ноль вызовов сборщика", () => {
      expect<unknown>(
        undefined,
        "Получение существующей версии не запускает typecheck или compiler и не сравнивает новую сборку с опубликованной",
      ).toEqual(0)
    })

    test.todo("Карты принадлежат выпуску", () => {
      expect<unknown>(
        undefined,
        "Сохранённые JS и source maps не заменяются ради совпадения с текущими исходниками или профилем запуска",
      ).toEqual(true)
    })
  })
})
