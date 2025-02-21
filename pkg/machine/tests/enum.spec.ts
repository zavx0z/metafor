import {Atom, t} from "../atom.js"
import {describe, expect, test} from "bun:test"

describe("Enum тип", () => {
  test("создание enum типа", () => {
    const atom = Atom("TestEnum")
      .states("INITIAL", "FINAL")
      .context({
        status: t.enum("active", "inactive", "pending")({title: "Статус", nullable: true, default: "inactive"})
      })
      .collapses([
        {
          from: "INITIAL",
          to: [{state: "FINAL", trigger: {status: "active"}}]
        }
      ])
      .core()
      .actions({})
      .reactions([]).create({state: "INITIAL"})

    expect(atom.context.status).toBe("inactive")
  })

  test("проверка перехода по enum значению", async () => {
    const atom = Atom("TestEnum")
      .states("INITIAL", "ACTIVE")
      .context({
        status: t.enum("active", "inactive")({default: "inactive"})
      })
      .collapses([
        {
          from: "INITIAL",
          to: [{state: "ACTIVE", trigger: {status: "active"}}]
        }
      ])
      .core()
      .actions({})
      .reactions([]).create({state: "INITIAL"})

    atom.update({status: "active"})
    expect(atom.state).toBe("ACTIVE")
  })

  test("сложные условия enum триггера", async () => {
    const atom = Atom("TestEnum")
      .states("INITIAL", "ACTIVE", "INACTIVE")
      .context({
        status: t.enum("active", "inactive", "pending")({default: "pending"})
      })
      .collapses([
        {
          from: "INITIAL",
          to: [{state: "ACTIVE", trigger: {status: {oneOf: ["active", "pending"]}}}]
        },
        {
          from: "ACTIVE",
          to: [{state: "INACTIVE", trigger: {status: "inactive"}}]
        }
      ])
      .core(({update}) => ({
        example: async () => {
          update({status: "inactive"})
        }
      }))
      .actions({
        example: ({update}) => {
          update({status: "active"})
        }
      })
      .reactions([]).create({state: "INITIAL"})

    atom.update({status: "active"})
    expect(atom.state).toBe("ACTIVE")

    atom.update({status: "inactive"})
    expect(atom.state).toBe("INACTIVE")
  })

  test("числовой enum тип", () => {
    const atom = Atom("TestEnum")
      .states("INITIAL", "FINAL")
      .context({
        status: t.enum(1, 2, 3)({title: "Статус", nullable: true, default: 1})
      })
      .collapses([])
      .core()
      .actions({})
      .reactions([]).create({state: "INITIAL"})

    expect(atom.context.status).toBe(1)
  })

  test("проверка перехода по числовому enum значению", async () => {
    const atom = Atom("TestEnum")
      .states("INITIAL", "ACTIVE")
      .context({
        status: t.enum(1, 2)({default: 1})
      })
      .collapses([
        {
          from: "INITIAL",
          to: [{state: "ACTIVE", trigger: {status: 2}}]
        }
      ])
      .core()
      .actions({})
      .reactions([]).create({state: "INITIAL"})

    atom.update({status: 2})
    expect(atom.state).toBe("ACTIVE")
  })

  test("смешанный enum тип", () => {
    const atom = Atom("TestEnum")
      .states("INITIAL", "FINAL")
      .context({
        status: t.enum("active", "inactive")({title: "Статус", default: "active"})
      })
      .collapses([])
      .core()
      .actions({})
      .reactions([]).create({state: "INITIAL"})

    expect(atom.context.status).toBe("active")
  })
})
