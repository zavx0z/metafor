/**
 * MetaFor - фреймворк для создания актора конечного автомата
 * @packageDocumentation
 */

import { types, createContext } from "./context"
import type { ContextSchema, ContextTypes, ContextInstance, JsonPatch, ExtractValues } from "./context"
import { Machine } from "./machine"
import type { StateConfig } from "./machine/index.t.ts"

type StatesConfig<S extends string> = Record<S, Partial<Record<S, any>>>

/**
 * Тип функции для создания chain API действия автомата.
 * @template C - схема контекста
 * @template Res - тип результата действия
 * @param fn - функция действия, принимает { context }, возвращает результат или промис
 * @returns chain API с методами success и error
 */
type ActionType<C extends ContextSchema> = <Res = any>(
  fn: (params: { context: ExtractValues<C> }) => Res | Promise<Res>
) => {
  /**
   * Зарегистрировать обработчик успеха для действия
   * @param handler - функция, вызываемая при успешном завершении действия
   * @returns chain API с методами success и error
   */
  success: ActionSuccess<C, Res>
  /**
   * Зарегистрировать обработчик ошибки для действия
   * @param handler - функция, вызываемая при ошибке выполнения действия
   * @returns chain API с методами success и error
   */
  error: ActionError<C>
}

/**
 * Обработчик успеха для действия автомата
 * @template C - схема контекста
 * @template Res - тип результата действия
 * @param params - объект с update (функция обновления контекста) и data (результат)
 */
type ActionSuccessHandler<C extends ContextSchema, Res> = (params: {
  update: (values: Partial<ExtractValues<C>>) => void
  data: Res
}) => void

/**
 * Обработчик ошибки для действия автомата
 * @template C - схема контекста
 * @param params - объект с update (функция обновления контекста) и error (ошибка)
 */
type ActionErrorHandler<C extends ContextSchema> = (params: {
  update: (values: Partial<ExtractValues<C>>) => void
  error: any
}) => void

/**
 * Метод chain API для регистрации обработчика успеха
 * @template C - схема контекста
 * @template Res - тип результата действия
 * @param handler - функция-обработчик успеха
 * @returns chain API с методами success и error
 */
type ActionSuccess<C extends ContextSchema, Res> = (handler: ActionSuccessHandler<C, Res>) => {
  success: ActionSuccess<C, Res>
  error: ActionError<C>
}

/**
 * Метод chain API для регистрации обработчика ошибки
 * @template C - схема контекста
 * @param handler - функция-обработчик ошибки
 * @returns chain API с методами success и error
 */
type ActionError<C extends ContextSchema> = (handler: ActionErrorHandler<C>) => {
  success: ActionSuccess<C, any>
  error: ActionError<C>
}

/**
 * Вспомогательная функция для создания actionsConfig через builder и chain API.
 * @param builder - функция, принимающая action chain API
 * @returns объект actionsConfig для автомата
 */
function createActionsConfig<C extends ContextSchema, S extends string>(
  builder: (action: ActionType<C>) => Partial<Record<S, ReturnType<ActionType<C>>>>
) {
  return builder(<Res = any>(fn: (params: { context: ExtractValues<C> }) => Res | Promise<Res>) => {
    function success(handler: ActionSuccessHandler<C, Res>): ReturnType<ActionSuccess<C, Res>> {
      chain.successHandler = handler
      return chainApi
    }
    function error(handler: ActionErrorHandler<C>): ReturnType<ActionError<C>> {
      chain.errorHandler = handler
      return chainApi
    }
    const chainApi = {
      action: fn,
      success,
      error,
    }
    const chain: any = {
      ...chainApi,
      successHandler: undefined,
      errorHandler: undefined,
    }
    return chainApi
  })
}

/**
 * MetaFor — фабрика для создания web-компонента-актора конечного автомата
 * @param tag - уникальный тег web-компонента
 * @returns chain API: context() -> states() -> actions()
 */
export function MetaFor(tag: string) {
  const elementName = `metafor-${tag}` as const
  return {
    /**
     * Регистрирует схему контекста для автомата.
     *
     * @param schema Функция, принимающая types и возвращающая объект-схему контекста.
     * Пример:
     * ```ts
     * .context(types => ({
     *   name: types.string.required("Anonymous"),
     *   isActive: types.boolean.required(false),
     * }))
     * ```
     * @returns chain API для вызова .states(...)
     */
    context<C extends ContextSchema>(schema: (types: ContextTypes) => C) {
      const contextSchema = schema(types)
      return {
        /**
         * Регистрирует переходы автомата между состояниями.
         *
         * @param states Объект, где ключ — имя состояния, а значение — карта возможных переходов (ключ — следующее состояние, значение — условия или данные перехода).
         * Пример:
         * ```ts
         * .states({
         *   guest: { user: { name: "Пользователь" } },
         *   user: { guest: {} },
         * })
         * ```
         * @returns chain API для вызова .actions(...)
         */
        states<S extends string>(states: StatesConfig<S>) {
          const initialState = Object.keys(states)[0] as S
          const stateConfig = Object.fromEntries(
            Object.entries(states).map(([state, transitions]) => [state, { to: transitions }])
          )
          return {
            /**
             * Регистрирует действия автомата для нужных состояний.
             *
             * @param builder Функция, принимающая action — фабрику chain API для описания действий.
             * Возвращает объект, где ключ — имя состояния (только для тех, где нужны действия), а значение — chain-объект с обработчиками.
             *
             * Пример:
             * ```ts
             * .actions(action => ({
             *   guest: action(({ context }) => { ... })
             *     .success(({ update, data }) => update({ ... }))
             *     .error(({ update, error }) => update({ ... })),
             *   // для других состояний можно не указывать действие, если оно не требуется
             * }))
             * ```
             *
             * @returns Объект с действиями только для нужных состояний
             */
            actions(builder: (action: ActionType<C>) => Partial<Record<S, ReturnType<ActionType<C>>>>) {
              const actionsConfig = createActionsConfig<C, S>(builder)

              class WebComponent extends HTMLElement {
                #ctx: ContextInstance<any>
                #shadow: ShadowRoot
                #machine: any
                #channel: BroadcastChannel

                constructor() {
                  super()
                  this.#shadow = this.attachShadow({ mode: "closed" })
                  this.#channel = new BroadcastChannel("channel")
                  this.#ctx = createContext(contextSchema!)
                  this.#machine = new Machine(
                    stateConfig as StateConfig<S, any>,
                    actionsConfig!,
                    initialState,
                    this.#ctx.update
                  )
                }

                connectedCallback() {
                  this.#ctx.onUpdate(this.#onUpdateContext)
                  this.#machine.onUpdate((patches: any) => {
                    this.#channel.postMessage({ patches, meta: { tag } })
                  })
                  this.#machine.update(this.#ctx.getSnapshot())
                }

                #onUpdateContext = (patches: JsonPatch[]) => {
                  this.#shadow.dispatchEvent(
                    new CustomEvent("channel", { detail: { patches, meta: { tag } }, bubbles: true, composed: true })
                  )
                }

                updateContext(context: Partial<any>) {
                  const updatedContext = this.#ctx.update(context)
                  if (Object.keys(updatedContext).length === 0) {
                    return
                  }
                  this.#machine.update(updatedContext)
                }

                get currentState() {
                  return this.#machine.currentState
                }
                get isExecuting() {
                  return this.#machine.isExecuting
                }
              }
              if (!customElements.get(elementName)) customElements.define(elementName, WebComponent)
            },
          }
        },
      }
    },
  }
}
