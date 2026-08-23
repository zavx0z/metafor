import {describe, expect, test} from "bun:test"
import {MetaFor} from "../../index.ts"
import type {MassHandle} from "@metafor/types/metafor/mass"

const declareStrictProcessContract = () =>
  MetaFor("strict-process-contract")
    .fields((field) => ({
      command: field.string.optional(),
      operation: field.enum("start", "stop").required("start"),
      error: field.string.optional(),
      attempts: field.number.required(0),
    }))
    .superposition({
      idle: {
        ready: {
          command: {null: false},
          operation: {eq: "start"},
        },
      },
      ready: {
        destroyed: {},
      },
      destroyed: null,
    })
    .mass((mass) => ({profile: mass.json(), attempts: mass.json()}))
    .energy<{
      channel: BroadcastChannel
      socket: WebSocket
    }>()
    .processes((process, destroy) => [
      process("ready", {env: ["server"]})
        .action(async ({energy, field, mass, self, signal, value}) => {
          const action = await import("./fixtures/profile-action.ts")
          return action.startProfile({
            command: value.command,
            mass,
            energy,
            field,
            self,
            proof: {
              operation: value.operation satisfies "start" | "stop",
              attempts: mass.attempts satisfies MassHandle,
              profile: mass.profile satisfies MassHandle,
              channel: energy.channel satisfies BroadcastChannel,
              socket: energy.socket satisfies WebSocket,
              commandType: field.command.type satisfies "string",
              atom: self.atom satisfies string,
              meta: self.meta satisfies string,
              path: self.path satisfies string,
              signal: signal satisfies AbortSignal,
              // @ts-expect-error Energy не смешивается с Mass
              invalidEnergy: mass.profile satisfies WebSocket,
              // @ts-expect-error Mass не получает поля Energy
              missingMassEnergy: mass.socket,
              // @ts-expect-error Energy не получает поля Mass
              missingEnergyMass: energy.attempts,
              // @ts-expect-error Mass сохраняет точные типы изменяемых значений
              invalidMassType: mass.attempts satisfies string,
              // @ts-expect-error Energy сохраняет точный тип живой сущности
              invalidEnergyType: energy.socket satisfies BroadcastChannel,
              // @ts-expect-error value содержит только Fields
              missingValue: value.profile,
              // @ts-expect-error неизвестного Field нет в декларации
              missingField: field.missing,
            },
          })
        })
        .success(({data, update}) => {
          const profileId: string = data.profileId
          const attempts: number = data.attempts
          update({attempts})
          void profileId

          // Восстановлено из исторического actions.types.spec.ts.
          // @ts-expect-error Update принимает только объявленные Fields
          update({age: 42})
          // @ts-expect-error result action не содержит age
          update({attempts: data.age})
          // @ts-expect-error тип обновления должен совпадать с Field
          update({attempts: data.profileId})
        })
        .error(({error, update}) => {
          const message: string = error.message
          update({error: message})

          // Восстановлено из исторического actions.types.spec.ts.
          // @ts-expect-error Update принимает только объявленные Fields
          update({age: 42})
          // @ts-expect-error error всегда Error, а не result action
          error.profileId
        }),
      destroy("destroyed", {env: ["server"]}).before(async ({energy, mass}) => {
        const release = await import("./fixtures/release-energy.ts")
        return release.releaseProfile({
          energy,
          mass,
          proof: {
            channel: energy.channel satisfies BroadcastChannel,
            socket: energy.socket satisfies WebSocket,
            attempts: mass.attempts satisfies MassHandle,
            // @ts-expect-error destroy сохраняет раздельность Energy и Mass
            missingEnergyMass: energy.profile,
            // @ts-expect-error destroy не подменяет Mass сущностями Energy
            missingMassEnergy: mass.channel,
          },
        })
      }),
    ])
    .reactions(() => [])
    .matter(({mass, energy, html}) => {
      const attempts: MassHandle = mass.attempts
      const socket: WebSocket = energy.socket
      void attempts
      void socket

      // @ts-expect-error Matter Mass сохраняет отдельный точный контракт
      mass.socket
      // @ts-expect-error Matter Energy не содержит поля Mass
      energy.attempts

      return html`<meta-for
        src="demo/child"
        mass=${{attempts: mass.attempts}}
        energy=${{socket: energy.socket}}
      />`
    })
    .bulk()

const declareInvalidEnergyFunction = () =>
  MetaFor("invalid-energy-function")
    .fields(() => ({}))
    .superposition({})
    .mass(() => ({}))
    // @ts-expect-error Energy содержит сущности, а не функции или фабрики
    .energy<{connect: () => WebSocket}>()

const declareInvalidEnergyObject = () =>
  MetaFor("invalid-energy-object")
    .fields(() => ({}))
    .superposition({})
    .mass(() => ({}))
    // @ts-expect-error Energy объявляется generic-типом, а не runtime-объектом
    .energy({socket: null as unknown as WebSocket})

const declareInvalidMassFunction = () =>
  MetaFor("invalid-mass-function")
    .fields(() => ({}))
    .superposition({})
    .mass((mass) => ({
      // @ts-expect-error Mass содержит рабочий материал, а не функции
      execute: () => true,
      // @ts-expect-error nullable union всё равно содержит исполняемую функцию
      optionalExecute: null as null | (() => boolean),
      // @ts-expect-error Map не является сериализуемой Mass
      profiles: new Map<string, {id: string}>(),
      // @ts-expect-error живой WebSocket принадлежит Energy
      socket: null as unknown as WebSocket,
      // @ts-expect-error функция запрещена и во вложенном значении Mass
      nested: {execute: () => true},
      // @ts-expect-error unknown не доказывает сериализуемость Mass
      observation: null as unknown,
    }))

const declareInvalidMassMime = () =>
  MetaFor("invalid-mass-mime")
    .fields(() => ({}))
    .superposition({})
    .mass((mass) => ({
      // @ts-expect-error MIME не является metadata Mass declaration
      profile: mass.json({mime: "application/json"}),
    }))

const declareInvalidProcessState = () =>
  MetaFor("invalid-process-state")
    .fields(() => ({}))
    .superposition({idle: null})
    .mass(() => ({}))
    .energy()
    .processes((process, destroy) => [
      // @ts-expect-error Process обязан принадлежать состоянию Superposition
      process("missing").action(() => ({})),
      // @ts-expect-error destroy обязан принадлежать состоянию Superposition
      destroy("missing"),
    ])

describe("strict process typing", () => {
  test("separates Fields, Mass and Energy through action, result and destroy", () => {
    expect(() => declareStrictProcessContract()).not.toThrow()
  })

  test("keeps negative declarations in the TypeScript program", () => {
    expect(typeof declareInvalidEnergyFunction).toBe("function")
    expect(typeof declareInvalidEnergyObject).toBe("function")
    expect(typeof declareInvalidMassFunction).toBe("function")
    expect(typeof declareInvalidMassMime).toBe("function")
    expect(typeof declareInvalidProcessState).toBe("function")
  })
})
