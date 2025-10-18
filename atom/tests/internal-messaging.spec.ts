import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { Atom } from "../atom"
import type { Meta } from "../../meta/metafor"

describe("Внутренний механизм коммуникации между атомами", () => {
  beforeEach(() => {
    // Очищаем реестр перед каждым тестом
    Atom.setBroadcastChannel(true)
  })

  afterEach(() => {
    // Очищаем реестр после каждого теста
    Atom.setBroadcastChannel(false)
  })

  const testSchema: Meta = {
    name: "test-atom",
    context: {
      value: { type: "number", default: 0 },
    },
    states: {
      initial: {},
    },
    reactions: {
      reactions: {
        "value-reaction": {
          label: "Реакция на изменение значения",
          cond: '({ self }) => ({ op: "replace", path: "/context" })',
          src: `({ context, meta, atom, update }) => {
            // Простая реакция - устанавливаем значение в 1 (безопасно)
            // Реакция сработала
            update({ value: 1 })
          }`,
        },
      },
      states: {
        initial: ["value-reaction"],
      },
    },
    core: {},
  }

  it("должен регистрировать атомы в реестре", () => {
    const atom1 = Atom.fromSchema({ meta: testSchema, id: "atom-1" })
    const atom2 = Atom.fromSchema({ meta: testSchema, id: "atom-2" })

    expect(Atom.getRegisteredAtomsCount()).toBe(2)
    expect(Atom.isBroadcastChannelEnabled()).toBe(true)

    atom1.destroy()
    atom2.destroy()
  })

  it("должен отправлять сообщения через внутренний механизм", async () => {
    const atom1 = Atom.fromSchema({ meta: testSchema, id: "atom-1" })
    const atom2 = Atom.fromSchema({ meta: testSchema, id: "atom-2" })

    // Изначальные значения
    expect(atom1.λ.value).toBe(0)
    expect(atom2.λ.value).toBe(0)

    // Обновляем контекст первого атома
    atom1.update({ value: 5 })

    // Даем время на выполнение реакций
    await new Promise((resolve) => setTimeout(resolve, 10))

    // Второй атом должен получить реакцию и установить значение в 1
    expect(atom2.λ.value).toBe(1)

    atom1.destroy()
    atom2.destroy()
  })

  it("должен корректно удалять атомы из реестра", () => {
    const atom1 = Atom.fromSchema({ meta: testSchema, id: "atom-1" })
    const atom2 = Atom.fromSchema({ meta: testSchema, id: "atom-2" })

    expect(Atom.getRegisteredatomsCount()).toBe(2)

    atom1.destroy()
    expect(Atom.getRegisteredatomsCount()).toBe(1)

    atom2.destroy()
    expect(Atom.getRegisteredatomsCount()).toBe(0)
  })

  it("должен переключаться между внутренним механизмом и BroadcastChannel", () => {
    expect(Atom.isBroadcastChannelEnabled()).toBe(true)

    Atom.setBroadcastChannel(false)
    expect(Atom.isBroadcastChannelEnabled()).toBe(false)

    Atom.setBroadcastChannel(true)
    expect(Atom.isBroadcastChannelEnabled()).toBe(true)
  })

  it("не должен отправлять сообщения самому себе", () => {
    const atom = Atom.fromSchema({ meta: testSchema, id: "atom-1" })
    const initialValue = atom.λ.value

    // Обновляем контекст
    atom.update({ value: 10 })

    // Значение должно остаться тем же, так как реакция не должна сработать на себя
    expect(atom.λ.value).toBe(10)

    atom.destroy()
  })
})
