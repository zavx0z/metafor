import {afterAll, beforeAll, describe, expect, test} from "bun:test"
import {Atom, t} from "../atom.js"

const consoleLog = console.debug
beforeAll(() => console.debug = () => undefined)
afterAll(() => console.debug = consoleLog)

const atom = Atom("action-extract")
  .states("state-1", "state-2")
  .context({
    a: t.number({title: "a", default: 1}),
    b: t.string({title: "b"}),
    c: t.boolean({title: "c"}),
    d: t.enum("a", "b", "c")({default: "a", nullable: true})
  })
  .collapses([
    {
      from: "state-1",
      action: "bodyDot",
      to: [{state: "state-2", trigger: {a: 1}}]
    },
    {
      from: "state-2",
      action: "argDestruct",
      to: [{state: "state-1", trigger: {a: 1}}]
    },
    {
      from: "state-1",
      action: "multiReadWrite",
      to: [{state: "state-2", trigger: {a: 1}}]
    },
    {
      from: "state-2",
      action: "noReadWrite",
      to: [{state: "state-1", trigger: {a: 1}}]
    }
  ])
  .core(({context, update}) => ({
    bodyDot: () => {
      console.debug(context.b)
      update({a: 3})
    },
    argDestruct: () => {
      const {a} = context
      console.debug(a)
      update({a: 4})
    },
    multipleDestruct: () => {
      const {a} = context
      const {b, c} = context
      console.debug(a, b, c)
      update({a: 1})
    },
    renamedDestruct: () => {
      const {a: value} = context
      update({a: value + 1})
    },
    nestedAccess: () => {
      console.debug(context.a, context.b.length)
      update({a: 5, b: "test"})
    }
  }))
  .actions({
    bodyDot: ({context, update}) => {
      console.debug(context.b)
      update({a: 3})
    },
    argDestruct: ({context: {a}, update}) => {
      console.debug(a)
      update({a: 4})
    },
    multiReadWrite: ({context, update}) => {
      console.debug(context.a, context.b, context.c, context.d)
      update({a: 5, b: "updated", c: false, d: "b"})
    },
    noReadWrite: () => {
      console.debug("No read or write")
    }
  })
  .reactions([]).create({
    state: "state-1",
    context: {
      b: "test"
    }
  })
const snapshot = atom.snapshot()

test("snapshot", () => {
  // expect(snapshot).toMatchSnapshot()
})

describe("Извлечение используемого контекста в функции действия состояния", () => {
  const actions = snapshot.actions

  describe("В теле функции чтения контекста через context.dot", () => {
    const bodyDot = actions.bodyDot
    const {read, write} = bodyDot
    test("Извлечение читаемых переменных", () => {
      expect(read).toEqual(["b"])
    })

    test("Извлечение записываемых переменных", () => {
      expect(write).toEqual(["a"])
    })
  })

  describe("В аргументах функции деструктуризация контекста", () => {
    const argDestruct = actions.argDestruct
    const {read, write} = argDestruct
    test("Извлечение читаемых переменных", () => {
      expect(read).toEqual(["a"])
    })

    test("Извлечение записываемых переменных", () => {
      expect(write).toEqual(["a"])
    })
  })

  describe("Чтение и запись нескольких переменных", () => {
    const multiReadWrite = actions.multiReadWrite
    const {read, write} = multiReadWrite
    test("Извлечение читаемых переменных", () => {
      expect(read).toEqual(["a", "b", "c", "d"])
    })

    test("Извлечение записываемых переменных", () => {
      expect(write).toEqual(["a", "b", "c", "d"])
    })
  })

  describe("Отсутствие чтения или записи", () => {
    const noReadWrite = actions.noReadWrite
    const {read, write} = noReadWrite
    test("Извлечение читаемых переменных", () => {
      expect(read).toEqual([])
    })

    test("Извлечение записываемых переменных", () => {
      expect(write).toEqual([])
    })
  })
})

describe("Извлечение используемого контекста в функциях core", () => {
  const {core} = atom.snapshot()

  describe("В теле функции чтения контекста через context.dot", () => {
    const bodyDot = core.bodyDot
    const {read, write} = bodyDot
    test("Извлечение читаемых переменных", () => {
      expect(read).toEqual(["b"])
    })

    test("Извлечение записываемых переменных", () => {
      expect(write).toEqual(["a"])
    })
  })

  describe("В теле функции деструктуризация контекста", () => {
    const argDestruct = core.argDestruct
    const {read, write} = argDestruct
    test("Извлечение читаемых переменных", () => {
      expect(read).toEqual(["a"])
    })

    test("Извлечение записываемых переменных", () => {
      expect(write).toEqual(["a"])
    })
  })

  describe("Множественная деструктуризация контекста", () => {
    const {read, write} = core.multipleDestruct

    test("Извлечение читаемых переменных", () => {
      expect(read).toEqual(["a", "b", "c"])
    })

    test("Извлечение записываемых переменных", () => {
      expect(write).toEqual(["a"])
    })
  })

  describe("Деструктуризация с переименованием", () => {
    const {read, write} = core.renamedDestruct

    test("Извлечение читаемых переменных", () => {
      expect(read).toEqual(["a"])
    })

    test("Извлечение записываемых переменных", () => {
      expect(write).toEqual(["a"])
    })
  })

  describe("Вложенный доступ к свойствам", () => {
    const {read, write} = core.nestedAccess

    test("Извлечение читаемых переменных", () => {
      expect(read).toEqual(["a", "b"])
    })

    test("Извлечение записываемых переменных", () => {
      expect(write).toEqual(["a", "b"])
    })
  })
})
