import { test, expect, describe } from "bun:test"
import { messagesFixture } from "../fixture/message.ts"
import type { Message } from "../message/index.t.ts"

describe("реакции", () => {
  test("MetaFor - базовый функционал", async () => {
    // const { waitForMessages } = messagesFixture()

    // document.addEventListener("channel", (ev) => console.log(ev.detail))
    // @ts-ignore
    document.addEventListener("html-debug", (ev) => console.log(ev.detail))
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
          reaction("child_reaction").filter(({ meta, patch }) => {
            reactionMessages.push({ meta, patch })
            return meta.tag === "child" && patch.op === "add"
          }).equal(({ update }) => update({ childAdded: true })),
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
