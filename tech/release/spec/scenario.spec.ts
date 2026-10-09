/** Первый выпуск, обновление и использование готовой версии. Правило нулевой пересборки заменяет прежнюю cold recovery Cosmos. */
import {afterAll, beforeAll, describe, expect, test} from "bun:test"
import {join, resolve} from "node:path"
import {releaseFixture} from "./fixture"
import {
  filesBefore,
  completeArtifacts,
  expectPreserved,
  expectSnapshotArtifacts,
  expectPublicationOrder,
  runtimeBoundary,
  type FileProof,
} from "./evidence"
import type {PackageBuildArtifact} from "@metafor/tech-build"

describe.each([
  {
    name: "Готовые артефакты без локальных записей",
    props: {path: resolve(import.meta.dir, "fixture/legacy-ready.json")},
    expected: {
      versions: {"@example/host": "1.0.0", "@example/view": "1.0.0"},
      buildPackages: [],
    },
  },
  {
    name: "Изменён тип export готовой версии",
    props: {path: resolve(import.meta.dir, "fixture/legacy-exports-changed.json")},
    expected: {
      versions: {"@example/host": "1.0.0", "@example/view": "1.0.0"},
      buildPackages: [],
    },
  },
  {
    name: "Удалён export готовой версии",
    props: {path: resolve(import.meta.dir, "fixture/legacy-exports-removed.json")},
    expected: {
      versions: {"@example/host": "1.0.0", "@example/view": "1.0.0"},
      buildPackages: [],
    },
  },
  {
    name: "Первый выпуск",
    props: {
      path: resolve(import.meta.dir, "fixture/first.json"),
    },
    expected: {
      versions: {
        "@example/host": "1.0.0",
        "@example/view": "1.0.0",
      },
      buildPackages: ["@example/host", "@example/view"],
    },
  },
  {
    name: "Первый выпуск с готовым пакетом",
    props: {
      path: resolve(import.meta.dir, "fixture/first-with-ready.json"),
    },
    expected: {
      versions: {
        "@example/host": "1.0.0",
        "@example/view": "1.0.0",
      },
      buildPackages: ["@example/host"],
    },
  },
  {
    name: "Новая версия одного пакета",
    props: {
      path: resolve(import.meta.dir, "fixture/update-one.json"),
    },
    expected: {
      versions: {
        "@example/host": "1.0.0",
        "@example/view": "1.0.1",
      },
      buildPackages: ["@example/view"],
    },
  },
  {
    name: "Группа новых версий",
    props: {
      path: resolve(import.meta.dir, "fixture/update-group.json"),
    },
    expected: {
      versions: {
        "@example/host": "1.0.1",
        "@example/view": "1.0.1",
      },
      buildPackages: ["@example/host", "@example/view"],
    },
  },
  {
    name: "Повтор готового состава",
    props: {
      path: resolve(import.meta.dir, "fixture/unchanged.json"),
    },
    expected: {
      versions: {
        "@example/host": "1.0.0",
        "@example/view": "1.0.0",
      },
      buildPackages: [],
    },
  },
  {
    name: "Исходники изменились без новой версии",
    props: {
      path: resolve(import.meta.dir, "fixture/source-changed.json"),
    },
    expected: {
      versions: {
        "@example/host": "1.0.0",
        "@example/view": "1.0.0",
      },
      buildPackages: [],
    },
  },
  {
    name: "TSDoc изменён без новой версии",
    props: {
      path: resolve(import.meta.dir, "fixture/docs-changed.json"),
    },
    expected: {
      versions: {
        "@example/host": "1.0.0",
        "@example/view": "1.0.0",
      },
      buildPackages: [],
    },
  },
  {
    name: "Профиль запуска изменён без новой версии",
    props: {
      path: resolve(import.meta.dir, "fixture/profile-changed.json"),
    },
    expected: {
      versions: {
        "@example/host": "1.0.0",
        "@example/view": "1.0.0",
      },
      buildPackages: [],
    },
  },
])("$name", ({name, props, expected}) => {
  let workspace: Awaited<ReturnType<typeof releaseFixture>>
  let versions: Record<string, string>
  let before: Map<string, FileProof>
  let artifacts: PackageBuildArtifact[]
  let observed: Record<string, string>
  let effects: string[]
  beforeAll(async () => {
    workspace = await releaseFixture(props.path)
    before = await filesBefore(workspace.root)
    const guard = runtimeBoundary()
    effects = guard.effects
    try {
      const request = workspace.snapshot.request
      const operation = request?.packages
        ? workspace.release.publishPackages(request.packages)
        : workspace.release.recoverPublication()
      const reader = workspace.release.releasedPackages()
      const [completion, observation] = await Promise.allSettled([operation, reader])
      if (completion.status === "rejected") throw completion.reason
      if (observation.status === "rejected") throw observation.reason
      const result = completion.value
      if ("success" in result && !result.success) throw new Error(JSON.stringify(result.results))
      observed = Object.fromEntries(observation.value.map(({name, version}) => [name, version]))
    } finally {
      guard.restore()
    }
    versions = Object.fromEntries(
      (await workspace.release.readReleaseComposition()).map(({name, version}) => [name, version]),
    )
    artifacts = await completeArtifacts(workspace, versions)
  }, 30_000)
  afterAll(async () => {
    await workspace?.cleanup()
  })

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

  test("Полнота артефактов", async () => {
    expect(
      artifacts.length,
      "Состав имеет подтверждённые outputs каждого окружения",
    ).toBeGreaterThan(0)
    await completeArtifacts(workspace, versions)
  })

  test("Сохранение предшественника", async () => {
    await expectPreserved(before)
    await expectSnapshotArtifacts(workspace)
  })

  test("Порядок публикации", async () => {
    expectPublicationOrder(
      workspace,
      versions,
      artifacts.map(({path}) => path),
    )
    expect(observed, "Ожидающий читатель получает один согласованный результат").toEqual(
      expected.versions,
    )
  })

  test("Граница выпуска", async () => {
    expect(
      effects,
      "Выпуск не обращается к fetch, WebSocket, Cache Storage или browser runtime",
    ).toEqual([])
  })

  /** @remarks До операции нет опубликованного полного состава. */
  describe.skipIf(!["Первый выпуск", "Первый выпуск с готовым пакетом"].includes(name))(
    "Первоначальный выпуск",
    () => {
      test("Начальные версии", async () => {
        expect(versions, "Первый выпуск использует назначенные начальные версии").toEqual(
          workspace.snapshot.childVersions,
        )
      })
    },
  )

  /** @remarks Одна версия уже существует в immutable storage до создания первого состава. */
  describe.skipIf(name !== "Первый выпуск с готовым пакетом")("Готовый участник", () => {
    test("Повторное использование", async () => {
      expect(
        workspace.builds.filter(({name}) => name === "@example/view"),
        "Готовый view не компилируется",
      ).toEqual([])
      await expectPreserved(new Map([...before].filter(([path]) => path.includes("/view/"))))
    })
  })

  /** @remarks Явный запрос меняет версии выбранных участников. */
  describe.skipIf(!["Новая версия одного пакета", "Группа новых версий"].includes(name))(
    "Обновление",
    () => {
      test("Согласованное изменение", async () => {
        expect(observed, "Читатель не получает смесь версий группы").toEqual(expected.versions)
        expect(
          Object.fromEntries(
            await Promise.all(
              Object.keys(expected.versions).map(async (name) => [
                name,
                (await Bun.file(join(workspace.packageRoot(name), "package.json")).json()).version,
              ]),
            ),
          ),
          "Версии manifests совпадают с выбранным составом",
        ).toEqual(expected.versions)
      })

      test("Сохранность старых адресов", async () => {
        for (const name of Object.keys(expected.versions)) {
          const path = join(workspace.packageRoot(name), "package.json")
          const source = await Bun.file(path).text()
          try {
            const manifest = JSON.parse(source)
            manifest.exports = {".": {"example:server": "./server/index.ts"}}
            manifest.scripts["build:server"] = manifest.scripts["build:server"].replace(
              /dist[^ ]+/,
              "elsewhere/root.js",
            )
            await Bun.write(path, JSON.stringify(manifest))
            await expectSnapshotArtifacts(workspace)
          } finally {
            await Bun.write(path, source)
          }
        }
      })
    },
  )

  /** @remarks Во всех этих случаях целевые версии уже опубликованы. */
  describe.skipIf(
    ![
      "Повтор готового состава",
      "Исходники изменились без новой версии",
      "TSDoc изменён без новой версии",
      "Профиль запуска изменён без новой версии",
    ].includes(name),
  )("Готовый выпуск", () => {
    test("Ноль вызовов сборщика", async () => {
      expect(workspace.builds, "Ни typecheck, ни compiler готового состава не вызывается").toEqual(
        [],
      )
    })

    test("Карты принадлежат выпуску", async () => {
      await expectPreserved(before)
      for (const map of workspace.snapshot.maps ?? []) {
        const record = (await workspace.storage.read(map.name, map.version)).find(
          ({env}) => env === map.env,
        )!
        const output = record.outputs.find(({sourceMapFor}) => sourceMapFor === map.sourceMapFor)!
        expect(
          await Bun.file(output.path).text(),
          "Карта хранит source именно опубликованной версии",
        ).toBe(map.bytes)
      }
    })
  })
})
