import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { Atom } from "../atom.ts"
import type { Meta } from "../../meta/metafor.ts"
import { messagesFixture } from "../../infra/test/fixture/message.ts"
import { Electromagnetic } from "../electromagnetic.ts"

describe("Двойная отправка сообщений (BroadcastChannel + внутренний механизм)", () => {
  let messagesFixtureInstance: ReturnType<typeof messagesFixture>

  beforeEach(() => {
    // Очищаем реестр атомов
    // @ts-ignore
    Electromagnetic.charged.clear()

    // Включаем BroadcastChannel
    Atom.setBroadcastChannel(true)

    // Инициализируем фикстуру для перехвата сообщений
    messagesFixtureInstance = messagesFixture({ meta: "test-atom" })
  })

  afterEach(() => {
    Atom.setBroadcastChannel(false)
    // @ts-ignore
    Electromagnetic.charged.clear()
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
            // Простая реакция - устанавливаем значение в 100
            update({ value: 100 })
          }`,
        },
      },
      states: {
        initial: ["value-reaction"],
      },
    },
  }

  it("должен отправлять сообщения в оба канала", async () => {
    const atom1 = Atom.fromSchema({ meta: testSchema, id: "atom-1" })
    const atom2 = Atom.fromSchema({ meta: testSchema, id: "atom-2" })

    // Обновляем контекст первого атома
    atom1.update({ value: 5 })

    // Ждем сообщения через фикстуру
    const messages = await messagesFixtureInstance.waitForMessages(50)

    // Проверяем, что сообщение было отправлено через BroadcastChannel
    expect(messages.length).toBeGreaterThan(0)

    // Ищем сообщение с обновлением контекста (replace)
    const contextMessage = messages.find((msg) =>
      msg.patches.some((patch: any) => patch.op === "replace" && patch.path === "/context")
    )
    expect(contextMessage).toBeDefined()
    expect(contextMessage!.atom).toBe("atom-1")

    // Проверяем, что второй атом получил реакцию через внутренний механизм
    expect(atom2.λ.value).toBe(100)

    atom1.destroy()
    atom2.destroy()
  })

  it("должен работать только с BroadcastChannel при отключенном внутреннем механизме", async () => {
    // Отключаем внутренний механизм
    Atom.setBroadcastChannel(false)

    const atom1 = Atom.fromSchema({ meta: testSchema, id: "atom-1" })
    const atom2 = Atom.fromSchema({ meta: testSchema, id: "atom-2" })

    // Обновляем контекст первого атома
    atom1.update({ value: 5 })

    // Ждем сообщения через фикстуру
    const messages = await messagesFixtureInstance.waitForMessages(50)

    // Когда BroadcastChannel отключен, сообщения не отправляются через него
    expect(messages.length).toBe(0)

    // Но атомы все равно получают сообщения через внутренний механизм
    // Поэтому реакция должна сработать
    expect(atom2.λ.value).toBe(100)

    atom1.destroy()
    atom2.destroy()
  })

  it("должен регистрировать атомы в реестре независимо от состояния внутреннего механизма", () => {
    Atom.setBroadcastChannel(false)
    const atom1 = Atom.fromSchema({ meta: testSchema, id: "atom-1" })
    // @ts-expect-error
    expect(Electromagnetic.charged.size).toBe(1)

    Atom.setBroadcastChannel(true)
    const atom2 = Atom.fromSchema({ meta: testSchema, id: "atom-2" })
    // @ts-expect-error
    expect(Electromagnetic.charged.size).toBe(2)

    atom1.destroy()
    atom2.destroy()
  })
})
