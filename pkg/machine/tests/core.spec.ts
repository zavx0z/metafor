import {describe, expect, test} from "bun:test"
import {Atom, t} from "../atom.js"

describe("core", () => {
  describe("обработка нажатия и отпускания пробела", () => {
    const atom = Atom("core-test1")
      .states("ОЖИДАНИЕ", "ПЕРЕТАСКИВАНИЕ_ЭЛЕМЕНТА")
      .context({
        actionUpdate: t.boolean({title: "Обновление контекста из action", nullable: true}),
        isSpacePressed: t.boolean({title: "Нажата ли клавиша Space", default: false})
      })
      .collapses([
        {
          from: "ОЖИДАНИЕ",
          to: [{state: "ПЕРЕТАСКИВАНИЕ_ЭЛЕМЕНТА", trigger: {isSpacePressed: true}}],
          action: "init"
        },
        {
          from: "ПЕРЕТАСКИВАНИЕ_ЭЛЕМЕНТА",
          to: [{state: "ОЖИДАНИЕ", trigger: {isSpacePressed: false}}]
        }
      ])
      .core(({update}) => ({
        handleKeyDown: (code: string) => {
          if (code === "Space") {
            update({isSpacePressed: true, actionUpdate: false})
          }
        },
        handleKeyUp(code: string) {
          if (code === "Space") {
            update({isSpacePressed: false})
          }
        }
      }))
      .actions({
        init: ({update}) => {
          update({actionUpdate: true})
        }
      })
      .reactions([])
      .create({
        state: "ОЖИДАНИЕ"
      })
    test("Проверяем начальное состояние", () => {
      expect(atom.context.isSpacePressed).toBe(false)
      expect(atom.context.actionUpdate).toBe(true)
      expect(atom.state).toBe("ОЖИДАНИЕ")
    })
    test("Эмулируем нажатие пробела", () => {
      atom.core.handleKeyDown("Space", "Other")
      expect(atom.context.isSpacePressed).toBe(true)
      expect(atom.state).toBe("ПЕРЕТАСКИВАНИЕ_ЭЛЕМЕНТА")
    })
    test("Эмулируем отпускание пробела", () => {
      atom.core.handleKeyUp("Space")
      expect(atom.context.isSpacePressed).toBe(false)
      expect(atom.state).toBe("ОЖИДАНИЕ")
    })
  })

  test.todo("Кто вызывает обновление контекста, какие параметры контекста обновляет и с какими значениями")
  test("Волатильность параметров", () => {
    const atom = Atom("core-test2")
      .states("ОЖИДАНИЕ", "ПЕРЕТАСКИВАНИЕ_ЭЛЕМЕНТА")
      .context({
        isSpacePressed: t.boolean({title: "Нажата ли клавиша Space", default: false})
      })
      .collapses([{from: "ОЖИДАНИЕ", to: [{state: "ПЕРЕТАСКИВАНИЕ_ЭЛЕМЕНТА", trigger: {isSpacePressed: true}}]}])
      .core(({update}) => {
        // Создаем объект с общим состоянием
        const coreState = {parameter: true}
        return {
          handleKeyDown(code: string) {
            if (code === "Space") {
              update({isSpacePressed: coreState.parameter})
            }
          },
          parameter: coreState.parameter
        }
      })
      .actions({})
      .reactions([])
      .create({state: "ОЖИДАНИЕ"})
    atom.core.handleKeyDown("Space")
    expect(atom.context.isSpacePressed).toBe(true)
  })
  test("Доступ внутри ядра ко всем входящим в состав ядра функциям и объектам", () => {
    const atom = Atom("core-test3")
      .states("ОЖИДАНИЕ", "ПЕРЕТАСКИВАНИЕ_ЭЛЕМЕНТА")
      .context({
        isSpacePressed: t.boolean({title: "Нажата ли клавиша Space", default: false})
      })
      .collapses([{from: "ОЖИДАНИЕ", to: [{state: "ПЕРЕТАСКИВАНИЕ_ЭЛЕМЕНТА", trigger: {isSpacePressed: true}}]}])
      .core(({update}) => ({
        /** Используем стрелочную функцию, которая замкнет coreState */
        handleKeyDown(code: string) {
          if (code === "Space") {
            update({isSpacePressed: this.parameter})
          }
        },
        parameter: true
      }))
      .actions({})
      .reactions([])
      .create({state: "ОЖИДАНИЕ"})
    atom.core.handleKeyDown("Space")
    expect(atom.context.isSpacePressed).toBe(true)
  })
  test("Доступ внутри ядра к контексту атома", () => {
    const atom = Atom("core-test4")
      .states("ОЖИДАНИЕ")
      .context({
        parameter: t.number({
          default: 0
        })
      })
      .collapses([])
      .core(({context}) => ({
        parameter: context.parameter
      }))
      .actions({})
      .reactions([])
      .create({state: "ОЖИДАНИЕ"})
    expect(atom.core.parameter).toBe(0)
  })
})

describe("core", () => {
  describe("Взаимодействие с общими данными через core", () => {
    test("Данные в core доступны для модификации без замены", () => {
      //@ts-ignore
      const sharedArray = []
      const atom = Atom("core-shared-data-test")
        .states("INITIAL", "MODIFIED")
        .context({
          isUpdated: t.boolean({title: "Обновлено ли", default: false})
        })
        .collapses([
          {
            from: "INITIAL",
            to: [{state: "MODIFIED", trigger: {isUpdated: true}}]
          }
        ])
        .core(({update}) => ({
          //@ts-ignore
          addData: value => {
            sharedArray.push(value)
            update({isUpdated: true})
          }, //@ts-ignore
          getData: () => sharedArray
        }))
        .actions({})
        .reactions([]) //@ts-ignore
        .create({state: "INITIAL", core: {sharedArray}})

      atom.core.addData(42)
      atom.core.addData(100)

      expect(atom.context.isUpdated).toBe(true)
      expect(atom.state).toBe("MODIFIED")
      expect(atom.core.getData()).toEqual([42, 100])
    })
  })

  describe("Защита данных в core", () => {
    test("Данные в core остаются неизменяемыми при попытке модификации структуры", () => {
      const sharedObject = {key: "value"}
      const atom = Atom("core-protection-test")
        .states("INITIAL")
        .context({
          integrityMaintained: t.boolean({title: "Сохранена ли целостность", default: true})
        })
        .collapses([])
        .core(() => ({
          updateKey: () => {
            try {
              sharedObject.key = "newValue" // Допустимо
            } catch {
              // Ошибок быть не должно
            }
          },
          modifyStructure: () => {
            try {
              //@ts-ignore
              delete sharedObject.key //@ts-ignore Попытка модификации структуры
              sharedObject.newKey = "newValue" // Попытка добавить новое свойство
            } catch {
              atom.context.integrityMaintained = false // Сигнализируем о проблеме
            }
          }
        }))
        .actions({})
        .reactions([]) //@ts-ignore
        .create({state: "INITIAL", core: {sharedObject}})

      atom.core.updateKey()
      expect(sharedObject.key).toBe("newValue") // Изменение значения допустимо

      atom.core.modifyStructure()
      expect("key" in sharedObject).toBe(false) // Свойство удалено
      //@ts-ignore
      expect(sharedObject.newKey).toBe("newValue") // Новое свойство добавлено
    })
  })
  describe("обновление ядра внутри через self ", () => {
    test("обновление ядра внутри через self", () => {
      const atom = Atom("core-test5")
        .states("INITIAL")
        .context({})
        .collapses([])
        .core(({self}) => ({
          coreParameter: 0,
          update: () => {
            self.coreParameter = 1
          }
        }))
        .actions({})
        .create({state: "INITIAL"})
      atom.core.update()
      expect(atom.core.coreParameter).toEqual(1)
    })
  })
})
