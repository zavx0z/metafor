/** Очередь публикации, повтор участника и чтение согласованного состояния. */
import {afterAll, beforeAll, describe, expect, test} from "bun:test"
import {join, resolve} from "node:path"
import {releaseFixture} from "./fixture"
import type {PackageReleaseResultSet, PackageChange} from "../contracts"

describe.each([
  {
    name: "Два одновременных запроса patch",
    props: {
      path: resolve(import.meta.dir, "fixture/unchanged.json"),
      requests: [
        {
          packages: [
            {
              name: "@example/view",
              change: "patch"
            }
          ]
        },
        {
          packages: [
            {
              name: "@example/view",
              change: "patch"
            }
          ]
        }
      ]
    },
    fixture: {execution: "parallel", holdFirstPublicationUntilRequests: 2},
    expected: {
      versions: ["1.0.1", "1.0.2"]
    }
  },
  {
    name: "Повтор участника с одинаковым изменением",
    props: {
      path: resolve(import.meta.dir, "fixture/unchanged.json"),
      requests: [
        {
          packages: [
            {
              name: "@example/view",
              change: "patch"
            },
            {
              name: "@example/view",
              change: "patch"
            }
          ]
        }
      ]
    },
    expected: {
      versions: ["1.0.1"]
    }
  },
  {
    name: "Запрос после отказа предыдущего",
    props: {
      path: resolve(import.meta.dir, "fixture/build-failed.json"),
      requests: [
        {
          packages: [
            {
              name: "@example/view",
              change: "patch"
            }
          ]
        }
      ]
    },
    expected: {
      versions: ["1.0.1"]
    }
  },
  {
    name: "Запрос после ошибки записи предыдущего",
    props: {
      path: resolve(import.meta.dir, "fixture/manifest-write-failed.json"),
      requests: [{packages: [{name: "@example/view", change: "patch"}]}],
    },
    expected: {versions: ["1.0.1"]},
  },
])("$name", ({name, props, expected}) => {
  let workspace: Awaited<ReturnType<typeof releaseFixture>>
  let results: PackageReleaseResultSet[]
  let readerVersions: Record<string, string>
  let readerWaited = false
  let intermediateCompositionRejected = false
  let previousFailed = false
  let queueCompleted = false

  beforeAll(async () => {
    let hold = false
    let blocked = false
    let signalEntered!: () => void
    let unblock!: () => void
    const entered = new Promise<void>((resolve) => { signalEntered = resolve })
    const gate = new Promise<void>((resolve) => { unblock = resolve })
    workspace = await releaseFixture(props.path, {
      async afterRename(path) {
        if (hold && !blocked && path === join(workspace.root, "package.json")) {
          blocked = true
          signalEntered()
          await gate
        }
      },
    })
    if (name.startsWith("Запрос после")) {
      try {
        const previous = await workspace.release.publishPackages(workspace.snapshot.request!.packages!)
        previousFailed = !previous.success
      } catch {
        previousFailed = true
      }
      await workspace.clearBuildFailures()
    }
    hold = true
    const operations = props.requests.map(({packages}) => workspace.release.publishPackages([...packages] as PackageChange[]))
    await entered
    let readerSettled = false
    const reader = workspace.release.releasedPackages().then((packages) => {
      readerSettled = true
      return packages
    }, (error) => {
      readerSettled = true
      throw error
    })
    // Прямое чтение завершается на durable root intent со старыми child versions.
    // Читатель в обход очереди увидел бы то же несогласованное состояние.
    try { await workspace.release.readReleaseComposition() } catch { intermediateCompositionRejected = true }
    readerWaited = !readerSettled
    unblock()
    results = await Promise.all(operations)
    const packages = await reader
    readerVersions = Object.fromEntries(packages.map(({name, version}) => [name, version]))
    await workspace.release.waitForPublication()
    queueCompleted = true
  }, 30_000)
  afterAll(async () => { await workspace?.cleanup() })

  test("Порядок версий", () => {
    expect(
      results.map(({results}) => [...new Set(results.map(({version}) => version))]).flat(),
      "Операции публикации сериализованы; новый запрос использует последнюю подтверждённую версию, а повтор участника внутри одной группы не увеличивает её дважды",
    ).toEqual([...expected.versions])
    expect(results.every(({success}) => success), "Каждый принятый корректный запрос завершился полным выпуском").toEqual(true)
    const environments = results.map(({results}) => results.map(({module, env}) => `${module}:${env}`))
    expect(environments.every((entries) => entries.length === new Set(entries).size), "Одинаковый участник внутри группы проходит каждое окружение ровно один раз").toEqual(true)
  })

  test("Чтение во время публикации", () => {
    expect(intermediateCompositionRejected, "Barrier удерживает реальное промежуточное состояние root intent и старых child versions").toEqual(true)
    expect(
      readerWaited,
      "Читатель ожидает завершения принятой операции и получает полный доказанный состав, а не промежуточные root/child versions",
    ).toEqual(true)
    expect(readerVersions, "Читатель видит последний полный выпуск после всех принятых операций").toEqual({
      "@example/host": "1.0.0",
      "@example/view": expected.versions.at(-1)!,
    })
  })

  test("Освобождение очереди", () => {
    expect(
      queueCompleted,
      "После успеха или ошибки следующий принятый запрос получает возможность выполниться",
    ).toEqual(true)
  })

  describe.skipIf(!name.startsWith("Запрос после"))("Восстановление после отказа", () => {
    test("Предыдущий запрос действительно отказал", () => {
      expect(previousFailed, "Очередь освобождается после фактически выполненного неуспешного запроса").toEqual(true)
    })
  })
})
