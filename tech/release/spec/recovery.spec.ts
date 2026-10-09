/** Продолжение незавершённой публикации и восстановление сохранённых байтов без пересборки опубликованных версий. */
import {afterAll, beforeAll, describe, expect, test} from "bun:test"
import {resolve} from "node:path"
import {releaseFixture} from "./fixture"

describe.each([
  {
    name: "Прерывание до подготовки",
    props: {
      path: resolve(import.meta.dir, "fixture/resume-before.json")
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
    name: "Прерывание после части окружений",
    props: {
      path: resolve(import.meta.dir, "fixture/resume-partial.json")
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
    name: "Подготовка завершена до прерывания",
    props: {
      path: resolve(import.meta.dir, "fixture/resume-prepared.json")
    },
    expected: {
      versions: {
        "@example/host": "1.0.0",
        "@example/view": "1.0.1"
      },
      buildPackages: []
    }
  },
  {
    name: "Публикация файлов прервана",
    props: {
      path: resolve(import.meta.dir, "fixture/resume-files.json")
    },
    expected: {
      versions: {
        "@example/host": "1.0.0",
        "@example/view": "1.0.1"
      },
      buildPackages: []
    }
  },
  {
    name: "Публикация завершилась до потери ответа",
    props: {
      path: resolve(import.meta.dir, "fixture/resume-completed.json")
    },
    expected: {
      versions: {
        "@example/host": "1.0.0",
        "@example/view": "1.0.1"
      },
      buildPackages: []
    }
  },
  {
    name: "Обычный запуск готового выпуска",
    props: {
      path: resolve(import.meta.dir, "fixture/resume-ready.json")
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
    name: "Потерянный опубликованный артефакт восстановлен",
    props: {
      path: resolve(import.meta.dir, "fixture/restore-published.json")
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
    name: "Два адреса одних байтов",
    props: {
      path: resolve(import.meta.dir, "fixture/aliases.json")
    },
    expected: {
      versions: {
        "@example/host": "1.0.0",
        "@example/view": "1.0.1"
      },
      buildPackages: []
    }
  },
  {
    name: "Хранилище без hardlinks",
    props: {
      path: resolve(import.meta.dir, "fixture/copy-fallback.json")
    },
    expected: {
      versions: {
        "@example/host": "1.0.0",
        "@example/view": "1.0.1"
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

  test("Сохранённая цель", () => {
    expect(
      versions,
      "Продолжение использует уже назначенные целевые версии без нового patch, minor или major",
    ).toEqual(expected.versions)
  })

  test("Необходимость сборки", () => {
    expect(
      [...new Set(workspace.builds.map(({name}) => name))].sort(),
      "Продолжение готового выпуска никогда не компилирует его; при незавершённой новой версии подготавливаются только недостающие подтверждённые части",
    ).toEqual([...expected.buildPackages])
  })

  test.todo("Сохранность результата", () => {
    expect<unknown>(
      undefined,
      "Проверенные результаты не переписываются; частичный состав не становится опубликованным",
    ).toEqual(true)
  })

  /** @remarks Main новой версии подтверждён, server ещё не подготовлен. */
  describe.skipIf(name !== "Прерывание после части окружений")("Частичная подготовка", () => {
    test.todo("Незавершённое окружение", () => {
      expect<unknown>(
        undefined,
        "Повторно собирается только server новой версии; подтверждённый main с его полным графом повторно не компилируется",
      ).toEqual(["server"])
    })
  })

  /** @remarks Все результаты сборки новой версии уже подтверждены. */
  describe.skipIf(!["Подготовка завершена до прерывания", "Публикация файлов прервана"].includes(name))("Завершение публикации", () => {
    test.todo("Без повторной компиляции", () => {
      expect<unknown>(
        undefined,
        "Оставшиеся файлы материализуются из подготовленных результатов, затем сходятся manifests и опубликованный состав",
      ).toEqual(0)
    })

    test.todo("Существующие точные байты", () => {
      expect<unknown>(
        undefined,
        "Уже записанный идентичный artifact используется повторно, а несовпадающий не перезаписывается",
      ).toEqual(true)
    })
  })

  /** @remarks Опубликованный состав уже соответствует сохранённой цели. */
  describe.skipIf(!["Публикация завершилась до потери ответа", "Обычный запуск готового выпуска"].includes(name))("Завершённый выпуск", () => {
    test.todo("Нет повторной публикации", () => {
      expect<unknown>(
        undefined,
        "Возвращается существующий выпуск без подготовки, изменения versions и второго сигнала о новом выпуске",
      ).toEqual(true)
    })
  })

  /** @remarks Точная копия потерянного файла доступна в хранилище. */
  describe.skipIf(name !== "Потерянный опубликованный артефакт восстановлен")("Восстановление байтов", () => {
    test.todo("Точная сохранённая копия", () => {
      expect<unknown>(
        undefined,
        "Восстанавливаются те же bytes, SHA-256 и size; текущие source не используются для пересборки старой версии",
      ).toEqual(true)
    })
  })

  /** @remarks Public CSS и generated CSS имеют одинаковые bytes и разные identities. */
  describe.skipIf(!["Два адреса одних байтов", "Хранилище без hardlinks"].includes(name))("Материализация aliases", () => {
    test.todo("Доступность обоих адресов", () => {
      expect<unknown>(
        undefined,
        "Оба адреса сохраняют точные bytes, hash и size после публикации",
      ).toEqual(true)
    })

    test.todo("Поддержка хранилища", () => {
      expect<unknown>(
        undefined,
        "При поддержке hardlink одинаковые bytes разделяют хранение; иначе корректное копирование сохраняет обе identities",
      ).toEqual(true)
    })
  })
})
