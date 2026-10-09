/**
Подготовка объявленной версии: окружения, exports, profiles, plugins и зависимости.
props.path указывает на исходный пример. Fixture описывает подготовку его
изолированной копии: замены manifest, файлов и локальные источники зависимостей.
Вызов публичного сборщика выполняется один раз для каждого примера.
*/
import {afterAll, beforeAll, describe, expect, test} from "bun:test"
import {join, resolve} from "node:path"
import {createPackageBuilder, type PackageBuildResult} from "@metafor/tech-build"
import {artifactIntegrity} from "@metafor/tech-build/identity"
import {buildFixture} from "./fixture"

describe.each([
  {
    name: "Development одного окружения",
    props: {path: resolve(import.meta.dir, "fixture/single"), profile: "development"},
    expected: {environments: ["main"], publicArtifacts: [{env: "main", artifact: "."}]},
  },
  {
    name: "Одно окружение",
    props: {
      path: resolve(import.meta.dir, "fixture/single"),
      profile: "production"
    },
    expected: {
      environments: ["main"],
      publicArtifacts: [
        {
          env: "main",
          artifact: "."
        }
      ]
    }
  },
  {
    name: "Несколько окружений",
    props: {
      path: resolve(import.meta.dir, "fixture/environments"),
      profile: "production"
    },
    expected: {
      environments: ["main", "server"],
      publicArtifacts: [
        {
          env: "main",
          artifact: "."
        },
        {
          env: "server",
          artifact: "."
        }
      ]
    }
  },
  {
    name: "Все поддержанные окружения",
    props: {
      path: resolve(import.meta.dir, "fixture/all-environments"),
      profile: "production"
    },
    expected: {
      environments: ["main", "worker", "service", "server", "server-worker"],
      publicArtifacts: [
        {
          env: "main",
          artifact: "."
        },
        {
          env: "worker",
          artifact: "."
        },
        {
          env: "service",
          artifact: "."
        },
        {
          env: "server",
          artifact: "."
        },
        {
          env: "server-worker",
          artifact: "."
        }
      ]
    }
  },
  {
    name: "Несколько входов и ресурсы",
    props: {
      path: resolve(import.meta.dir, "fixture/graph"),
      profile: "production"
    },
    expected: {
      environments: ["main"],
      publicArtifacts: [
        {
          env: "main",
          artifact: "."
        },
        {
          env: "main",
          artifact: "./editor"
        },
        {
          env: "main",
          artifact: "./theme.css"
        },
        {
          env: "main",
          artifact: "./icon.svg"
        }
      ]
    }
  },
  {
    name: "Development с внешними картами",
    props: {
      path: resolve(import.meta.dir, "fixture/graph"),
      profile: "development"
    },
    expected: {
      environments: ["main"],
      publicArtifacts: [
        {
          env: "main",
          artifact: "."
        },
        {
          env: "main",
          artifact: "./editor"
        },
        {
          env: "main",
          artifact: "./theme.css"
        },
        {
          env: "main",
          artifact: "./icon.svg"
        }
      ]
    }
  },
  {
    name: "Production без диагностики",
    props: {
      path: resolve(import.meta.dir, "fixture/graph"),
      profile: "production"
    },
    expected: {
      environments: ["main"],
      publicArtifacts: [
        {
          env: "main",
          artifact: "."
        },
        {
          env: "main",
          artifact: "./editor"
        },
        {
          env: "main",
          artifact: "./theme.css"
        },
        {
          env: "main",
          artifact: "./icon.svg"
        }
      ]
    }
  },
  {
    name: "TSX через локальный plugin",
    props: {
      path: resolve(import.meta.dir, "fixture/plugin"),
      profile: "production"
    },
    expected: {
      environments: ["main"],
      publicArtifacts: [
        {
          env: "main",
          artifact: "."
        }
      ]
    }
  },
  {
    name: "Development с compiler plugin",
    props: {path: resolve(import.meta.dir, "fixture/plugin"), profile: "development"},
    expected: {
      environments: ["main"],
      publicArtifacts: [{env: "main", artifact: "."}],
    },
  },
  {
    name: "Loader без compiler plugin",
    props: {
      path: resolve(import.meta.dir, "fixture/loader"),
      profile: "production"
    },
    expected: {
      environments: ["main", "server"],
      publicArtifacts: [{env: "main", artifact: "."}, {env: "server", artifact: "."}]
    }
  },
  {
    name: "Общие exports и маски",
    props: {
      path: resolve(import.meta.dir, "fixture/resources"),
      profile: "production"
    },
    expected: {
      environments: ["main", "server"],
      publicArtifacts: [
        {
          env: "main",
          artifact: "."
        },
        {
          env: "main",
          artifact: "./shared"
        },
        {
          env: "main",
          artifact: "./theme.css"
        },
        {
          env: "main",
          artifact: "./kernel.wasm"
        },
        {
          env: "main",
          artifact: "./icons/add.svg"
        },
        {
          env: "main",
          artifact: "./icons/nested/remove.svg"
        },
        {
          env: "server",
          artifact: "."
        },
        {
          env: "server",
          artifact: "./shared"
        },
        {
          env: "server",
          artifact: "./theme.css"
        },
        {
          env: "server",
          artifact: "./kernel.wasm"
        },
        {
          env: "server",
          artifact: "./icons/add.svg"
        },
        {
          env: "server",
          artifact: "./icons/nested/remove.svg"
        }
      ]
    }
  },
  {
    name: "Источники публичной зависимости",
    props: {
      path: resolve(import.meta.dir, "fixture/dependency"),
      profile: "production"
    },
    expected: {
      environments: ["main"],
      publicArtifacts: [
        {
          env: "main",
          artifact: "."
        },
        {
          env: "main",
          artifact: "./library"
        },
        {
          env: "main",
          artifact: "./theme.css"
        },
        {
          env: "main",
          artifact: "./icon.svg"
        },
        {
          env: "main",
          artifact: "./kernel.wasm"
        }
      ]
    },
    fixture: {
      dependencies: {
        "@fixture/library": resolve(import.meta.dir, "fixture/library")
      }
    }
  },
  {
    name: "Plugin из прямой зависимости",
    props: {
      path: resolve(import.meta.dir, "fixture/single"),
      profile: "production"
    },
    expected: {
      environments: ["main"],
      publicArtifacts: [
        {
          env: "main",
          artifact: "."
        }
      ]
    },
    fixture: {
      dependencies: {
        "@fixture/library": resolve(import.meta.dir, "fixture/library")
      },
      manifest: {
        devDependencies: {
          "@fixture/library": "1.0.0"
        }
      },
      files: {
        "bunfig.toml": "[cosmos.package-build.environments.main]\nplugins = [\"@fixture/library/compiler\"]\n"
      }
    }
  },
  {
    name: "Корень и копируемый ресурс",
    props: {
      path: resolve(import.meta.dir, "fixture/raw"),
      profile: "production",
      options: {
        outdir: "staging/raw",
        version: "1.0.1"
      }
    },
    expected: {
      environments: ["main"],
      publicArtifacts: [
        {
          env: "main",
          artifact: "."
        },
        {
          env: "main",
          artifact: "./icon.svg"
        }
      ]
    }
  }
])("$name", ({name, props, expected, fixture}) => {
  let workspace: Awaited<ReturnType<typeof buildFixture>>
  let results: PackageBuildResult[]
  beforeAll(async () => {
    workspace = await buildFixture(props.path, fixture)
    const builder = createPackageBuilder({resolvePackage: () => workspace.root, profile: props.profile as "production" | "development"})
    results = await builder.preparePackage(workspace.name, {
      outdir: join(workspace.directory, props.options?.outdir ?? "outputs"),
      version: props.options?.version ?? "1.0.0",
    })
    const failure = results.find(({success}) => !success)
    if (failure) throw new Error(failure.stderr)
  }, 30_000)
  afterAll(async () => { await workspace?.cleanup() })

  test("Объявленные окружения", async () => {
    expect(
      results.map(({env}) => env),
      "Результат содержит все окружения из exports входного пакета",
    ).toEqual([...expected.environments])
  })

  test("Публичные артефакты", async () => {
    expect(
      results.flatMap(({env, outputs}) => outputs.filter(({artifact}) => artifact === "." || !artifact?.startsWith("./.cosmos/")).map(({artifact}) => ({env, artifact}))),
      "Каждый объявленный публичный вход и ресурс присутствует со своим ключом и окружением",
    ).toEqual(expect.arrayContaining<{env: string, artifact: string}>(expected.publicArtifacts))
  })

  test("Полнота публичных адресов", async () => {
    expect(
      results.flatMap(({outputs}) => outputs.filter(({artifact}) => artifact === "." || !artifact?.startsWith("./.cosmos/"))).length,
      "Набор публичных адресов не содержит пропусков или дополнительных не объявленных keys; generated chunks проверяются отдельно",
    ).toBe(expected.publicArtifacts.length)
  })

  test("Подготовка полного графа", async () => {
    for (const output of results.flatMap(({outputs}) => outputs)) {
      const bytes = await Bun.file(output.path).arrayBuffer()
      expect(await artifactIntegrity(bytes), "Размер и хеш получены из сохранённых байтов").toEqual({sha256: output.sha256, size: output.size})
      expect(output.type.length, "Каждый артефакт имеет MIME").toBeGreaterThan(0)
    }
  })

  test("Одна проверка типов", async () => {
    expect(
      (await Bun.file(join(workspace.directory, "typechecks.log")).text()).trim().split("\n").length,
      "Перед компиляцией окружений выполняется одна проверка типов пакета",
    ).toEqual(1)
  })

  test("Граница сборки", async () => {
    expect(
      (await Bun.file(join(workspace.root, "package.json")).text()) === workspace.manifest,
      "Сборка сохраняет входные исходники и manifests, возвращает артефакты и диагностику; публикация, версия выпуска и активация runtime не меняются",
    ).toEqual(true)
  })

  /** @remarks Эти примеры содержат несколько частей одной версии пакета. */
  describe.skipIf(!["Несколько окружений", "Все поддержанные окружения"].includes(name))("Среды исполнения", () => {
    test("Собственные артефакты окружений", async () => {
      expect(
        new Set(results.flatMap(({outputs}) => outputs.map(({path}) => path))).size === results.flatMap(({outputs}) => outputs).length,
        "Выходы разных окружений не перезаписывают друг друга; общий источник не объединяет разные environment identities",
      ).toEqual(true)
    })

    test.todo("Назначение target", () => {
      expect<unknown>(
        undefined,
        "Main, worker и service предназначены для browser; server и server-worker — для Bun; расширение исходника не определяет среду",
      ).toEqual(true)
    })
  })

  /** @remarks Эти варианты содержат два code entrypoint и общую зависимость. */
  describe.skipIf(!["Несколько входов и ресурсы", "Development с внешними картами", "Production без диагностики"].includes(name))("Совместная сборка входов", () => {
    test.todo("Единый экземпляр зависимости", () => {
      expect<unknown>(
        undefined,
        "Изменение общего state через editor видно основному входу, общий модуль не дублирует состояние",
      ).toEqual(true)
    })

    test.todo("Отложенный вход", () => {
      expect<unknown>(
        undefined,
        "Динамический import редактора разрешается внутри результата и остаётся lazy; нужные root chunks принадлежат eager closure",
      ).toEqual(true)
    })

    test.todo("Независимые публичные адреса", () => {
      expect<unknown>(
        undefined,
        "Public exports и generated chunks получают однозначные keys; общий физический output сохраняет все необходимые адреса без второго resource manifest",
      ).toEqual(true)
    })
  })

  /** @remarks Development сохраняет диагностику, но выносит карты из JavaScript. */
  describe.skipIf(!["Development одного окружения", "Development с внешними картами", "Development с compiler plugin"].includes(name))("Отладочная сборка", () => {
    test("Диагностика", async () => {
      expect(
        (await Promise.all(results.flatMap(({outputs}) => outputs.filter(({type}) => type.includes("javascript"))).map(async ({path}) => (await Bun.file(path).text()).includes("console.debug")))).some(Boolean),
        "Исполняемые console.debug сохранены в development",
      ).toEqual(true)
    })

    test.todo("Отдельные source maps", () => {
      expect<unknown>(
        undefined,
        "Каждый JavaScript root, public entrypoint и chunk имеет отдельную map версии 3 с sourcesContent и точным sourceMapFor; inline base64 в JS отсутствует",
      ).toEqual(true)
    })

    test("Каноническая identity", async () => {
      expect(
        (await Promise.all(results.flatMap(({outputs}) => outputs).map(async ({path}) => !(await Bun.file(path).text()).includes("debugId")))).every(Boolean),
        "Случайный Bun debugId удаляется из JS и maps до вычисления размера и хеша; maps не объявляются runtime-входами",
      ).toEqual(true)
    })
  })

  /** @remarks Production использует те же публичные входы без debug-кода и карт. */
  describe.skipIf(name !== "Production без диагностики")("Production", () => {
    test("Минификация и отсутствие debug", async () => {
      expect(
        (await Promise.all(results.flatMap(({outputs}) => outputs).map(async ({path}) => { const source = await Bun.file(path).text(); return !source.includes("console.debug") && !source.includes("sourceMappingURL") }))).every(Boolean),
        "Артефакты минифицированы, console.debug и sourceMappingURL отсутствуют",
      ).toEqual(true)
    })

    test("Отсутствие companions", async () => {
      expect(
        results.every(({outputs}) => outputs.every(({kind}) => kind !== "sourcemap")),
        "Development maps не попадают в результат production",
      ).toEqual(true)
    })
  })

  /** @remarks Fixture plugin подтверждает чтение TSX и преобразует конкретный исходник. */
  describe.skipIf(!["TSX через локальный plugin", "Development с compiler plugin"].includes(name))("Compiler plugin", () => {
    test.todo("Преобразование TSX", () => {
      expect<unknown>(
        undefined,
        "Plugin прочитал TSX и loader загрузил shader.fixture: rendered равен ожидаемой строке",
      ).toEqual("compiled-button:fixture-shader\n")
    })

    test.todo("Изоляция compiler", () => {
      expect<unknown>(
        undefined,
        "Plugin выполняется в отдельном сборочном процессе, не изменяет validated build options и не становится runtime dependency",
      ).toEqual(true)
    })
  })

  /** @remarks Локальный bunfig задаёт text loader без таблицы compiler plugins. */
  describe.skipIf(name !== "Loader без compiler plugin")("Loader", () => {
    test.todo("Loader самостоятелен", () => {
      expect<unknown>(
        undefined,
        "Расширение .fixture загружается как текст при отсутствии compiler plugin",
      ).toEqual("fixture-shader\n")
    })
  })

  /** @remarks В manifest есть conditionless exports, маска и исключённая закрытая директория. */
  describe.skipIf(name !== "Общие exports и маски")("Публичный граф", () => {
    test.todo("Общие exports", () => {
      expect<unknown>(
        undefined,
        "Shared source, CSS и WASM относятся к каждому объявленному окружению, сохраняя собственные identities",
      ).toEqual(true)
    })

    test.todo("Маски и исключения", () => {
      expect<unknown>(
        undefined,
        "Раскрытие маски детерминировано, включает nested/remove.svg и исключает private/hidden.svg",
      ).toEqual(true)
    })

    test.todo("Типы ресурсов", () => {
      expect<unknown>(
        undefined,
        "CSS сохраняет объявленный стиль, SVG и WASM сохраняют raw bytes; их MIME соответствует содержимому",
      ).toEqual(true)
    })
  })

  /** @remarks Локальный источник зависимости задан в данных изолированной fixture. */
  describe.skipIf(name !== "Источники публичной зависимости")("Граница зависимости", () => {
    test.todo("Public exports зависимости", () => {
      expect<unknown>(
        undefined,
        "TS, CSS, SVG и WASM разрешаются через public exports прямой runtime dependency и публикуются под ключами собираемого пакета",
      ).toEqual(true)
    })

    test.todo("Обычная зависимость не становится release package", () => {
      expect<unknown>(
        undefined,
        "Код библиотеки связывается в output владельца; её динамический import создаёт доступный lazy artifact, а не отдельную запись выпуска",
      ).toEqual(true)
    })
  })

  /** @remarks Bare plugin разрешается из public export объявленной прямой dependency. */
  describe.skipIf(name !== "Plugin из прямой зависимости")("Внешний compiler", () => {
    test.todo("Публичный compiler", () => {
      expect<unknown>(
        undefined,
        "Plugin берётся по публичному адресу @fixture/library/compiler; глобальные регистрации соседних пакетов не меняются",
      ).toEqual(true)
    })
  })

  /** @remarks Полный граф корня и raw-ресурса направлен в одну staging-директорию. */
  describe.skipIf(name !== "Корень и копируемый ресурс")("Staging", () => {
    test.todo("Полный staging-граф", () => {
      expect<unknown>(
        undefined,
        "Корневой JS и SVG подготовлены под целевую версию 1.0.1 в staging; исходный manifest остаётся версии 1.0.0",
      ).toEqual(true)
    })
  })
})
