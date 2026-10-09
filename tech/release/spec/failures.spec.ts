/** Ошибки входа, подготовки, неизменяемого хранения и публикации; snapshots задают входное состояние и отказ операции. */
import {afterAll, beforeAll, describe, expect, test} from "bun:test"
import {join, resolve} from "node:path"
import {releaseFixture} from "./fixture"
import type {PackageReleaseResultSet, ReleasedPackage} from "../contracts"
import {isBrowserPackageEnvironment} from "@metafor/tech-build/identity"
import {publishImmutableArtifact} from "../publication"

describe.each([
  {
    name: "Ошибка первого выпуска",
    props: {
      path: resolve(import.meta.dir, "fixture/first-failed.json")
    },
    reason: "При отказе первого выпуска опубликованного состава по-прежнему нет",
    expected: {
      versions: null,
      success: false
    }
  },
  {
    name: "Отсутствующая зависимость",
    props: {
      path: resolve(import.meta.dir, "fixture/missing-dependency.json")
    },
    reason: "Полный состав содержит каждую runtime release dependency",
    expected: {
      versions: {
        "@example/host": "1.0.0",
        "@example/view": "1.0.0"
      },
      success: false
    }
  },
  {
    name: "Несовместимые версии",
    props: {
      path: resolve(import.meta.dir, "fixture/incompatible.json")
    },
    reason: "Выбранная версия view удовлетворяет диапазону host",
    expected: {
      versions: {
        "@example/host": "1.0.0",
        "@example/view": "1.0.0"
      },
      success: false
    }
  },
  {
    name: "Неизвестный участник запроса",
    props: {
      path: resolve(import.meta.dir, "fixture/unknown-member.json")
    },
    reason: "Обновление относится к участникам объявленного состава",
    expected: {
      versions: {
        "@example/host": "1.0.0",
        "@example/view": "1.0.0"
      },
      success: false
    }
  },
  {
    name: "Готовый номер вместо изменения",
    props: {
      path: resolve(import.meta.dir, "fixture/explicit-version.json")
    },
    reason: "Запрос обновления задаёт patch, minor или major, а не произвольный номер",
    expected: {
      versions: {
        "@example/host": "1.0.0",
        "@example/view": "1.0.0"
      },
      success: false
    }
  },
  {
    name: "Противоречивый повтор участника",
    props: {
      path: resolve(import.meta.dir, "fixture/duplicate-change.json")
    },
    reason: "Один участник не получает два разных изменения в одной операции",
    expected: {
      versions: {
        "@example/host": "1.0.0",
        "@example/view": "1.0.0"
      },
      success: false
    }
  },
  {
    name: "Неверный SemVer",
    props: {
      path: resolve(import.meta.dir, "fixture/bad-semver.json")
    },
    reason: "Опубликованные и целевые версии имеют точную поддержанную SemVer-форму",
    expected: {
      versions: {
        "@example/host": "1.0.0",
        "@example/view": "latest"
      },
      success: false
    }
  },
  {
    name: "Ошибка подготовки участника",
    props: {
      path: resolve(import.meta.dir, "fixture/build-failed.json")
    },
    reason: "Отказ одной части запрещает публикацию всей новой группы",
    expected: {
      versions: {
        "@example/host": "1.0.0",
        "@example/view": "1.0.0"
      },
      success: false
    }
  },
  {
    name: "Конфликт immutable artifact",
    props: {
      path: resolve(import.meta.dir, "fixture/immutable-conflict.json")
    },
    reason: "Другие bytes под той же package version, environment и artifact key отклоняются",
    expected: {
      versions: {
        "@example/host": "1.0.0",
        "@example/view": "1.0.0"
      },
      success: false
    }
  },
  {
    name: "Ошибка записи manifests",
    props: {
      path: resolve(import.meta.dir, "fixture/manifest-write-failed.json")
    },
    reason: "Обычная ошибка восстанавливает предыдущие root и child manifests",
    expected: {
      versions: {
        "@example/host": "1.0.0",
        "@example/view": "1.0.0"
      },
      success: false
    }
  },
  {
    name: "Ошибка записи второго manifest группы",
    props: {path: resolve(import.meta.dir, "fixture/manifest-group-write-failed.json")},
    reason: "Отказ записи второго manifest откатывает уже изменённого первого участника",
    expected: {versions: {"@example/host": "1.0.0", "@example/view": "1.0.0"}, success: false},
  },
  {
    name: "Постоянный отказ записи второго manifest группы",
    props: {path: resolve(import.meta.dir, "fixture/manifest-group-write-persistent-failed.json")},
    reason: "Постоянный отказ не требует повторной записи неизменённого child и не блокирует откат root",
    expected: {versions: {"@example/host": "1.0.0", "@example/view": "1.0.0"}, success: false},
  },
  {
    name: "Потерянный artifact без копии",
    props: {
      path: resolve(import.meta.dir, "fixture/missing-published.json")
    },
    reason: "Отсутствие опубликованного artifact без сохранённой копии даёт ошибку, а не пересборку",
    expected: {
      versions: {
        "@example/host": "1.0.0",
        "@example/view": "1.0.0"
      },
      success: false
    }
  },
  {
    name: "Повреждённая сохранённая копия",
    props: {
      path: resolve(import.meta.dir, "fixture/corrupted-published.json")
    },
    reason: "Несоответствие сохранённых bytes их identity не исправляется сборкой текущих source",
    expected: {
      versions: {
        "@example/host": "1.0.0",
        "@example/view": "1.0.0"
      },
      success: false
    }
  },
  {
    name: "Потерянная запись опубликованной среды",
    props: {path: resolve(import.meta.dir, "fixture/missing-receipt.json")},
    reason: "Следы опубликованной версии запрещают восстановление из изменённых исходников",
    expected: {versions: {"@example/host": "1.0.0", "@example/view": "1.0.0"}, success: false},
  },
  {
    name: "Повреждённая запись опубликованной среды",
    props: {path: resolve(import.meta.dir, "fixture/corrupt-receipt.json")},
    reason: "Следы опубликованной версии запрещают восстановление из изменённых исходников",
    expected: {versions: {"@example/host": "1.0.0", "@example/view": "1.0.0"}, success: false},
  },
  {
    name: "Потерянный legacy artifact без receipt",
    props: {path: resolve(import.meta.dir, "fixture/legacy-missing-published.json")},
    reason: "Следы опубликованной версии запрещают восстановление из изменённых исходников",
    expected: {versions: {"@example/host": "1.0.0", "@example/view": "1.0.0"}, success: false},
  },
  {
    name: "Потерянный static chunk старой версии",
    props: {path: resolve(import.meta.dir, "fixture/legacy-missing-static-chunk.json")},
    reason: "Неполный либо повреждённый immutable graph не объявляется готовым и не пересобирается",
    expected: {versions: {"@example/host": "1.0.0", "@example/view": "1.0.0"}, success: false},
  },
  {
    name: "Потерянный dynamic chunk старой версии",
    props: {path: resolve(import.meta.dir, "fixture/legacy-missing-dynamic-chunk.json")},
    reason: "Неполный либо повреждённый immutable graph не объявляется готовым и не пересобирается",
    expected: {versions: {"@example/host": "1.0.0", "@example/view": "1.0.0"}, success: false},
  },
  {
    name: "Усечённый public graph receipt",
    props: {path: resolve(import.meta.dir, "fixture/incomplete-public-receipt.json")},
    reason: "Неполный либо повреждённый immutable graph не объявляется готовым и не пересобирается",
    expected: {versions: {"@example/host": "1.0.0", "@example/view": "1.0.0"}, success: false},
  },
  {
    name: "Усечённый generated graph receipt",
    props: {path: resolve(import.meta.dir, "fixture/incomplete-generated-receipt.json")},
    reason: "Неполный либо повреждённый immutable graph не объявляется готовым и не пересобирается",
    expected: {versions: {"@example/host": "1.0.0", "@example/view": "1.0.0"}, success: false},
  },
  {
    name: "Потерянный trusted object",
    props: {path: resolve(import.meta.dir, "fixture/missing-object.json")},
    reason: "Неполный либо повреждённый immutable graph не объявляется готовым и не пересобирается",
    expected: {versions: {"@example/host": "1.0.0", "@example/view": "1.0.0"}, success: false},
  },
  {
    name: "Повреждённый trusted object",
    props: {path: resolve(import.meta.dir, "fixture/corrupt-object.json")},
    reason: "Неполный либо повреждённый immutable graph не объявляется готовым и не пересобирается",
    expected: {versions: {"@example/host": "1.0.0", "@example/view": "1.0.0"}, success: false},
  },
  {
    name: "Недостоверный legacy ready receipt",
    props: {path: resolve(import.meta.dir, "fixture/unverified-legacy-receipt.json")},
    reason: "Недостоверное доказательство или surviving graph не разрешают пересборку старой версии",
    expected: {versions: {"@example/host": "1.0.0", "@example/view": "1.0.0"}, success: false},
  },
  {
    name: "Потерянные legacy roots при сохранившемся graph",
    props: {path: resolve(import.meta.dir, "fixture/legacy-missing-all-roots.json")},
    reason: "Недостоверное доказательство или surviving graph не разрешают пересборку старой версии",
    expected: {versions: {"@example/host": "1.0.0", "@example/view": "1.0.0"}, success: false},
  }
])("$name", ({name, props, expected}) => {
  let workspace: Awaited<ReturnType<typeof releaseFixture>>
  let result: PackageReleaseResultSet | undefined
  let failure: unknown
  let beforeRoot: string
  let beforeChildren: Record<string, string>
  let beforePublished: Array<{path: string; bytes: string}>
  let children: Record<string, string>
  let initialCompositionMissing = false
  let queuedReader: ReleasedPackage[] | undefined
  let queuedReaderFailure: unknown
  let queuedReaderWaited = false
  let intermediateRejected = false

  beforeAll(async () => {
    let unblock!: () => void
    let signalEntered!: () => void
    let holdChild = name === "Постоянный отказ записи второго manifest группы"
    const gate = new Promise<void>((resolve) => { unblock = resolve })
    const entered = new Promise<void>((resolve) => { signalEntered = resolve })
    workspace = await releaseFixture(props.path, {
      async afterRename(path) {
        if (holdChild && path.endsWith(join("packages", "host", "package.json"))) {
          holdChild = false
          signalEntered()
          await gate
        }
      },
    })
    beforeRoot = await Bun.file(join(workspace.root, "package.json")).text()
    beforeChildren = Object.fromEntries(await Promise.all(Object.keys(workspace.snapshot.childVersions).map(async (name) => [name, await Bun.file(join(workspace.packageRoot(name), "package.json")).text()])))
    beforePublished = await Promise.all(workspace.publishedArtifacts.map(async ({path}) => ({path, bytes: await Bun.file(path).text()})))
    if (name === "Постоянный отказ записи второго manifest группы") {
      const publication = Promise.allSettled([workspace.release.publishPackages(workspace.snapshot.request!.packages!)])
      await entered
      let readerDone = false
      const reader = Promise.allSettled([workspace.release.releasedPackages()]).then((values) => {
        readerDone = true
        return values
      })
      try { await workspace.release.readReleaseComposition() } catch { intermediateRejected = true }
      queuedReaderWaited = !readerDone
      unblock()
      const [publicationResults, readerResults] = await Promise.all([publication, reader])
      const published = publicationResults[0]!
      if (published.status === "fulfilled") result = published.value
      else failure = published.reason
      const read = readerResults[0]!
      if (read.status === "fulfilled") queuedReader = read.value
      else queuedReaderFailure = read.reason
    } else {
      try {
        if (workspace.snapshot.request?.packages) result = await workspace.release.publishPackages(workspace.snapshot.request.packages)
        else await workspace.release.recoverPublication()
      } catch (error) {
        failure = error
      }
    }
    children = Object.fromEntries(await Promise.all(Object.keys(workspace.snapshot.childVersions).map(async (name) => [name, (await Bun.file(join(workspace.packageRoot(name), "package.json")).json()).version])))
    if (expected.versions === null) {
      try { await workspace.release.releasedPackages() } catch { initialCompositionMissing = true }
    }
  }, 30_000)
  afterAll(async () => { await workspace?.cleanup() })

  test("Отказ выпуска", () => {
    expect(
      failure !== undefined || result?.success === false,
      "Некорректный запрос, неполный состав, ошибка подготовки или публикации возвращают отказ",
    ).toEqual(!expected.success)
  })

  test("Предыдущий состав", () => {
    expect(
      expected.versions === null && initialCompositionMissing ? null : children,
      "Отказ не заменяет предыдущий опубликованный состав частичным новым",
    ).toEqual(expected.versions)
  })

  test("Объяснение отказа", () => {
    const diagnostics = failure instanceof Error ? failure.message : result?.results.filter(({success}) => !success).map(({module, env, stderr}) => `${module}:${env}: ${stderr}`).join("\n") ?? ""
    const expectedCause: Record<string, RegExp> = {
      "Ошибка первого выпуска": /Recovery build failed for @example\/view:.*typecheck failed/s,
      "Отсутствующая зависимость": /@example\/host requires missing release package @example\/missing/,
      "Несовместимые версии": /@example\/host requires @example\/view@workspace:\^1\.0\.0, selected 2\.0\.0/,
      "Неизвестный участник запроса": /Released package @example\/unknown is missing/,
      "Готовый номер вместо изменения": /Invalid version change/,
      "Противоречивый повтор участника": /Conflicting change for @example\/view/,
      "Неверный SemVer": /Invalid release dependency @example\/view@workspace:\^latest/,
      "Ошибка подготовки участника": /@example\/view:.*typecheck failed/s,
      "Конфликт immutable artifact": /Immutable artifact conflict: .*view.*1\.0\.1/,
      "Ошибка записи manifests": /EACCES: write-child-manifest .*view.*package\.json/,
      "Ошибка записи второго manifest группы": /EACCES: write-child-manifest .*view.*package\.json/,
      "Постоянный отказ записи второго manifest группы": /EACCES: write-child-manifest .*view.*package\.json/,
      "Потерянный artifact без копии": /Published environment record is missing: @example\/view:server@1\.0\.0/,
      "Повреждённая сохранённая копия": /Immutable artifact conflict: .*host.*1\.0\.0/,
      "Потерянная запись опубликованной среды": /Published environment record is missing: @example\/view:server@1\.0\.0/,
      "Повреждённая запись опубликованной среды": /Published environment record is corrupt: @example\/view:server@1\.0\.0/,
      "Потерянный static chunk старой версии": /Published artifact dependency is missing: @example\/view:main@1\.0\.0 .*missing\.js/,
      "Потерянный dynamic chunk старой версии": /Published artifact dependency is missing: @example\/view:main@1\.0\.0 .*missing\.js/,
      "Усечённый public graph receipt": /Published environment record is corrupt: @example\/view:main@1\.0\.0/,
      "Усечённый generated graph receipt": /Published environment record is corrupt: @example\/view:main@1\.0\.0/,
      "Потерянный trusted object": /Trusted artifact copy is missing or corrupt: .*objects/,
      "Повреждённый trusted object": /Trusted artifact copy is missing or corrupt: .*objects/,
      "Недостоверный legacy ready receipt": /Unverified legacy release proof: @example\/view@1\.0\.0/,
      "Потерянные legacy roots при сохранившемся graph": /Published artifact is missing without a trusted copy: @example\/view:.*@1\.0\.0/,
      "Потерянный legacy artifact без receipt": /Published artifact is missing without a trusted copy: @example\/view:server@1\.0\.0/,
    }
    expect(
      diagnostics,
      "Диагностика сохраняет пакет, стадию и исходную причину; частичные outputs не выдаются за успешный выпуск",
    ).toMatch(expectedCause[name]!)
    expect(result?.packages ?? [], "Отказ не отдаёт частичные packages как результат нового выпуска").toEqual([])
  })

  test("Неприкосновенность опубликованного", async () => {
    expect(
      await Promise.all(beforePublished.map(async ({path}) => ({path, bytes: await Bun.file(path).text()}))),
      "Ранее опубликованные bytes не перезаписываются и не удаляются при неудаче новой операции",
    ).toEqual(beforePublished)
  })

  /** @remarks Операция завершилась обработанной ошибкой, а не аварийным исчезновением процесса. */
  describe.skipIf(!["Ошибка подготовки участника", "Ошибка записи manifests", "Ошибка записи второго manifest группы", "Постоянный отказ записи второго manifest группы"].includes(name))("Обычный отказ транзакции", () => {
    test("Откат намерения и manifests", async () => {
      expect(await Bun.file(join(workspace.root, "package.json")).text(), "Root возвращается к согласованному состоянию до запроса").toEqual(beforeRoot)
      expect(
        Object.fromEntries(await Promise.all(Object.keys(beforeChildren).map(async (name) => [name, await Bun.file(join(workspace.packageRoot(name), "package.json")).text()]))),
        "Child manifests полностью возвращаются к предыдущему содержимому",
      ).toEqual(beforeChildren)
      expect(workspace.release.readDesiredBrowserArtifacts(), "Не отправляется проекция успешного нового выпуска").toEqual([])
    })
  })

  describe.skipIf(!["Ошибка записи второго manifest группы", "Постоянный отказ записи второго manifest группы"].includes(name))("Частично записанные child manifests", () => {
    test("Уже изменённый участник откатывается", () => {
      const writes = workspace.manifestWrites.filter(({path}) => path === join(workspace.packageRoot("@example/host"), "package.json"))
      expect(writes.map(({value}) => (value as {version: string}).version), "Первый child действительно записан новой версией, затем восстановлен после отказа второго").toEqual(["1.0.1", "1.0.0"])
    })
  })

  describe.skipIf(name !== "Постоянный отказ записи второго manifest группы")("Постоянный I/O отказ", () => {
    test("Неизменённый child не восстанавливается", () => {
      const viewPath = join(workspace.packageRoot("@example/view"), "package.json")
      expect(workspace.ioEvents.filter(({operation, path}) => operation === "rename" && path === viewPath).length, "View получил одну неуспешную запись; откат не повторяет запись неизменённого файла").toEqual(1)
      expect(workspace.manifestWrites.filter(({path}) => path === viewPath), "Неуспешный child остаётся нетронутым").toEqual([])
    })

    test("Читатель ждёт полного отката", () => {
      expect(intermediateRejected, "Barrier фиксирует root intent и уже изменённый host при старом view").toEqual(true)
      expect(queuedReaderWaited, "Принятый читатель не возвращает промежуточный состав").toEqual(true)
      expect(queuedReaderFailure, "После успешного отката читается прежний согласованный состав").toEqual(undefined)
      const expectedPackages = workspace.snapshot.published.flatMap(({artifact, name, env, version, sha256, size}) => artifact === "." && isBrowserPackageEnvironment(env) ? [{name, env, version, sha256, size}] : [])
      expect(queuedReader, "Читатель после постоянного отказа получает прежние точные версии и integrity всех browser roots").toEqual(expectedPackages)
    })

    test("Отказ отката child не блокирует откат root", async () => {
      let broken: Awaited<ReturnType<typeof releaseFixture>> | undefined
      try {
        broken = await releaseFixture(props.path, {
          async beforeRename(path) {
            if (path.endsWith(join("packages", "host", "package.json")) && (await Bun.file(path).json()).version === "1.0.1")
              throw new Error("EACCES: rollback-host")
          },
        })
        const rootPath = join(broken.root, "package.json")
        const previousRoot = await Bun.file(rootPath).text()
        const [publication, reader] = await Promise.allSettled([
          broken.release.publishPackages(broken.snapshot.request!.packages!),
          broken.release.releasedPackages(),
        ])
        expect(publication.status, "Исходный I/O отказ остаётся явной ошибкой публикации").toEqual("rejected")
        if (publication.status !== "rejected") throw new Error("Expected publication failure")
        expect(publication.reason instanceof AggregateError, "Ошибка объединяет исходную причину и отдельные ошибки отката").toEqual(true)
        const aggregate = publication.reason as AggregateError
        expect(aggregate.errors.length, "Сохранены исходный EACCES view и EACCES отката host").toEqual(2)
        expect(aggregate.cause, "Исходная причина не заменяется ошибкой rollback").toEqual(aggregate.errors[0])
        expect((aggregate.cause as Error).message, "Исходная причина указывает отказавший view").toMatch(/EACCES: write-child-manifest .*view.*package\.json/)
        expect((aggregate.errors[1] as Error).message, "Отдельная ошибка отката сохраняет stage, manifest и собственную причину").toMatch(/Child manifest rollback failed: .*host.*package\.json: EACCES: rollback-host/)
        expect(await Bun.file(rootPath).text(), "Root восстанавливается даже после отказа child rollback").toEqual(previousRoot)
        expect((await Bun.file(join(broken.packageRoot("@example/host"), "package.json")).json()).version, "Невозможный rollback не скрывает фактически оставшуюся новую child version").toEqual("1.0.1")
        expect(broken.manifestWrites.filter(({path}) => path === join(broken!.packageRoot("@example/view"), "package.json")), "Неизменённый view не переписывается и при дополнительном отказе rollback host").toEqual([])
        expect(reader.status, "Читатель явно отказывает на несогласованном составе вместо возврата смеси версий").toEqual("rejected")
      } finally {
        await broken?.cleanup()
      }
    })
  })

  describe.skipIf(name !== "Конфликт immutable artifact")("Пустой immutable target", () => {
    test("Занятая identity не перезаписывается", async () => {
      const staged = join(workspace.root, "staged-immutable.js")
      const target = join(workspace.root, "packages", "view", "dist", "versions", "1.0.99", "empty.js")
      await Bun.write(staged, "export const identity = true\n")
      await Bun.write(target, "")
      await expect(publishImmutableArtifact(staged, target), "Нулевой файл под занятой identity является конфликтом, а не отсутствующим output").rejects.toThrow("Immutable artifact is empty")
      expect(await Bun.file(target).text(), "Опубликованная identity сохраняет исходные bytes после отказа").toEqual("")
    })
  })

  /** @remarks Опубликованная версия потеряла подтверждённые bytes. */
  describe.skipIf(!["Потерянный artifact без копии", "Повреждённая сохранённая копия", "Потерянная запись опубликованной среды", "Повреждённая запись опубликованной среды", "Потерянный legacy artifact без receipt", "Потерянный static chunk старой версии", "Потерянный dynamic chunk старой версии", "Усечённый public graph receipt", "Усечённый generated graph receipt", "Потерянный trusted object", "Повреждённый trusted object", "Недостоверный legacy ready receipt", "Потерянные legacy roots при сохранившемся graph"].includes(name))("Запрет пересборки старой версии", () => {
    test("Сборщик не вызывается", () => {
      expect(
        workspace.builds.length,
        "При отсутствии достоверной копии ошибка остаётся явной; вызов compiler не используется как восстановление immutable версии",
      ).toEqual(0)
    })
  })
})
