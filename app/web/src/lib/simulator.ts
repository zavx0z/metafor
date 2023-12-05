import type { Actor, ActorLogic, AnyStateMachine, AnyStateNodeConfig, AnyTransitionDefinition, EventDescriptor } from "xstate"

import { assign, createActor, createMachine, fromCallback, sendTo } from "xstate"

export type SimulatorEvents =
  | { type: "EVENT"; event: EventDescriptor<any> }
  | { type: "EVENT.PREVIEW"; eventType: AnyTransitionDefinition }
  | { type: "STATE.UPDATE"; state: AnyStateNodeConfig }
  | { type: "MACHINE.UPDATE"; machine: AnyStateMachine }
  | { type: "PREVIEW.CLEAR" }
export type SimulatorActorType = Actor<ActorLogic<any, SimulatorEvents, any, any>>

export const simulatorMachine = createMachine({
  id: "simService",
  types: {} as {
    context: {
      machine: AnyStateMachine
      state: AnyStateNodeConfig
      previewEvent?: string
    }
    events: SimulatorEvents
    input: {
      machine: AnyStateMachine
      state: AnyStateNodeConfig
      previewEvent?: string
    }
  },
  initial: "active",
  context: ({ input }) => ({
    machine: input.machine,
    state: input.state,
    previewEvent: input.previewEvent,
  }),
  on: {
    "STATE.UPDATE": {
      actions: assign({ state: ({ event }) => event.state }),
    },
    EVENT: {
      actions: sendTo("machine", ({ event }) => {
        const eventToSend = { ...event.event }
        return eventToSend
      }),
    },
  },
  states: {
    active: {
      invoke: {
        id: "machine",
        input: ({ context }) => ({ machine: context.machine }),
        src: fromCallback(({ sendBack, receive, input }) => {
          console.log("starting again")
          const actor = createActor(input.machine)
          const sub = actor.subscribe((state) => {
            sendBack({ type: "STATE.UPDATE", state })
          })
          actor.start()
          receive((event) => {
            actor.getSnapshot().status === "active" && actor.send(event)
          })
          return () => {
            sub.unsubscribe()
            actor.stop()
          }
        }),
      },
      on: {
        "MACHINE.UPDATE": {
          target: "active",
          reenter: true,
          actions: assign({ machine: ({ event }) => event.machine }),
        },
        "EVENT.PREVIEW": {
          actions: assign({ previewEvent: ({ event }) => event.eventType as unknown as string }),
        },
        "PREVIEW.CLEAR": {
          actions: assign({ previewEvent: undefined }),
        },
      },
    },
  },
})
