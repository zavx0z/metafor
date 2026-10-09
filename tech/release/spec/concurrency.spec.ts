/** Очередь публикации, повтор участника и чтение согласованного состояния. */
import {describe, expect, test} from "bun:test"
import {resolve} from "node:path"

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
  }
])("$name", ({name, props, expected}) => {
  test.todo("Порядок версий", () => {
    expect<unknown>(
      undefined,
      "Операции публикации сериализованы; новый запрос использует последнюю подтверждённую версию, а повтор участника внутри одной группы не увеличивает её дважды",
    ).toEqual(expected.versions)
  })

  test.todo("Чтение во время публикации", () => {
    expect<unknown>(
      undefined,
      "Читатель ожидает завершения принятой операции и получает полный доказанный состав, а не промежуточные root/child versions",
    ).toEqual(true)
  })

  test.todo("Освобождение очереди", () => {
    expect<unknown>(
      undefined,
      "После успеха или ошибки следующий принятый запрос получает возможность выполниться",
    ).toEqual(true)
  })
})
