import {describe, expect, test} from "bun:test"
import {Atom, t} from "../atom.js"

describe("null триггер", () => {
  test("Должен выполнить переход когда число null и триггер ожидает null", () => {
    const atom = Atom("NullTest")
      .states("ОЖИДАНИЕ", "ДОБАВИТЬ")
      .context({size: t.number({nullable: true})})
      .collapses([{from: "ОЖИДАНИЕ", to: [{state: "ДОБАВИТЬ", trigger: {size: null}}]}])
      .core()
      .actions({})
      .reactions([]).create({state: "ОЖИДАНИЕ"})
    atom.update({size: null})
    expect(atom.state).toBe("ДОБАВИТЬ")
  })

  test("Значение не nullable а триггер ожидает null (вывод предупреждения валидатора)", () => {
    let atom
    const template = Atom("NullTest").states("ОЖИДАНИЕ", "ДОБАВИТЬ")

    atom = template
      .context({size: t.number({nullable: true})})
      .collapses([{from: "ОЖИДАНИЕ", to: [{state: "ДОБАВИТЬ", trigger: {size: null}}]}])
      .core()
      .actions({})
      .reactions([]).create({state: "ОЖИДАНИЕ"})
    atom.update({size: null})
    // expect(atom.state).toBe("ОЖИДАНИЕ") FIXME: не должен обновлять на null если не nullable

    atom = template
      .context({name: t.string({nullable: false, default: ""})})
      .collapses([{from: "ОЖИДАНИЕ", to: [{state: "ДОБАВИТЬ", trigger: {name: null}}]}])
      .core()
      .actions({})
      .reactions([]).create({state: "ОЖИДАНИЕ"})
    atom.update({name: null})
    // expect(atom.state).toBe("ОЖИДАНИЕ") FIXME: не должен обновлять на null если не nullable

    atom = template
      .context({active: t.boolean({nullable: false, default: false})})
      .collapses([{from: "ОЖИДАНИЕ", to: [{state: "ДОБАВИТЬ", trigger: {active: null}}]}])
      .core()
      .actions({})
      .reactions([]).create({state: "ОЖИДАНИЕ"})
    atom.update({active: null})
    // expect(atom.state).toBe("ОЖИДАНИЕ") FIXME: не должен обновлять на null если не nullable

    atom = template
      .context({status: t.enum("active", "inactive")({nullable: false, default: "active"})})
      .collapses([{from: "ОЖИДАНИЕ", to: [{state: "ДОБАВИТЬ", trigger: {status: null}}]}])
      .core()
      .actions({})
      .reactions([]).create({state: "ОЖИДАНИЕ"})
    atom.update({status: null})
    // expect(atom.state).toBe("ОЖИДАНИЕ") FIXME: не должен обновлять на null если не nullable
  })

  test("Должен выполнить переход когда строка null и триггер ожидает null", () => {
    const atom = Atom("NullTest")
      .states("ОЖИДАНИЕ", "ДОБАВИТЬ")
      .context({
        name: t.string({nullable: true})
      })
      .collapses([
        {
          from: "ОЖИДАНИЕ",
          to: [{state: "ДОБАВИТЬ", trigger: {name: null}}]
        }
      ])
      .core()
      .actions({})
      .reactions([]).create({
        state: "ОЖИДАНИЕ",
        context: {}
      })
    atom.update({name: null})
    expect(atom.state).toBe("ДОБАВИТЬ")
  })

  test("Должен выполнить переход когда boolean null и триггер ожидает null", () => {
    const atom = Atom("NullTest")
      .states("ОЖИДАНИЕ", "ДОБАВИТЬ")
      .context({
        active: t.boolean({nullable: true})
      })
      .collapses([
        {
          from: "ОЖИДАНИЕ",
          to: [{state: "ДОБАВИТЬ", trigger: {active: null}}]
        }
      ])
      .core()
      .actions({})
      .reactions([]).create({
        state: "ОЖИДАНИЕ",
        context: {}
      })
    atom.update({active: null})
    expect(atom.state).toBe("ДОБАВИТЬ")
  })

  test("Должен выполнить переход когда enum null и триггер ожидает null", () => {
    const atom = Atom("NullTest")
      .states("ОЖИДАНИЕ", "ДОБАВИТЬ")
      .context({
        status: t.enum("active", "inactive")({nullable: true})
      })
      .collapses([
        {
          from: "ОЖИДАНИЕ",
          to: [{state: "ДОБАВИТЬ", trigger: {status: null}}]
        }
      ])
      .core()
      .actions({})
      .reactions([]).create({
        state: "ОЖИДАНИЕ",
        context: {}
      })
    atom.update({status: null})
    expect(atom.state).toBe("ДОБАВИТЬ")
  })
})

describe("isNull триггер", () => {
  test("Должен выполнить переход когда значение меняется с null на не-null и соответствует условиям", () => {
    const atom = Atom("NullTest")
      .states("ОЖИДАНИЕ", "ДОБАВИТЬ")
      .context({
        size: t.number({nullable: true})
      })
      .collapses([
        {
          from: "ОЖИДАНИЕ",
          to: [
            {
              state: "ДОБАВИТЬ",
              trigger: {size: {isNull: false, gt: 4}}
            }
          ]
        }
      ])
      .core()
      .actions({})
      .reactions([]).create({
        state: "ОЖИДАНИЕ",
        context: {
          size: null
        },
        // debug: true
      })

    atom.update({size: 10})
    expect(atom.state).toBe("ДОБАВИТЬ")
  })

  test("Не должен выполнять переход когда значение null, но триггер требует не-null", () => {
    const atom = Atom("NullTest")
      .states("ОЖИДАНИЕ", "ДОБАВИТЬ")
      .context({
        size: t.number({nullable: true})
      })
      .collapses([
        {
          from: "ОЖИДАНИЕ",
          to: [
            {
              state: "ДОБАВИТЬ",
              trigger: {
                size: {isNull: false, gt: 4}
              }
            }
          ]
        }
      ])
      .core()
      .actions({})
      .reactions([]).create({
        state: "ОЖИДАНИЕ",
        context: {
          size: null
        }
      })

    expect(atom.state).toBe("ОЖИДАНИЕ")
  })

  test("Должен выполнить переход когда значение null и триггер ожидает {isNull: true}", () => {
    const atom = Atom("NullTest")
      .states("ОЖИДАНИЕ", "ДОБАВИТЬ")
      .context({
        size: t.number({nullable: true})
      })
      .collapses([
        {
          from: "ОЖИДАНИЕ",
          to: [{state: "ДОБАВИТЬ", trigger: {size: {isNull: true}}}]
        }
      ])
      .core()
      .actions({})
      .reactions([]).create({
        state: "ОЖИДАНИЕ",
        context: {}
      })
    atom.update({size: null})
    expect(atom.state).toBe("ДОБАВИТЬ")
  })

  test("Не должен выполнять переход когда значение не-null, но триггер ожидает null", () => {
    const atom = Atom("NullTest")
      .states("ОЖИДАНИЕ", "ДОБАВИТЬ")
      .context({
        size: t.number({nullable: true})
      })
      .collapses([
        {
          from: "ОЖИДАНИЕ",
          to: [
            {
              state: "ДОБАВИТЬ",
              trigger: {
                size: {isNull: true}
              }
            }
          ]
        }
      ])
      .core()
      .actions({})
      .reactions([]).create({
        state: "ОЖИДАНИЕ",
        context: {
          size: 10
        }
      })

    expect(atom.state).toBe("ОЖИДАНИЕ")
  })

  test("Должен обрабатывать множественные условия с isNull false", () => {
    const atom = Atom("NullTest")
      .states("ОЖИДАНИЕ", "ДОБАВИТЬ")
      .context({
        size: t.number({nullable: true})
      })
      .collapses([
        {
          from: "ОЖИДАНИЕ",
          to: [
            {
              state: "ДОБАВИТЬ",
              trigger: {
                size: {isNull: false, gt: 5, lt: 15}
              }
            }
          ]
        }
      ])
      .core()
      .actions({})
      .reactions([]).create({
        state: "ОЖИДАНИЕ",
        context: {}
      })
    atom.update({size: 10})
    expect(atom.state).toBe("ДОБАВИТЬ")
  })

  test("Не должен выполнять переход когда одно из множественных условий не выполняется", () => {
    const atom = Atom("NullTest")
      .states("ОЖИДАНИЕ", "ДОБАВИТЬ")
      .context({size: t.number({nullable: true})})
      .collapses([ /* FIXME: валидатор не должен пропускать такой триггер */
        {from: "ОЖИДАНИЕ", to: [{state: "ДОБАВИТЬ", trigger: {size: {isNull: false, gt: 5, lt: 15} }}]}
      ])
      .core()
      .actions({})
      .reactions([]).create({state: "ОЖИДАНИЕ", context: {size: 20}})
    expect(atom.state).toBe("ОЖИДАНИЕ")
  })

  test("Должен обрабатывать обновление значения с не-null на null", () => {
    const atom = Atom("NullTest")
      .states("ОЖИДАНИЕ", "ДОБАВИТЬ")
      .context({size: t.number({nullable: true})})
      .collapses([{from: "ОЖИДАНИЕ", to: [{state: "ДОБАВИТЬ", trigger: {size: {isNull: true}}}]}])
      .core()
      .actions({})
      .reactions([]).create({
        state: "ОЖИДАНИЕ",
        context: {size: 10}
      })
    atom.update({size: null})
    expect(atom.state).toBe("ДОБАВИТЬ")
  })
})
