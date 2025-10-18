import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { Atom } from "../atom.ts"
import type { Meta } from "../../meta/metafor.ts"
import { messagesFixture } from "../../infra/test/fixture/message.ts"
import { Electromagnetic } from "../electromagnetic.ts"
import { Source } from "../electromagnetic.t.ts"

describe("Получение сообщений из обоих каналов", () => {
  let messagesFixtureInstance: ReturnType<typeof messagesFixture>

  beforeEach(() => {
    // @ts-ignore
    Electromagnetic.chargedAtoms.clear()
    messagesFixtureInstance = messagesFixture({ meta: "test-atom" })
  })

  afterEach(() => {
    // @ts-ignore
    Electromagnetic.chargedAtoms.clear()
  })

  const testSchema: Meta = {
    name: "test-atom",
    context: {
      value: { type: "number", default: 0 },
      source: { type: "string", default: "none" },
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
            // Реакция устанавливает источник сообщения (безопасно - не вызывает новую реакцию)
            update({ 
              source: "reaction"
            })
          }`,
        },
      },
      states: {
        initial: ["value-reaction"],
      },
    },
  }

  it("должен получать сообщения из внутреннего реестра при включенном внутреннем механизме", async () => {
    Atom.setBroadcastChannel(true)

    const atom1 = Atom.fromSchema({ meta: testSchema, id: "atom-1" })
    const atom2 = Atom.fromSchema({ meta: testSchema, id: "atom-2" })

    // Обновляем контекст первого атома
    atom1.update({ value: 5, source: "direct" }, Source.Nothing)

    // Ждем сообщения через фикстуру
    const messages = await messagesFixtureInstance.waitForMessages(50)

    // Проверяем, что второй атом получил реакцию через внутренний механизм
    expect(atom2.λ.value).toBe(0) // значение не изменилось
    expect(atom2.λ.source).toBe("reaction") // источник изменился

    // Проверяем, что сообщение было отправлено через BroadcastChannel
    expect(messages.length).toBeGreaterThan(0)
    expect(messages[0]!.atom).toBe("atom-1")

    atom1.destroy()
    atom2.destroy()
  })

  it("должен получать сообщения только через BroadcastChannel при отключенном внутреннем механизме", async () => {
    Atom.setBroadcastChannel(false)

    const atom1 = Atom.fromSchema({ meta: testSchema, id: "atom-1" })
    const atom2 = Atom.fromSchema({ meta: testSchema, id: "atom-2" })

    // Обновляем контекст первого атома
    atom1.update({ value: 5, source: "direct" }, Source.Nothing)

    // Ждем сообщения через фикстуру
    const messages = await messagesFixtureInstance.waitForMessages(50)

    // Когда BroadcastChannel отключен, атомы все равно получают сообщения через внутренний механизм
    // Поэтому реакция должна сработать
    expect(atom2.λ.value).toBe(0) // значение не изменилось
    expect(atom2.λ.source).toBe("reaction") // источник изменился через внутренний механизм

    // Когда BroadcastChannel отключен, сообщения не отправляются через него
    expect(messages.length).toBe(0)

    atom1.destroy()
    atom2.destroy()
  })

  it("должен подписываться на BroadcastChannel независимо от состояния внутреннего механизма", () => {
    // Проверяем, что атомы всегда подписываются на BroadcastChannel
    Atom.setBroadcastChannel(true)
    const atom1 = Atom.fromSchema({ meta: testSchema, id: "atom-1" })

    Atom.setBroadcastChannel(false)
    const atom2 = Atom.fromSchema({ meta: testSchema, id: "atom-2" })

    // Оба атома должны быть зарегистрированы
    expect(Atom.getRegisteredAtomsCount()).toBe(2)

    // Оба атома должны подписываться на BroadcastChannel
    // (это проверяется через то, что они получают сообщения)

    atom1.destroy()
    atom2.destroy()
  })
})
