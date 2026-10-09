/**
Подготовка объявленной версии: окружения, exports, profiles, plugins и зависимости.
props.path указывает на исходный пример. Fixture описывает подготовку его
изолированной копии: замены manifest, файлов и локальные источники зависимостей.
Вызов публичного сборщика выполняется один раз для каждого примера.
*/
import {afterAll, beforeAll, describe, expect, test} from "bun:test"
import {isAbsolute, join, relative, resolve} from "node:path"
import {createPackageBuilder, type PackageBuildResult} from "@metafor/tech-build"
import {artifactIntegrity} from "@metafor/tech-build/identity"
import {buildFixture, executeBuildFixture, snapshotBuildInputs} from "./fixture"
import {browserPackageArtifactUrl} from "@metafor/tech-build/identity"

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
    },
    fixture: {dependencies: {"@fixture/library": resolve(import.meta.dir, "fixture/library")}}
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
    },
    fixture: {dependencies: {"@fixture/library": resolve(import.meta.dir, "fixture/library")}}
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
    name: "Будущая версия одного входа с compiler plugin",
    props: {
      path: resolve(import.meta.dir, "fixture/plugin"),
      profile: "production",
      options: {outdir: "staging/plugin", version: "1.0.1"},
    },
    expected: {
      environments: ["main"],
      publicArtifacts: [{env: "main", artifact: "."}],
    },
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
      await snapshotBuildInputs(workspace.root),
      "Сборка сохраняет входные исходники и manifests, возвращает артефакты и диагностику; публикация, версия выпуска и активация runtime не меняются",
    ).toEqual(workspace.inputs)
  })

  /** @remarks Эти примеры содержат несколько частей одной версии пакета. */
  describe.skipIf(!["Несколько окружений", "Все поддержанные окружения"].includes(name))("Среды исполнения", () => {
    test("Собственные артефакты окружений", async () => {
      expect(
        new Set(results.flatMap(({outputs}) => outputs.map(({path}) => path))).size === results.flatMap(({outputs}) => outputs).length,
        "Выходы разных окружений не перезаписывают друг друга; общий источник не объединяет разные environment identities",
      ).toEqual(true)
    })

    test("Назначение target", async () => {
      const targets = await executeBuildFixture<Record<string, string>>(
        workspace.directory, results, "1.0.0",
        'const targets = {}; for (const env of '+JSON.stringify(expected.environments)+') targets[env] = (await load(env)).target; return targets',
      )
      expect(targets, "Target выбирает browser или bun public condition зависимости независимо от .ts исходника").toEqual(
        Object.fromEntries(expected.environments.map((env) => [env, env === "server" || env === "server-worker" ? "bun" : "browser"])),
      )
    })
  })

  /** @remarks Эти варианты содержат два code entrypoint и общую зависимость. */
  describe.skipIf(!["Несколько входов и ресурсы", "Development с внешними картами", "Production без диагностики"].includes(name))("Совместная сборка входов", () => {
    test("Единый экземпляр зависимости", async () => {
      const actual = await executeBuildFixture(workspace.directory, results, "1.0.0", `
        const root = await load("main")
        const lazyEditor = await root.openEditor()
        const publicEditor = await load("main", "./editor")
        const first = lazyEditor.increment()
        const second = publicEditor.increment()
        return {first, second, current: root.currentValue(), sameModule: lazyEditor === publicEditor}
      `)
      expect(actual, "Lazy и публичный editor изменяют общий экземпляр state, видимый root").toEqual({first: 1, second: 2, current: 2, sameModule: true})
    })

    test("Отложенный вход", async () => {
      const actual = await executeBuildFixture(workspace.directory, results, "1.0.0", `
        const root = await load("main")
        const before = globalThis.__fixtureEditorLoads ?? 0
        await root.openEditor()
        return {before, after: globalThis.__fixtureEditorLoads}
      `)
      expect(actual, "Import editor остаётся lazy и разрешается только после openEditor").toEqual({before: 0, after: 1})
      const code = results[0]!.outputs.filter(({type}) => type.includes("javascript"))
      expect(code.find(({artifact}) => artifact === ".")?.load, "Root принадлежит eager closure").toBe("eager")
      expect(code.find(({artifact}) => artifact === "./editor")?.load, "Отложенный public editor не принадлежит eager closure").toBe("lazy")
      expect(code.some(({kind, load}) => kind === "chunk" && load === "eager"), "Общий state chunk входит в eager closure root").toBe(true)
    })

    test("Независимые публичные адреса", () => {
      const outputs = results[0]!.outputs.filter(({kind}) => kind !== "sourcemap")
      const keys = outputs.map(({artifact}) => artifact)
      const urls = keys.map((artifact) => browserPackageArtifactUrl(workspace.name, "main", artifact!, "1.0.0"))
      expect(new Set(keys).size, "Каждый public export и generated chunk получает один однозначный key").toBe(keys.length)
      expect(new Set(urls).size, "Каждому key соответствует независимый canonical URL").toBe(keys.length)
      expect(outputs.filter(({kind}) => kind === "chunk").every(({artifact}) => artifact?.startsWith("./.cosmos/")), "Общие chunks адресуются generated keys без resource manifest").toBe(true)
      expect(keys, "Публичные адреса сохраняются при разделении общего output graph").toEqual(expect.arrayContaining([".", "./editor", "./theme.css", "./icon.svg"]))
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

    test("Отдельные source maps", async () => {
      for (const {outputs} of results) {
        const javascript = outputs.filter(({type}) => type.includes("javascript"))
        const maps = outputs.filter(({kind}) => kind === "sourcemap")
        expect(maps.length, "Каждый JavaScript output имеет ровно одну внешнюю map").toBe(javascript.length)
        for (const output of javascript) {
          const source = await Bun.file(output.path).text()
          const companions = maps.filter(({sourceMapFor}) => sourceMapFor === output.artifact)
          expect(companions.length, "Map относится к точному root, public entrypoint или chunk").toBe(1)
          const companion = companions[0]!
          const map = await Bun.file(companion.path).json()
          expect(map.version, "Карта имеет стандартную версию 3").toBe(3)
          expect(map.sourcesContent?.length, "Карта сохраняет содержимое всех исходников").toBe(map.sources.length)
          expect(map.sourcesContent.every((content: unknown) => typeof content === "string"), "sourcesContent содержит реальные исходные тексты").toBe(true)
          expect(source.includes("data:application/json"), "Inline base64 map отсутствует в JavaScript").toBe(false)
          expect(companion.artifact?.startsWith("./.cosmos/"), "Map имеет companion identity вне публичных runtime exports").toBe(true)
          expect(companion.kind, "Map не объявлена исполняемым entry-point или chunk").toBe("sourcemap")
        }
      }
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

    test("Минификация JavaScript", async () => {
      const sources = await Promise.all(results.flatMap(({outputs}) => outputs.filter(({type}) => type.includes("javascript"))).map(async ({path}) => await Bun.file(path).text()))
      expect(sources.every((source) => !/^\s{2,}\S/m.test(source)), "JavaScript outputs не содержат форматирующих отступов").toBe(true)
      expect(sources.some((source) => source.includes("state.value") || source.includes("function increment")), "Минификация сокращает локальные identifiers fixture, сохраняя public exports").toBe(false)
    })

    test("Отсутствие companions", async () => {
      expect(
        results.every(({outputs}) => outputs.every(({kind}) => kind !== "sourcemap")),
        "Development maps не попадают в результат production",
      ).toEqual(true)
    })
  })

  /** @remarks Fixture plugin подтверждает чтение TSX и преобразует конкретный исходник. */
  describe.skipIf(!["TSX через локальный plugin", "Development с compiler plugin", "Будущая версия одного входа с compiler plugin"].includes(name))("Compiler plugin", () => {
    test("Преобразование TSX", async () => {
      const actual = await executeBuildFixture(workspace.directory, results, props.options?.version ?? "1.0.0", 'return (await load("main")).rendered')
      expect(actual, "Plugin прочитал настоящий TSX и text loader загрузил shader.fixture").toBe("compiled-button:fixture-shader\n")
    })

    test("Изоляция compiler", async () => {
      const record = await Bun.file(join(workspace.directory, "compiler.json")).json()
      expect(record.pid, "Compiler plugin выполняется в отдельном процессе").not.toBe(process.pid)
      expect(record.unchanged, "Validated options не изменились после попыток plugin").toBe(true)
      expect(record.rejected.length, "Запись target, entrypoints и loaders запрещена").toBe(3)
      expect(record.rejected.every((message: string) => message.includes("validated build plan")), "Все изменения блокирует защита build plan").toBe(true)
      expect((globalThis as {__fixtureCompilerPid?: number}).__fixtureCompilerPid, "Plugin не зарегистрирован в тестовом процессе").toBeUndefined()
      const runtime = await executeBuildFixture(workspace.directory, results, props.options?.version ?? "1.0.0", 'await load("main"); return globalThis.__fixtureCompilerPid ?? null')
      expect(runtime, "Compiler plugin не становится runtime dependency").toBeNull()
    })
  })

  /** @remarks Один plugin-enabled root направлен в staging с версией будущего выпуска. */
  describe.skipIf(name !== "Будущая версия одного входа с compiler plugin")("Версия single-entry plugin", () => {
    test("Целевая версия в исполняемом коде", async () => {
      const actual = await executeBuildFixture(workspace.directory, results, "1.0.1", 'return (await load("main")).builtVersion')
      expect(actual, "Single-entry adapter подставляет target version в import.meta.env.COSMOS_PACKAGE_VERSION").toBe("1.0.1")
      expect(JSON.parse(workspace.manifest).version, "Подготовка будущей версии не изменяет manifest исходного пакета").toBe("1.0.0")
      expect(results[0]!.outputs.filter(({type}) => type.includes("javascript")).map(({artifact}) => artifact), "Версия проверена на одном root без перехода в multi-entry graph").toEqual(["."])
    })
  })

  /** @remarks Локальный bunfig задаёт text loader без таблицы compiler plugins. */
  describe.skipIf(name !== "Loader без compiler plugin")("Loader", () => {
    test("Loader самостоятелен", async () => {
      const actual = await executeBuildFixture(workspace.directory, results, "1.0.0", 'return [(await load("main")).source, (await load("server")).source]')
      expect(actual, "Text loader работает без compiler plugin в browser и Bun окружениях").toEqual(["fixture-shader\n", "fixture-shader\n"])
    })
  })

  /** @remarks В manifest есть conditionless exports, маска и исключённая закрытая директория. */
  describe.skipIf(name !== "Общие exports и маски")("Публичный граф", () => {
    test("Общие exports", async () => {
      const expectedKeys = ["./shared", "./theme.css", "./kernel.wasm"]
      for (const key of expectedKeys) {
        const outputs = results.flatMap(({env, outputs}) => outputs.filter(({artifact}) => artifact === key).map((output) => ({env, ...output})))
        expect(outputs.map(({env}) => env), "Conditionless export присутствует в обоих окружениях").toEqual(["main", "server"])
        expect(outputs[0]!.path, "Общий источник не объединяет физические identities окружений").not.toBe(outputs[1]!.path)
      }
      const actual = await executeBuildFixture(workspace.directory, results, "1.0.0", 'return [(await load("main", "./shared")).shared, (await load("server", "./shared")).shared]')
      expect(actual, "Conditionless code export остаётся исполняемым в каждом окружении").toEqual([42, 42])
    })

    test("Маски и исключения", () => {
      for (const result of results) {
        expect(
          result.outputs.filter(({artifact}) => artifact?.startsWith("./icons/")).map(({artifact}) => artifact),
          "Маска раскрывается в детерминированном порядке с nested/remove.svg и без закрытых exports",
        ).toEqual(["./icons/add.svg", "./icons/nested/remove.svg"])
        expect(result.outputs.some(({artifact}) => artifact?.includes("private")), "Null export исключает private/hidden.svg").toBe(false)
      }
    })

    test("Типы ресурсов", async () => {
      for (const {outputs} of results) {
        const css = outputs.find(({artifact}) => artifact === "./theme.css")!
        expect(css.type.split(";")[0], "CSS имеет MIME text/css").toBe("text/css")
        expect((await Bun.file(css.path).text()).replace(/\s/g, ""), "CSS сохраняет объявленный стиль после минификации").toContain("--accent:#2478ff")
        for (const [artifact, mime] of [["./kernel.wasm", "application/wasm"], ["./icons/add.svg", "image/svg+xml"], ["./icons/nested/remove.svg", "image/svg+xml"]]) {
          const output = outputs.find((output) => output.artifact === artifact)!
          expect(output.type.split(";")[0], "MIME raw-ресурса соответствует его формату").toBe(mime)
          expect(new Uint8Array(await Bun.file(output.path).arrayBuffer()), "Raw bytes ресурса сохранены без преобразования").toEqual(new Uint8Array(await Bun.file(join(workspace.root, artifact!.slice(2))).arrayBuffer()))
        }
      }
    })
  })

  /** @remarks Локальный источник зависимости задан в данных изолированной fixture. */
  describe.skipIf(name !== "Источники публичной зависимости")("Граница зависимости", () => {
    test("Public exports зависимости", async () => {
      const output = results[0]!
      const actual = await executeBuildFixture(workspace.directory, results, "1.0.0", 'return (await load("main", "./library")).value')
      expect(actual, "TS экспорт зависимости связан в публичный код пакета-потребителя").toBe(42)
      const libraryRoot = join(workspace.directory, "node_modules/@fixture/library")
      for (const [artifact, mime] of [["./theme.css", "text/css"], ["./icon.svg", "image/svg+xml"], ["./kernel.wasm", "application/wasm"]]) {
        const prepared = output.outputs.find((output) => output.artifact === artifact)!
        expect(prepared.type.split(";")[0], "Публичный ресурс зависимости сохраняет MIME под ключом потребителя").toBe(mime)
        const source = Bun.file(join(libraryRoot, artifact!.slice(2)))
        if (mime === "text/css") {
          expect((await Bun.file(prepared.path).text()).replace(/\s/g, ""), "Public CSS зависимости сохраняет авторский стиль").toContain("--accent:#2478ff")
        } else {
          expect(new Uint8Array(await Bun.file(prepared.path).arrayBuffer()), "Public SVG и WASM зависимости сохраняют точные байты").toEqual(new Uint8Array(await source.arrayBuffer()))
        }
      }
    })

    test("Обычная зависимость не становится release package", async () => {
      expect(results.map(({module}) => module), "Результат содержит только собираемый пакет, без отдельного выпуска библиотеки").toEqual([workspace.name])
      const actual = await executeBuildFixture(workspace.directory, results, "1.0.0", 'return (await (await load("main", "./library")).load()).lazyValue')
      expect(actual, "Динамический import обычной зависимости разрешается в подготовленном графе потребителя").toBe(7)
      const lazy = results[0]!.outputs.filter(({kind, load}) => kind === "chunk" && load === "lazy")
      expect(lazy.length, "Lazy ветвь библиотеки создаёт доступный generated artifact").toBeGreaterThan(0)
      expect(lazy.every(({artifact}) => artifact?.startsWith("./.cosmos/")), "Производные artifacts принадлежат identity потребителя").toBe(true)
    })
  })

  /** @remarks Bare plugin разрешается из public export объявленной прямой dependency. */
  describe.skipIf(name !== "Plugin из прямой зависимости")("Внешний compiler", () => {
    test("Публичный compiler", async () => {
      const record = await Bun.file(join(workspace.directory, "dependency-compiler.json")).json()
      const actual = await executeBuildFixture(workspace.directory, results, "1.0.0", 'const module = await load("main"); return {compiled: module.compiledByDependency, compiler: globalThis.__fixtureDependencyCompiler ?? null}')
      expect(actual, "Plugin разрешён через public export прямой dependency и выполнил преобразование; runtime его не загружает").toEqual({compiled: "public-compiler", compiler: null})
      expect(record.pid, "Внешний compiler работает в изолированном процессе").not.toBe(process.pid)
      expect((globalThis as {__fixtureDependencyCompiler?: number}).__fixtureDependencyCompiler, "Глобальные регистрации тестового процесса не изменены").toBeUndefined()
    })
  })

  /** @remarks Полный граф корня и raw-ресурса направлен в одну staging-директорию. */
  describe.skipIf(name !== "Корень и копируемый ресурс")("Staging", () => {
    test("Полный staging-граф", async () => {
      const staging = join(workspace.directory, "staging/raw")
      const outputs = results[0]!.outputs
      expect(outputs.map(({artifact}) => artifact).sort(), "В staging подготовлен полный граф корня и raw-ресурса").toEqual([".", "./icon.svg"])
      expect(outputs.every(({path}) => { const local = relative(staging, path); return local !== "" && !local.startsWith("..") && !isAbsolute(local) }), "Все outputs принадлежат явной staging-директории").toBe(true)
      expect(JSON.parse(workspace.manifest).version, "Исходный manifest остаётся версии 1.0.0").toBe("1.0.0")
      const icon = outputs.find(({artifact}) => artifact === "./icon.svg")!
      expect(new Uint8Array(await Bun.file(icon.path).arrayBuffer()), "Raw-ресурс в staging сохраняет исходные байты").toEqual(new Uint8Array(await Bun.file(join(workspace.root, "icon.svg")).arrayBuffer()))
      expect(browserPackageArtifactUrl(workspace.name, "main", "./icon.svg", props.options?.version), "Адрес staging-ресурса закреплён за целевой версией").toBe("/@internal/example/icon.svg?env=main&version=1.0.1")
      const actual = await executeBuildFixture(workspace.directory, results, "1.0.1", 'const root = await load("main"); return {value: root.value, identity: root.buildIdentity}')
      expect(actual, "Staging root исполняется с настоящими defines целевой версии 1.0.1").toEqual({value: 42, identity: {name: workspace.name, env: "main", version: "1.0.1"}})
    })
  })
})
