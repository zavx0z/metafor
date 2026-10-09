/** Совпадающие запросы, разные цели, повтор после ошибки и прерывание процесса. */
import {afterAll, beforeAll, describe, expect, test} from "bun:test"
import {join, relative, resolve} from "node:path"

import {type PackageBuildOptions, type PackageBuildResult} from "@metafor/tech-build"
import {buildOutcome, executionFixture, fixtureBuilder, reportDirectories, typechecks, type ExecutionFixture} from "./execution-fixture"

describe.each([
  {
    name: "Два одинаковых запроса",
    props: {
      path: resolve(import.meta.dir, "fixture/graph"),
      requests: [
        {
          env: "main",
          outdir: "staging/a",
          version: "1.0.1"
        },
        {
          env: "main",
          outdir: "staging/a",
          version: "1.0.1"
        }
      ]
    },
    fixture: {execution: "parallel", holdTypecheckUntilRequests: 2},
    expected: {
      compilations: 1,
      typechecks: 1
    }
  },
  {
    name: "Параллельные окружения пакета",
    props: {
      path: resolve(import.meta.dir, "fixture/environments"),
      requests: [
        {
          env: "main"
        },
        {
          env: "server"
        }
      ]
    },
    fixture: {execution: "parallel", holdTypecheckUntilRequests: 2},
    expected: {
      compilations: 2,
      typechecks: 1
    }
  },
  {
    name: "Разные версии и staging",
    props: {
      path: resolve(import.meta.dir, "fixture/graph"),
      requests: [
        {
          env: "main",
          outdir: "staging/a",
          version: "1.0.1"
        },
        {
          env: "main",
          outdir: "staging/b",
          version: "1.0.2"
        }
      ]
    },
    fixture: {execution: "parallel", holdTypecheckUntilRequests: 2},
    expected: {
      compilations: 2,
      typechecks: 1
    }
  },
  {
    name: "Повтор после неудачной сборки",
    props: {
      path: resolve(import.meta.dir, "fixture/single"),
      requests: [
        {
          env: "main"
        },
        {
          env: "main"
        }
      ]
    },
    fixture: {
      execution: "последовательно",
      compilerExitCodes: [1, 0]
    },
    expected: {
      compilations: 2,
      typechecks: 2
    }
  },
  {
    name: "Прерывание сборочного процесса",
    props: {
      path: resolve(import.meta.dir, "fixture/single"),
      requests: [
        {
          env: "main"
        }
      ]
    },
    fixture: {
      processSignal: "SIGTERM",
      partialOutput: "unfinished.js"
    },
    expected: {
      compilations: 1,
      typechecks: 1
    }
  }
])("$name", ({name, props, fixture: controls, expected}) => {
  let fixture: ExecutionFixture
  let results: PackageBuildResult[]
  let compilations: number
  let checks: number
  let pendingReleased = false
  let resourcesReleased = false

  beforeAll(async () => {
    fixture = await executionFixture(props.path, name === "Параллельные окружения пакета" ? {dependencies: {"@fixture/library": resolve(import.meta.dir, "fixture/library")}} : {})
    if (name === "Прерывание сборочного процесса") {
      await Bun.write(join(fixture.root, "bunfig.toml"), '[cosmos.package-build.environments.main]\nplugins = ["./interrupt.ts"]\n')
      await Bun.write(join(fixture.root, "interrupt.ts"), "import {writeFileSync} from \"node:fs\"\nexport default {\n  name: \"interrupt\",\n  setup() {\n    writeFileSync(\"unfinished.js\", \"partial\")\n    process.kill(process.pid, \"SIGTERM\")\n  },\n}\n")
    }
    if (name === "Повтор после неудачной сборки") {
      await Bun.write(join(fixture.root, "main/index.ts"), '// @ts-expect-error Compiler-only missing module\nimport value from "./missing.ts"\nexport {value}\n')
    }
    if ("holdTypecheckUntilRequests" in controls) {
      await Bun.write(join(fixture.root, "gate-typecheck.ts"), 'while(!await Bun.file("../release-typecheck").exists()) await Bun.sleep(1)\n')
      const manifestFile = join(fixture.root, "package.json")
      const manifest = await Bun.file(manifestFile).json()
      manifest.scripts.typecheck = `bun ./gate-typecheck.ts && ${manifest.scripts.typecheck}`
      await Bun.write(manifestFile, JSON.stringify(manifest))
    }
    if (name === "Разные версии и staging") {
      await Bun.write(join(fixture.root, "main/index.ts"), 'import {state} from "./shared.ts"\nexport const currentValue=()=>state.value\nexport const openEditor=()=>import("./editor.ts")\nexport const version=import.meta.env.COSMOS_PACKAGE_VERSION\n')
      await Bun.write(join(fixture.root, "main/version.d.ts"), 'interface ImportMeta {env: {COSMOS_PACKAGE_VERSION:string}}\n')
    }
    const builder = fixtureBuilder(fixture)
    const requests: PackageBuildOptions[] = props.requests.map((request) => ({...request, env: request.env as "main" | "server"}))
    if ("execution" in controls && controls.execution === "parallel") {
      const pending = requests.map((options) => buildOutcome(builder, fixture.name, options))
      try {
        // Независимые чтения завершаются после admission всех запрошенных env.
        await Promise.all(requests.map((options) => builder.packageOwner(fixture.name, options.env)))
      } finally {
        await Bun.write(join(fixture.directory, "release-typecheck"), "released")
      }
      results = await Promise.all(pending)
    } else {
      results = []
      for (const [index, options] of requests.entries()) {
        if (name === "Повтор после неудачной сборки" && index === 1) {
          await Bun.write(join(fixture.root, "main/index.ts"), "export const value = 42\n")
        }
        results.push(await buildOutcome(builder, fixture.name, options))
      }
    }
    compilations = fixture.observation.count("compiler")
    checks = await typechecks(fixture)
    const next = await buildOutcome(builder, fixture.name, requests[0])
    pendingReleased = next !== results[0] && fixture.observation.count("compiler") === compilations + 1
    resourcesReleased = await fixture.observation.released() && (await reportDirectories(fixture)).every(Boolean)
  }, 20_000)

  afterAll(async () => {await fixture?.cleanup()})
  test("Количество компиляций", () => {
    expect(
      compilations,
      "Совпадающие незавершённые запросы используют одну работу; разные targets и следующий запрос после завершения запускаются отдельно",
    ).toEqual(expected.compilations)
  })

  test("Проверка типов", () => {
    expect(
      checks,
      "Одновременные части используют общую проверку типов пакета, завершённый неудачный запрос не оставляет вечный pending",
    ).toEqual(expected.typechecks)
  })

  test("Завершение операции", () => {
    expect(pendingReleased, "Следующий запрос не наследует завершённый pending").toBe(true)
    expect(resourcesReleased, "Все принадлежащие процессы и временные report освобождены").toBe(true)
  })

  /** @remarks Два клиента ждут одну незавершённую сборку. */
  describe.skipIf(name !== "Два одинаковых запроса")("Общие ожидания", () => {
    test("Один исход для клиентов", () => {
      expect(results[0], "Клиенты получают тот же объект исхода одной операции").toBe(results[1])
      expect(results[0]!.success, "Общая операция действительно успешно собрана").toBe(true)
      expect(pendingReleased, "После завершения новый запрос запускает новую операцию").toBe(true)
    })
  })

  /** @remarks Разные версии и директории не объединяются в один pending build. */
  describe.skipIf(name !== "Разные версии и staging")("Раздельные результаты", () => {
    test("Принадлежность outputs", async () => {
      for (const [index, result] of results.entries()) {
        const request = props.requests[index] as {outdir: string; version: string}
        expect(result.success, result.stderr).toBe(true)
        expect(result.outputs.every(({path}) => !relative(resolve(fixture.root, request.outdir), path).startsWith("..")), "Все artifacts находятся в staging своего запроса").toBe(true)
        const root = result.outputs.find(({artifact}) => artifact === ".")!
        expect(await Bun.file(root.path).text(), "Root содержит exact version именно своего запроса").toContain(request.version)
      }
      expect(results[0]!.outputs[0]!.path, "Разные цели дают разные физические artifacts").not.toBe(results[1]!.outputs[0]!.path)
    })
  })

  /** @remarks Первый процесс завершился с ошибкой, второй — успешно. */
  describe.skipIf(name !== "Повтор после неудачной сборки")("Повторный запрос", () => {
    test("Повтор не наследует ошибку", () => {
      expect(
        results.map(({success}) => success),
        "Первый клиент получает отказ, следующий — результат новой операции",
      ).toEqual([false, true])
    })
  })

  /** @remarks Процесс прерывается до получения подтверждённого результата. */
  describe.skipIf(name !== "Прерывание сборочного процесса")("Незавершённая работа", () => {
    test("Нет ложного успеха", async () => {
      expect(results[0]!.success, "Прерванный настоящий процесс возвращает отказ").toBe(false)
      expect(results[0]!.outputs, "Частичный файл не объявлен artifact").toEqual([])
      expect(results[0]!.stderr, "Диагностика сохраняет сигнал прерывания").toContain("SIGTERM")
      expect(await Bun.file(join(fixture.root, "unfinished.js")).text(), "Сигнал пришёл после настоящей частичной записи").toBe("partial")
      expect(pendingReleased && resourcesReleased, "Прерывание освободило pending, process и report").toBe(true)
    })
  })
})
