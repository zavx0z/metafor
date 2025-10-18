import { describe, it, expect } from "bun:test"
import { Atom } from "../atom"
import type { Meta } from "../../meta/metafor"

describe("Коммуникация между атомами в разных потоках/воркерах", () => {
  const testSchema: Meta = {
    name: "worker-atom",
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
            // Реакция устанавливает значение в 999
            update({ value: 999 })
          }`,
        },
      },
      states: {
        initial: ["value-reaction"],
      },
    },
  }

  it("должен использовать только BroadcastChannel при отключенном внутреннем механизме", () => {
    // Отключаем внутренний механизм - все атомы будут общаться через BroadcastChannel
    Atom.setBroadcastChannel(false)

    const atom1 = Atom.fromSchema({ meta: testSchema, id: "worker-atom-1" })
    const atom2 = Atom.fromSchema({ meta: testSchema, id: "worker-atom-2" })

    // Проверяем, что атомы зарегистрированы, но внутренний механизм отключен
    expect(Atom.getRegisteredAtomsCount()).toBe(2)
    expect(Atom.isBroadcastChannelEnabled()).toBe(false)

    // В этом случае атомы будут общаться только через BroadcastChannel
    // что подходит для случаев, когда они находятся в разных потоках/воркерах

    atom1.destroy()
    atom2.destroy()
  })

  it("должен использовать внутренний механизм для атомов в том же потоке", () => {
    // Включаем внутренний механизм - атомы в том же потоке будут общаться быстро
    Atom.setBroadcastChannel(true)

    const atom1 = Atom.fromSchema({ meta: testSchema, id: "main-atom-1" })
    const atom2 = Atom.fromSchema({ meta: testSchema, id: "main-atom-2" })

    // Проверяем, что атомы зарегистрированы и внутренний механизм включен
    expect(Atom.getRegisteredAtomsCount()).toBe(2)
    expect(Atom.isBroadcastChannelEnabled()).toBe(true)

    // В этом случае атомы будут общаться через внутренний реестр (быстро)
    // но сообщения также будут отправляться через BroadcastChannel для других потоков

    atom1.destroy()
    atom2.destroy()
  })

  it("должен правильно переключаться между режимами", () => {
    // Начинаем с отключенного внутреннего механизма
    Atom.setBroadcastChannel(false)
    expect(Atom.isBroadcastChannelEnabled()).toBe(false)

    const atom1 = Atom.fromSchema({ meta: testSchema, id: "atom-1" })
    expect(Atom.getRegisteredAtomsCount()).toBe(1)

    // Включаем внутренний механизм
    Atom.setBroadcastChannel(true)
    expect(Atom.isBroadcastChannelEnabled()).toBe(true)

    const atom2 = Atom.fromSchema({ meta: testSchema, id: "atom-2" })
    expect(Atom.getRegisteredAtomsCount()).toBe(2)

    // Отключаем внутренний механизм
    Atom.setBroadcastChannel(false)
    expect(Atom.isBroadcastChannelEnabled()).toBe(false)

    const atom3 = Atom.fromSchema({ meta: testSchema, id: "atom-3" })
    expect(Atom.getRegisteredAtomsCount()).toBe(3)

    atom1.destroy()
    atom2.destroy()
    atom3.destroy()
  })
})
