import { test, expect, describe } from "bun:test"
import type { Message } from "../../message/index.t.ts"
import { MetaFor } from "../../../web/metafor.ts"
import { createStaticViewFunction } from "../../view/index.ts"

describe("реакции", () => {
  test("MetaFor - базовый функционал", async () => {
    const childHash = MetaFor(Bun.randomUUIDv7())
      .context((types) => ({
        param: types.string.optional(),
      }))
      .states({
        state_1: { state_2: { param: "param_1" } },
        state_2: { state_3: { param: "param_2" } },
        state_3: {},
      })
      .core()
      .processes((process) => ({
        state_1: process()
          .action(() => true)
          .success(({ update }) => update({ param: "param_1" })),
        state_2: process()
          .action(
            () =>
              new Promise((resolve) =>
                setTimeout(() => {
                  return resolve("")
                }, 400)
              )
          )
          .success(({ update }) => update({ param: "param_2" })),
      }))
      .reactions()
      .view({
        render: ({ html }) => html`<div></div>`,
      })
    const reactionMessages: Array<Message> = []

    // Функция для записи сообщений
    const recordMessage = (message: Message) => {
      reactionMessages.push(message)
    }

    const parentHash = MetaFor(Bun.randomUUIDv7())
      .context((types) => ({
        childAdded: types.boolean.optional(),
      }))
      .states({
        state_1: {},
      })
      .core()
      .processes()
      .reactions((reaction) => [
        [
          ["state_1"],
          reaction({ title: "record_all_messages" })
            .filter({ tag: childHash })
            .equal(({ meta, patch }) => recordMessage({ meta, patch })),
        ],
        [
          ["state_1"],
          reaction()
            .filter({ tag: childHash, op: "add" })
            .equal(({ update }) => update({ childAdded: true })),
        ],
      ])
      .view({
        render: createStaticViewFunction(
          ({ html, context }) => html`<meta-${childHash}>${context.childAdded}</meta-${childHash}>`,
          childHash
        ),
      })

    document.body.innerHTML = `<meta-${parentHash}></meta-${parentHash}>`
    await Bun.sleep(500)

    expect(reactionMessages).toEqual([
      {
        meta: {
          tag: childHash,
          timestamp: expect.any(Number),
          index: 0,
        },
        patch: {
          op: "add",
          path: "/",
          value: {
            state: "state_1",
            states: {
              state_1: {
                state_2: {
                  param: "param_1",
                },
              },
              state_2: {
                state_3: {
                  param: "param_2",
                },
              },
              state_3: {},
            },
            render: "<div></div>",
            context: {
              param: {
                type: "string",
                required: false,
                default: undefined,
                value: null,
              },
            },
            processes: {
              state_1: {
                success: {
                  write: ["param"],
                },
              },
              state_2: {
                success: {
                  write: ["param"],
                },
              },
            },
          },
        },
      },
      {
        meta: {
          tag: childHash,
          timestamp: expect.any(Number),
          index: 0,
        },
        patch: {
          op: "test",
          path: "/state",
          value: "state_1",
        },
      },
      {
        meta: {
          tag: childHash,
          timestamp: expect.any(Number),
          index: 0,
        },
        patch: {
          op: "replace",
          path: "/context",
          value: {
            param: "param_1",
          },
        },
      },
      {
        meta: {
          tag: childHash,
          timestamp: expect.any(Number),
          index: 0,
        },
        patch: {
          op: "replace",
          path: "/state",
          value: "state_1",
        },
      },
      {
        meta: {
          tag: childHash,
          timestamp: expect.any(Number),
          index: 0,
        },
        patch: {
          op: "test",
          path: "/state",
          value: "state_2",
        },
      },
      {
        meta: {
          tag: childHash,
          timestamp: expect.any(Number),
          index: 0,
        },
        patch: {
          op: "replace",
          path: "/context",
          value: {
            param: "param_2",
          },
        },
      },
      {
        meta: {
          tag: childHash,
          timestamp: expect.any(Number),
          index: 0,
        },
        patch: {
          op: "replace",
          path: "/state",
          value: "state_2",
        },
      },
      {
        meta: {
          tag: childHash,
          timestamp: expect.any(Number),
          index: 0,
        },
        patch: {
          op: "replace",
          path: "/state",
          value: "state_3",
        },
      },
    ])
  })
})
