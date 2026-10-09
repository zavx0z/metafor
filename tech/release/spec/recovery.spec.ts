/** Продолжение незавершённой публикации и восстановление сохранённых байтов без пересборки опубликованных версий. */
import {afterAll, beforeAll, describe, expect, test} from "bun:test"
import {resolve} from "node:path"
import {releaseFixture} from "./fixture"
import {
  fileProof,
  filesBefore,
  completeArtifacts,
  expectPreserved,
  expectSnapshotArtifacts,
  runtimeBoundary,
  type FileProof,
} from "./evidence"
import type {PackageBuildArtifact} from "@metafor/tech-build"

describe.each([
  {
    name: "Прерывание до подготовки",
    props: {
      path: resolve(import.meta.dir, "fixture/resume-before.json"),
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
    name: "Прерывание после части окружений",
    props: {
      path: resolve(import.meta.dir, "fixture/resume-partial.json"),
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
    name: "Подготовка завершена до прерывания",
    props: {
      path: resolve(import.meta.dir, "fixture/resume-prepared.json"),
    },
    expected: {
      versions: {
        "@example/host": "1.0.0",
        "@example/view": "1.0.1",
      },
      buildPackages: [],
    },
  },
  {
    name: "Публикация файлов прервана",
    props: {
      path: resolve(import.meta.dir, "fixture/resume-files.json"),
    },
    expected: {
      versions: {
        "@example/host": "1.0.0",
        "@example/view": "1.0.1",
      },
      buildPackages: [],
    },
  },
  {
    name: "Публикация завершилась до потери ответа",
    props: {
      path: resolve(import.meta.dir, "fixture/resume-completed.json"),
    },
    expected: {
      versions: {
        "@example/host": "1.0.0",
        "@example/view": "1.0.1",
      },
      buildPackages: [],
    },
  },
  {
    name: "Обычный запуск готового выпуска",
    props: {
      path: resolve(import.meta.dir, "fixture/resume-ready.json"),
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
    name: "Потерянный опубликованный артефакт восстановлен",
    props: {
      path: resolve(import.meta.dir, "fixture/restore-published.json"),
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
    name: "Два адреса одних байтов",
    props: {
      path: resolve(import.meta.dir, "fixture/aliases.json"),
    },
    expected: {
      versions: {
        "@example/host": "1.0.0",
        "@example/view": "1.0.1",
      },
      buildPackages: [],
    },
  },
  {
    name: "Хранилище без hardlinks",
    props: {
      path: resolve(import.meta.dir, "fixture/copy-fallback.json"),
    },
    expected: {
      versions: {
        "@example/host": "1.0.0",
        "@example/view": "1.0.1",
      },
      buildPackages: [],
    },
  },
])("$name", ({name, props, expected}) => {
  let workspace: Awaited<ReturnType<typeof releaseFixture>>
  let versions: Record<string, string>
  let before: Map<string, FileProof>
  let artifacts: PackageBuildArtifact[]
  let effects: string[]
  beforeAll(async () => {
    workspace = await releaseFixture(props.path)
    before = await filesBefore(workspace.root)
    const guard = runtimeBoundary()
    effects = guard.effects
    try {
      await workspace.release.recoverPublication()
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

  test("Сохранность результата", async () => {
    await expectPreserved(before)
    await expectSnapshotArtifacts(workspace)
    await completeArtifacts(workspace, versions)
  })

  /** @remarks Main новой версии подтверждён, server ещё не подготовлен. */
  describe.skipIf(name !== "Прерывание после части окружений")("Частичная подготовка", () => {
    test("Незавершённое окружение", async () => {
      expect(
        workspace.builds.map(({env}) => env),
        "Компилируется только неподготовленный server",
      ).toEqual(["server"])
    })
  })

  /** @remarks Все результаты сборки новой версии уже подтверждены. */
  describe.skipIf(
    !["Подготовка завершена до прерывания", "Публикация файлов прервана"].includes(name),
  )("Завершение публикации", () => {
    test("Без повторной компиляции", async () => {
      expect(workspace.builds.length, "Все сохранённые части используются без compiler").toBe(0)
    })

    test("Существующие точные байты", async () => {
      await expectPreserved(before)
      await expectSnapshotArtifacts(workspace)
    })
  })

  /** @remarks Опубликованный состав уже соответствует сохранённой цели. */
  describe.skipIf(
    !["Публикация завершилась до потери ответа", "Обычный запуск готового выпуска"].includes(name),
  )("Завершённый выпуск", () => {
    test("Нет повторной публикации", async () => {
      expect(workspace.manifestWrites, "Готовый состав не меняет root или child versions").toEqual(
        [],
      )
      expect(workspace.builds, "Готовые артефакты не пересобираются").toEqual([])
      expect(effects, "Восстановление не отправляет runtime/network сигналы").toEqual([])
      await expectPreserved(before)
    })
  })

  /** @remarks Точная копия потерянного файла доступна в хранилище. */
  describe.skipIf(name !== "Потерянный опубликованный артефакт восстановлен")(
    "Восстановление байтов",
    () => {
      test("Точная сохранённая копия", async () => {
        for (const saved of workspace.snapshot.storageCopies ?? []) {
          const output = artifacts.find(({sha256}) => sha256 === saved.sha256)!
          expect(before.has(output.path), "В начале опубликованного файла не было").toBe(false)
          expect(await Bun.file(output.path).text(), "Восстановлены точные сохранённые bytes").toBe(
            saved.bytes,
          )
          const proof = await fileProof(output.path)
          expect(
            {sha256: proof.sha256, size: proof.size},
            "Восстановлена прежняя identity",
          ).toEqual({sha256: saved.sha256, size: saved.size})
        }
        expect(workspace.builds, "Исходники не компилируются ради восстановления").toEqual([])
      })
    },
  )

  /** @remarks Public CSS и generated CSS имеют одинаковые bytes и разные identities. */
  describe.skipIf(!["Два адреса одних байтов", "Хранилище без hardlinks"].includes(name))(
    "Материализация aliases",
    () => {
      test("Доступность обоих адресов", async () => {
        const css = artifacts.filter(
          ({artifact}) => artifact === "./theme.css" || artifact === "./.cosmos/chunk/theme.css",
        )
        expect(css.length, "Public и generated адреса существуют отдельно").toBe(2)
        expect(
          new Set(css.map(({path}) => path)).size,
          "Оба адреса разрешаются в собственные пути",
        ).toBe(2)
        const contents = await Promise.all(css.map(({path}) => Bun.file(path).text()))
        expect(contents[0], "Оба адреса содержат одинаковые подтверждённые bytes").toBe(contents[1])
      })

      test("Поддержка хранилища", async () => {
        const css = artifacts.filter(
          ({artifact}) => artifact === "./theme.css" || artifact === "./.cosmos/chunk/theme.css",
        )
        const proofs = await Promise.all(css.map(({path}) => fileProof(path)))
        expect(
          proofs[0]!.inode === proofs[1]!.inode,
          "Фактическое совместное хранение соответствует возможностям файловой системы",
        ).toBe(workspace.snapshot.storageSupportsHardlinks!)
        expect(
          workspace.ioEvents.some(({operation}) => operation === "link"),
          "Использована настоящая попытка hardlink",
        ).toBe(true)
        expect(
          proofs.map(({sha256, size}) => ({sha256, size})),
          "Копирование и hardlink сохраняют один контент",
        ).toEqual([
          {sha256: css[0]!.sha256, size: css[0]!.size},
          {sha256: css[0]!.sha256, size: css[0]!.size},
        ])
      })
    },
  )
})
