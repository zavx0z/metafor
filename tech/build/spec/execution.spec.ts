/** Совпадающие запросы, разные цели, повтор после ошибки и прерывание процесса. */
import {describe, expect, test} from "bun:test"
import {resolve} from "node:path"

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
])("$name", ({name, props, expected}) => {
  test.todo("Количество компиляций", () => {
    expect<unknown>(
      undefined,
      "Совпадающие незавершённые запросы используют одну работу; разные targets и следующий запрос после завершения запускаются отдельно",
    ).toEqual(expected.compilations)
  })

  test.todo("Проверка типов", () => {
    expect<unknown>(
      undefined,
      "Одновременные части используют общую проверку типов пакета, завершённый неудачный запрос не оставляет вечный pending",
    ).toEqual(expected.typechecks)
  })

  /** @remarks Два клиента ждут одну незавершённую сборку. */
  describe.skipIf(name !== "Два одинаковых запроса")("Общие ожидания", () => {
    test.todo("Один исход для клиентов", () => {
      expect<unknown>(
        undefined,
        "Оба клиента получают один результат или одну ошибку; после завершения запись pending освобождается",
      ).toEqual(true)
    })
  })

  /** @remarks Разные версии и директории не объединяются в один pending build. */
  describe.skipIf(name !== "Разные версии и staging")("Раздельные результаты", () => {
    test.todo("Принадлежность outputs", () => {
      expect<unknown>(
        undefined,
        "Артефакты каждого запроса остаются в его staging и имеют запрошенную версию",
      ).toEqual(true)
    })
  })

  /** @remarks Первый процесс завершился с ошибкой, второй — успешно. */
  describe.skipIf(name !== "Повтор после неудачной сборки")("Повторный запрос", () => {
    test.todo("Повтор не наследует ошибку", () => {
      expect<unknown>(
        undefined,
        "Первый клиент получает отказ, следующий — результат новой операции",
      ).toEqual([false, true])
    })
  })

  /** @remarks Процесс прерывается до получения подтверждённого результата. */
  describe.skipIf(name !== "Прерывание сборочного процесса")("Незавершённая работа", () => {
    test.todo("Нет ложного успеха", () => {
      expect<unknown>(
        undefined,
        "Частичный файл не объявляется готовым artifact; возвращается ошибка прерывания, освобождаются pending и временный report",
      ).toEqual(true)
    })
  })
})
