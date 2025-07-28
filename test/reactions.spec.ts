import { test, expect, describe } from "bun:test"
import type { Message } from "../message/index.t.ts"

describe("реакции", () => {
  test("MetaFor - базовый функционал", async () => {
    document.body.innerHTML = `<metafor-parent></metafor-parent>`

    MetaFor("child")
      .context((types) => ({
        param: types.string.optional(),
      }))
      .states({
        state_1: { state_2: { param: "param_1" } },
        state_2: { state_3: { param: "param_2" } },
        state_3: {},
      })
      .core()
      .actions((action) => ({
        state_1: action(() => true).success(({ update }) => update({ param: "param_1" })),
        state_2: action(
          () =>
            new Promise((resolve) =>
              setTimeout(() => {
                return resolve("")
              }, 400)
            )
        ).success(({ update }) => update({ param: "param_2" })),
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

    MetaFor("parent")
      .context((types) => ({
        childAdded: types.boolean.optional(),
      }))
      .states({
        state_1: {},
      })
      .core()
      .actions()
      .reactions((reaction) => [
        [
          ["state_1"],
          reaction({ title: "record_all_messages" })
            .filter({ tag: "child" })
            .equal(({ meta, patch }) => recordMessage({ meta, patch })),
        ],
        [
          ["state_1"],
          reaction({ title: "child_reaction" })
            .filter({ tag: "child", op: "add" })
            .equal(({ update }) => update({ childAdded: true })),
        ],
      ])
      .view({
        render: ({ html, context }) => html`<metafor-child>${context.childAdded}</metafor-child>`,
      })

    await Bun.sleep(500)

    expect(reactionMessages).toEqual([
      {
        meta: {
          tag: "child",
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
            context: {
              param: null,
            },
            schema: {
              param: {
                type: "string",
                required: false,
                default: undefined,
              },
            },
          },
        },
      },
      {
        meta: {
          tag: "child",
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
          tag: "child",
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
          tag: "child",
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
          tag: "child",
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
          tag: "child",
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
          tag: "child",
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
