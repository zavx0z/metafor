import { Context } from "../core/context"
import type { ContextInstance, ContextSnapshot, ExtractValues, ContextSchema } from "../core/context"
import { html, nothing, render } from "../core/html"
import { choose, map, ref, repeat, styleMap, when } from "../core/html/directives"
import { extractTemplateLiteral, extractCSSTemplateLiteral, type ViewConfig } from "../core/view"
import { MetaForFabric, type Core, type FabricParams, type Snapshot } from "../core"
import { initMessage, updateContextMessage, stateBeforeActionMessage, stateAfterActionMessage } from "../core/message"
import type { Message } from "../core/message"
import { Processes, type Process } from "../core/proc"
import { Reactions } from "../core/react"
import { checkTransitionConditions, type StatesConfig } from "../core/state"

export type { Message } from "../core/message"
export { ReactionsClone as Reactions } from "../core/react"
export { ContextClone as Context } from "../core/context"
export { ProcessesClone as Processes } from "../core/proc"

export const MetaFor = MetaForFabric(
  <C extends ContextSchema, S extends string, I extends Core>(params: FabricParams<C, S, I>) =>
    class extends HTMLElement {
      #tag = params.tag
      #env = params.env

      #context: ContextInstance<C>
      #states: StatesConfig<S, C>
      #core: I
      #processes: Processes<C, S, I>
      #reactions: Reactions<C, S, I>
      #view: ViewConfig<C, S, I> | undefined

      #shadow: ShadowRoot
      #channel: BroadcastChannel | null = null
      /** ------------state-------------------------------- */
      #state: S = Object.keys(params.states)[0] as S
      #setState(state: S) {
        this.setAttribute("state", state)
        this.#state = state
      }
      /** ------------process-------------------------------- */
      /** индикатор выполнения процесса */
      #process: boolean = false
      /**
       * 1. устанавливает состояние процесса
       * 2. при отключении процесса (после завершения действия)
       *  - обновляет контекст
       *  - выполняет переходы
       */
      #setProcess(process: boolean) {
        if (this.#process === process) return
        this.#process = process
        if (!process) {
          this.#transition()
        }
      }
      /** ------------process-------------------------------- */
      constructor() {
        super()
        this.#shadow = this.attachShadow({ mode: "closed" })

        this.#context = new Context(params.schema)
        this.#states = params.states
        this.#core = params.core
        this.#processes = new Processes(params.process)
        this.#reactions = new Reactions(params.reaction)
        this.#view = params.view

        this.#view?.style?.({
          css: (strings, ...values) => {
            const sheet = new CSSStyleSheet()
            const result = strings.reduce((acc, str, i) => acc + str + (values[i] || ""), "")
            sheet.replaceSync(result)
            this.#shadow.adoptedStyleSheets.push(sheet)
            return sheet
          },
        })
      }

      connectedCallback() {
        this.#updateView()
        this.setAttribute("state", this.#state)
        this.#channel = new BroadcastChannel("channel")
        requestAnimationFrame(this.#init.bind(this))
      }

      #init() {
        if (this.#reactions.hasReactions()) {
          if (this.#channel) this.#channel.onmessage = (ev) => this.#handleReactionMessage(ev.data)
          this.addEventListener("channel", this.#reactionHandler)
        }
        this.#sendEvent(initMessage(this.#tag, this.getSnapshot()))
        const transition = this.#states[this.#state]
        if (transition) {
          const process = this.#processes.getProcess(this.#state)
          if (process) {
            this.#setProcess(true)
            this.#executeAction(process)
            this.#transition()
          } else {
            this.#transition()
          }
        }
        if (this.#view?.onMount) this.#view.onMount()
      }

      disconnectedCallback() {
        this.removeEventListener("channel", this.#reactionHandler)
      }

      /** обновление контекста */
      update = (context: Partial<ExtractValues<C>>) => {
        const updated = this.#context.update(context)
        if (Object.keys(updated).length > 0) {
          this.#sendEvent(updateContextMessage(this.#tag, updated))
          this.#updateView()
        }
        return updated
      }
      /** обработка сообщений из канала */
      #reactionHandler = (ev: Event) => {
        const detail = (ev as CustomEvent).detail
        if (detail?.meta?.tag === this.#tag) return
        this.#handleReactionMessage(detail)
      }
      /**
       * - выполняет действие, устанавливая состояние процесса в true
       * - после успешной обработки действия, если есть success, то обновляет контекст
       * - после ошибки в обработке действия, если есть error, то обновляет контекст
       * - после завершения действия, устанавливает состояние процесса в false
       * - отправляет сообщение о состоянии процесса в канал (MSG)
       *
       * @param process - конфигурация процесса состояния
       * @throws {Error} - если обработчик ошибки не найден
       */
      #executeAction = (process: Process<C, I>) => {
        try {
          this.#broadcastMessage(stateBeforeActionMessage(this.#tag, this.#state))
          const result = process.action({
            context: this.#context.getSnapshot(),
            core: this.#core,
            element: this,
          })
          if (result instanceof Promise) {
            result
              .then((data) => {
                if (process.success) process.success({ update: this.update, data })
              })
              .catch((error) => {
                if (process.error) {
                  if (error instanceof Error) {
                    process.error({ update: this.update, error })
                  } else if (typeof error === "string") {
                    process.error({ update: this.update, error: new Error(error) })
                  } else {
                    throw Error(`Передан неизвестный тип ошибки в состоянии: ${this.#state}`, error)
                  }
                } else throw Error(`Обработчик ошибки не найден для состояния: ${this.#state} \n ${error}`)
              })
              .finally(() => {
                this.#broadcastMessage(stateAfterActionMessage(this.#tag, this.#state))
                this.#setProcess(false)
              })
          } else {
            if (process.success) process.success({ update: this.update, data: result })
            this.#broadcastMessage(stateAfterActionMessage(this.#tag, this.#state))
            this.#setProcess(false)
          }
        } catch (error) {
          if (error instanceof Error) process.error?.({ update: this.update, error })
          this.#broadcastMessage(stateAfterActionMessage(this.#tag, this.#state))
          this.#setProcess(false)
        }
      }

      /**
       * - выполняет переходы с установкой состояния
       * - запускает процесс если есть
       * - отправляет сообщение состояния если нет процесса (MSG)
       */
      #transition = () => {
        const transition = this.#states[this.#state]
        if (!transition) return
        for (const [state, conditions] of Object.entries(transition)) {
          if (checkTransitionConditions(conditions, this.#context.getSnapshot())) {
            const process = this.#processes.getProcess(state as S)
            if (this.#process) return
            if (process) {
              this.#setProcess(true)
              this.#setState(state as S)
              this.#executeAction(process)
            } else {
              this.#setState(state as S)
              this.#channel && this.#broadcastMessage(stateAfterActionMessage(this.#tag, state as S))
              if (!this.#process) this.#transition()
            }
            break
          }
        }
      }
      #broadcastMessage = (message: Message) => {
        if (!this.#channel) return
        this.#channel.postMessage(message)
        this.#updateView()
      }
      #sendEvent = (message: Message) => {
        if (!this.#channel) return
        this.#channel.postMessage(message)
        // this.#shadow.dispatchEvent(
        //   new CustomEvent("channel", {
        //     detail: message,
        //     bubbles: true,
        //     cancelable: false,
        //     composed: true,
        //   })
        // )
      }
      #updateView = () => {
        if (!this.#view?.render) return
        const template = this.#view.render({
          state: this.#state,
          context: this.#context.getSnapshot(),
          core: this.#core,
          update: this.update,
          style: styleMap,
          html,
          ref,
          repeat,
          when,
          map,
          nothing,
          choose,
        })
        if (template) render(template, this.#shadow)
      }
      getSnapshot(): Snapshot<C, S> {
        const context: ContextSnapshot<C> = {} as ContextSnapshot<C>
        const contextCurrentValues = this.#context.getSnapshot()
        for (const [key, value] of Object.entries(this.#context.schema)) {
          context[key as keyof C] = {
            type: value.type,
            required: value.required,
            default: value.default,
            ...(value.title ? { title: value.title } : {}),
            ...(value.values ? { values: value.values } : {}),
            value: contextCurrentValues[key as keyof C],
          }
        }
        const snapshot: Snapshot<C, S> = {
          state: this.#state,
          states: this.#states,
          context,
        }
        if (this.#processes.size > 0) snapshot["processes"] = this.#processes.toSnapshot()
        if (this.#reactions.hasReactions()) snapshot["reactions"] = this.#reactions.toSnapshot()
        if (this.#view?.render) snapshot["view"] = extractTemplateLiteral(this.#view.render)
        if (this.#view?.style) snapshot["style"] = extractCSSTemplateLiteral(this.#view.style)
        return snapshot
      }

      /**
       * Обработка входящих сообщений для реакций
       */
      #handleReactionMessage = (message: Message) => {
        if (!this.#reactions.hasReactions()) return
        const { meta, patch } = message
        const state = this.#state as S
        this.#reactions.run({
          context: this.#context.getSnapshot(),
          core: this.#core,
          meta,
          patch,
          state,
          update: this.update,
        })
      }
    }
)
