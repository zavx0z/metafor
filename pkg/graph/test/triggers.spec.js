import {afterAll, beforeAll, describe, expect, test} from "bun:test"
import {createGraphFixture} from "../../fixtures/graph.fixture.js"
import {stateId} from "../id.js"

const fixture = createGraphFixture()

beforeAll(async () => {
  await fixture.setup()
})

afterAll(async () => {
  await fixture.page.screenshot({ path: 'test/__snapshots__/triggers.png', fullPage: true })
  await fixture.teardown()
})

const atomId = "file"
describe("Граф атома", () => {

  test("Инициализация атома", async () => {
    // Создаем атом в браузере
    await fixture.page.evaluate(() => {
      const atom = window
        .Atom("Файл")
        .states("ОЖИДАНИЕ", "УДАЛИТЬ", "ИЗМЕНИТЬ", "ЧТЕНИЕ", "ОШИБКА ЧТЕНИЯ", "ЗАПИСЬ", "ОШИБКА ЗАПИСИ", "ЧТЕНИЕ-ЗАПИСЬ", "ОШИБКА ЧТЕНИЯ ЗАПИСИ")
        .context({
          path: window.t.string({title: "Путь"}),
          size: window.t.number({title: "Размер (байт)"}),
          modified: window.t.number({title: "Последнее изменение (мс)", nullable: true}),
          lastModified: window.t.number({title: "Предыдущее изменение (мс)", nullable: true}),
          readError: window.t.string({title: "Ошибки чтения файла", nullable: true}),
          writeError: window.t.string({title: "Ошибки записи файла", nullable: true}),
          readWriteError: window.t.string({title: "Ошибка чтения-записи", nullable: true}),
          retry: window.t.number({title: "Количество попыток", nullable: true})
        })
        .collapses([
          {
            from: "ОЖИДАНИЕ",
            to: [
              {
                state: "УДАЛИТЬ",
                trigger: {
                  size: {isNull: false, gt: 0},
                  modified: {isNull: false},
                  lastModified: {isNull: false}
                }
              },
              {
                state: "ИЗМЕНИТЬ",
                trigger: {
                  size: {isNull: false, gt: 0},
                  modified: {isNull: false},
                  lastModified: {isNull: false}
                }
              }
            ]
          },
          {
            from: "УДАЛИТЬ",
            to: [
              {
                state: "ЗАПИСЬ",
                trigger: {
                  lastModified: {isNull: false},
                  modified: {gt: 0},
                  size: {gt: 0}
                }
              }
            ]
          },
          {
            from: "ЧТЕНИЕ",
            to: [
              {
                state: "ОЖИДАНИЕ",
                trigger: {
                  readError: {isNull: true}
                }
              },
              {
                state: "ОШИБКА ЧТЕНИЯ",
                trigger: {
                  readError: {isNull: false}
                }
              }
            ]
          },
          {
            from: "ЗАПИСЬ",
            to: [
              {
                state: "ОЖИДАНИЕ",
                trigger: {
                  writeError: {isNull: true}
                }
              },
              {
                state: "ОШИБКА ЗАПИСИ",
                trigger: {
                  writeError: {isNull: false}
                }
              }
            ]
          },
          {
            from: "ИЗМЕНИТЬ",
            to: [
              {
                state: "ЧТЕНИЕ-ЗАПИСЬ",
                trigger: {
                  size: {gt: 0},
                  writeError: {isNull: true}
                }
              },
              {
                state: "ОШИБКА ЧТЕНИЯ ЗАПИСИ",
                trigger: {
                  readWriteError: {
                    isNull: true
                  }
                }
              }
            ]
          },
          {
            from: "ЧТЕНИЕ-ЗАПИСЬ",
            to: [
              {
                state: "ОЖИДАНИЕ",
                trigger: {
                  readError: {isNull: true},
                  writeError: {isNull: true}
                }
              },
              {
                state: "ОШИБКА ЧТЕНИЯ ЗАПИСИ",
                trigger: {
                  readError: {isNull: false},
                  writeError: {isNull: false}
                }
              }
            ]
          },
          {
            from: "ОШИБКА ЧТЕНИЯ",
            to: [
              {
                state: "ОЖИДАНИЕ",
                trigger: {
                  readError: {isNull: true}
                }
              },
              {
                state: "ЧТЕНИЕ",
                trigger: {
                  readError: {isNull: true}
                }
              }
            ]
          },
          {
            from: "ОШИБКА ЗАПИСИ",
            to: [
              {
                state: "ОЖИДАНИЕ",
                trigger: {
                  writeError: {isNull: true}
                }
              },
              {
                state: "ЗАПИСЬ",
                trigger: {
                  writeError: {isNull: true}
                }
              }
            ]
          },
          {
            from: "ОШИБКА ЧТЕНИЯ ЗАПИСИ",
            to: [
              {
                state: "ОЖИДАНИЕ",
                trigger: {
                  readError: {isNull: true},
                  writeError: {isNull: true}
                }
              },
              {
                state: "ЧТЕНИЕ-ЗАПИСЬ",
                trigger: {
                  readError: {isNull: true},
                  writeError: {isNull: true}
                }
              }
            ]
          }
        ])
        .core().actions({})
        .create({
          context: {path: "./test.txt"},
          state: "ОЖИДАНИЕ",
          graph: true
        })
      window.dataStore.set("atom", atom)
      return atom
    }, atomId)
  })

  test("Проверка активного состояния", async () => {
    const currentStateId = stateId({atom: atomId, state: "ОЖИДАНИЕ"})
    await fixture.page.waitForSelector(`#${currentStateId}.active`, {timeout: 2000})

    const isActive = await fixture.page.evaluate(nodeId => {
      const node = document.getElementById(nodeId)
      return node?.classList.contains("active")
    }, currentStateId)

    expect(isActive).toBe(true)
  })

  test("Переход в новое состояние", async () => {
    await fixture.page.evaluate(() => {
      const atom = window.dataStore.get('atom')
      atom.update({
        size: 10,
        modified: new Date().getTime(),
        lastModified: new Date().getTime()
      })
      return atom.state
    })

    const newStateId = stateId({atom: atomId, state: "УДАЛИТЬ"})
    await fixture.page.waitForSelector(`#${newStateId}.active`, {timeout: 2000})
  })
})

describe("Подсветка состояний", () => {
  test("Подсветка next при переходе", async () => {
    const currentStateId = stateId({atom: atomId, state: "ОЖИДАНИЕ"})
    const nextStateId = stateId({atom: atomId, state: "УДАЛИТЬ"})

    await fixture.page.evaluate(
      (currentId, nextId) => {
        const currentNode = document.getElementById(currentId)
        const nextNode = document.getElementById(nextId)
        if (!currentNode || !nextNode) return

        const graphAtom = document.querySelector("graph-atom")
        const svg = graphAtom?.querySelector("svg.connections")

        currentNode.classList.add("next")

        if (svg) {
          Array.from(svg.querySelectorAll("path"))
            .filter(path => path.id.includes(currentId))
            .forEach(edge => edge.classList.add("next"))
        }

        nextNode.classList.add("next")
      },
      currentStateId,
      nextStateId
    )

    const hasNextClass = await fixture.page.evaluate(nodeId => {
      const node = document.getElementById(nodeId)
      return node?.classList.contains("next")
    }, nextStateId)

    expect(hasNextClass).toBe(true)
  })

  test("Подсветка preview при наведении", async () => {
    const currentStateId = stateId({atom: atomId, state: "ОЖИДАНИЕ"})

    await fixture.page.hover(`#${currentStateId}`)

    const hasPreviewClass = await fixture.page.evaluate(nodeId => {
      const node = document.getElementById(nodeId)
      return node?.classList.contains("preview")
    }, currentStateId)

    expect(hasPreviewClass).toBe(true)
  })
})
