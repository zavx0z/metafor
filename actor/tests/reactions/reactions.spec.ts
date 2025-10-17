//@ts-nocheck
import { test, expect, describe } from "bun:test"
import type { ReactionParams } from "../../src/reactions.t.ts"
describe.skip("реакции", () => {
  test("MetaFor - базовый функционал", async () => {
    const childHash = MetaFor(Bun.randomUUIDv7())
      .context((types) => ({
        param: types.string.required(""),
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
    const reactionMessages: Array<ReactionParams> = []

    // Функция для записи сообщений
    const recordMessage = (message: ReactionParams) => {
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
          reaction({ label: "record_all_messages" })
            .filter(({ self }) => ({ meta: "childHash" }))
            .equal(({ meta, actor, timestamp, patch }) => recordMessage({ meta, actor, timestamp, patch })),
        ],
        [
          ["state_1"],
          reaction()
            .filter(({ self }) => ({ meta: "childHash", op: "add" }))
            .equal(({ update }) => update({ childAdded: true })),
        ],
      ])
      .view({
        render: ({ html, context }) => html`<meta-${childHash}>${context.childAdded}</meta-${childHash}>`,
      })

    document.body.innerHTML = `<meta-${parentHash}></meta-${parentHash}>`
    await Bun.sleep(500)

    expect(reactionMessages).toEqual([
      {
        meta: childHash,
        actor: {
          index: 0,
        },
        timestamp: expect.any(Number),
        patch: {
          op: "add",
          path: "/",
          value: {
            name: "childName",
            state: "state_1",
            process: false,
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
        meta: childHash,
        actor: {
          index: 0,
        },
        timestamp: expect.any(Number),
        patch: {
          op: "test",
          path: "/state",
          value: "state_1",
        },
      },
      {
        meta: childHash,
        actor: {
          index: 0,
        },
        timestamp: expect.any(Number),
        patch: {
          op: "replace",
          path: "/context",
          value: {
            param: "param_1",
          },
        },
      },
      {
        meta: childHash,
        actor: {
          index: 0,
        },
        timestamp: expect.any(Number),
        patch: {
          op: "replace",
          path: "/state",
          value: "state_1",
        },
      },
      {
        meta: childHash,
        actor: {
          index: 0,
        },
        timestamp: expect.any(Number),
        patch: {
          op: "test",
          path: "/state",
          value: "state_2",
        },
      },
      {
        meta: childHash,
        actor: {
          index: 0,
        },
        timestamp: expect.any(Number),
        patch: {
          op: "replace",
          path: "/context",
          value: {
            param: "param_2",
          },
        },
      },
      {
        meta: childHash,
        actor: {
          index: 0,
        },
        timestamp: expect.any(Number),
        patch: {
          op: "replace",
          path: "/state",
          value: "state_2",
        },
      },
      {
        meta: childHash,
        actor: {
          index: 0,
        },
        timestamp: expect.any(Number),
        patch: {
          op: "replace",
          path: "/state",
          value: "state_3",
        },
      },
    ])
  })
})
