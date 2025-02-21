import {matchTrigger} from "./measure.js"
import {parseFunction, parseFunctions} from "./parser.js"

/**
 * @template {import("./types").ContextDefinition} C - контекст атома
 * @template {Record<string, any>} I - ядро атома
 * @template {string} S - состояние атома
 */
export class QuantumAtom {
  title = ""
  description = ""
  graph = /** @type {() => Promise<QGraphAtom & HTMLElement>} */ () => Promise.resolve(/** @type {any} */ (undefined))
  component = /**@type {HTMLElement | Element} */ (/** @type {unknown} */ (null))
  #process = false
  #parsedCore = /** @type {Record<string, import('./parser.js').ParsedResult>} */ ({})

  get state() {
    return this.$state.value()
  }

  /** @param {import('./types/quantum').QuantumAtomConstructorParams<C, I, S>} params */
  constructor({
    channel,
    id,
    states,
    contextDefinition,
    collapses,
    initialState,
    contextData,
    actions,
    core,
    coreData,
    reactions,
    onCollapse,
    onUpdate,
    destroy
  }) {
    this.channel = channel
    this.id = id
    this.destroy = () => {
      this.channel.close()
      this.#updateListeners.clear()
      this.$state.clear()
      this.types = {}
      this.context = {}
      this.core = /** @type {import('./types').Core<I>} */ ({})
      this.actions = {}
      this.collapses.length = 0
      this.reactions.length = 0
      this.#parsedCore = {}
      if (typeof destroy === "function") destroy(this)
    }
    this.states = states
    this.context = /**@type{import('./types').ContextData<C>}*/ (
      Object.keys(contextDefinition).reduce((acc, key) => {
        const createValue = contextData && contextData[key]
        const defaultValue = "default" in contextDefinition[key] ? contextDefinition[key].default : undefined
        if (typeof createValue !== "undefined") return {...acc, [key]: createValue}
        else if (typeof defaultValue !== "undefined") return {...acc, [key]: defaultValue}
        else return {...acc, [key]: "nullable" in contextDefinition[key] ? null : undefined}
      }, {})
    )

    this.types = contextDefinition
    this.collapses = collapses || []
    this.$state = this.#createSignal(initialState)
    if (onCollapse)
      this.$state.onChange((oldValue, newValue) => {
        if (newValue !== undefined) onCollapse(oldValue, newValue, this)
      })
    if (onUpdate) this.onUpdate(onUpdate)

    this.core = /** @type {import('./types').Core<I>}*/ (
      (() => {
        let /** @type {string | null} */ currentCaller = null
        const self = /** @type {import('./types/core.ts').Core<I>} */ ({})
        const coreObj = core({
          update: ctx => this._updateExternal({context: ctx, srcName: "core", funcName: currentCaller || "unknown"}),
          context: this.context,
          self
        })

        // Создаем прокси для self, чтобы синхронизировать значения
        Object.entries(coreObj).forEach(([key, value]) => {
          if (typeof value !== "function") {
            Object.defineProperty(self, key, {
              get: () => coreObj[key],
              //@ts-ignore
              set: newValue => (coreObj[key] = newValue),
              enumerable: true,
              configurable: true
            })
          } else {
            //@ts-ignore
            self[key] = value
          }
        })

        const wrappedCore = Object.entries(coreObj).reduce((acc, [name, value]) => {
          if (typeof value === "function") {
            //@ts-ignore
            acc[name] = (...args) => {
              currentCaller = name
              const result = value.apply(coreObj, args)
              currentCaller = null
              return result
            }
          } else {
            Object.defineProperty(acc, name, {
              get: () => coreObj[name],
              set: newValue => {
                //@ts-ignore
                coreObj[name] = newValue
              },
              enumerable: true,
              configurable: true
            })
          }
          return acc
        }, {})
        Object.assign(self, wrappedCore)
        return wrappedCore
      })()
    )
    //@ts-ignore присваивание свойству ядра переданного объекта, массива или карты
    Object.entries(coreData || {}).forEach(
      ([key, value]) =>
        this.core[key] !== undefined && //@ts-ignore
        (this.core[key] = Array.isArray(value)
          ? value //@ts-ignore
          : (this.core[key] = Object.isFrozen(value) ? value : Object.freeze(value)))
    )

    this.actions = actions
    this.reactions = reactions
    // TODO: при восстановлении атома входить в состояние без вызова действия
    this.process = true
    this.channel.postMessage({
      meta: {atom: this.id, func: "constructor", target: "atom", timestamp: Date.now()},
      patch: {path: "/", op: "add", value: this.snapshot()}
    })
    this.channel.onmessage = ({data: {meta, patch}}) => {
      this.reactions.forEach(reaction => {
        if (reaction.atom && reaction.atom === meta.atom) {
          reaction.action({
            patch,
            context: this.context,
            meta,
            update: ctx => this.#updateContext({context: ctx, srcName: "reaction", funcName: meta.atom}),
            core: this.core
          })
        }
      })
    }
    const actionDefinition = this.collapses.find(i => i.from === this.state && i.action)
    const action = actionDefinition?.action && this.actions[actionDefinition.action]
    if (action) {
      const result = action({
        context: this.context,
        update: ctx => this.#updateContext({context: ctx, srcName: "action", funcName: action.name}),
        core: this.core
      })
      const finallyFn = () => (this.process = false)
      if (result?.then) result.finally(finallyFn)
      else finallyFn()
    } else this.process = false
  }

  get process() {
    return this.#process
  }

  set process(value) {
    this.#process = value
    if (!value) this.update(this.context)
  }

  /** Проверка триггеров и выполнение действия */
  #collapse() {
    const collapses = this.collapses.find(t => t.from === this.state)
    if (collapses) {
      for (const collapse of collapses.to) {
        if (Object.keys(collapse.trigger).length === 0) break
        if (matchTrigger(collapse.trigger, this.context, this.types)) {
          const actionDefinition = this.collapses.find(i => i.from === collapse.state && i.action)
          const action = actionDefinition?.action && this.actions[actionDefinition.action]
          if (!action) {
            this.$state.setValue(collapse.state)
            break
          }
          this.process = true
          this.$state.setValue(collapse.state)
          this.#runAction(action)
          break
        }
      }
    }
  }

  /**  Обновление контекста из внешнего источника (core, reaction)
   * @param {import("./types/quantum").UpdateContextParams<C>} params - параметры обновления контекста */
  _updateExternal = ({context, srcName = "core", funcName = "unknown"}) => {
    const updCtx = this.#updateContext({context, srcName, funcName})
    if (updCtx && !this.process) this.#collapse()
  }

  /** @param {import('./types').Action<C, I>} action */
  #runAction(action) {
    this.process = true
    const result = action({
      context: this.context,
      update: ctx => this.#updateContext({context: ctx, srcName: "action", funcName: action.name}),
      core: this.core
    })
    const finallyFn = () => (this.process = false)
    if (result?.then) result.finally(finallyFn)
    else finallyFn()
  }

  /** @param {import('./types/quantum.ts').UpdateContextParams<C>} params */
  #updateContext = ({context, srcName = "unknown", funcName = "unknown"}) => {
    const updCtx = Object.keys(context).reduce((acc, /** @type {keyof C} */ key) => {
      if (this.context[key] !== context[key]) {
        this.context[key] = context[key]
        return {...acc, [key]: context[key]}
      }
      return acc
    }, {})
    if (Object.keys(updCtx).length > 0) {
      this.#updateListeners.forEach(listener => listener(updCtx, srcName, funcName))
      this.channel.postMessage(
        /** @type {BroadcastMessage} */ ({
          meta: {atom: this.id, func: funcName, target: srcName, timestamp: Date.now()},
          patch: {path: `/context`, op: "replace", value: updCtx}
        })
      )
    }
    return updCtx
  }

  /** @type {import('./types/context.ts').Update<C>} */
  update = context => {
    this.#updateContext({context})
    if (this.process) return undefined
    this.#collapse()
  }

  #updateListeners = new Set()

  /** Уведомления об изменении значений контекста
   * @param {(values: import('./types/context').OnUpdateContextData<C>) => void} listener - функция которая будет вызываться при изменении значений контекста
   * @returns {() => void} функция для отписки от уведомлений */
  onUpdate(listener) {
    this.#updateListeners.add(listener)
    return () => this.#updateListeners.delete(listener)
  }

  /** Уведомления о переходах в состояния
   * @param {(oldState: S, newState: S) => void} listener
   * @returns {() => void} */
  onCollapse = listener =>
    this.$state.onChange((oldValue, newValue) => {
      if (newValue !== undefined) listener(oldValue, newValue)
    })

  /** @returns {import('./types').Snapshot<C, S>} */
  snapshot() {
    const parsedActions = parseFunctions(this.actions)
    return {
      id: this.id,
      title: this.title || "",
      description: this.description || "",
      state: this.state,
      states: this.states,
      actions: parsedActions,
      core: this.#parsedCore,
      context: this.context,
      types: this.types,
      collapses: this.collapses.map(t => ({
        from: t.from,
        action: t.action,
        to: t.to.map(toState => ({
          state: toState.state,
          trigger: toState.trigger
        }))
      }))
    }
  }

  /** @template T
   * @param {T} value
   * @returns {import('./types/state').SignalType<T>} */
  #createSignal(value) {
    const listeners = new Set()
    return {
      value: () => value,
      setValue: next => {
        if (value !== next) {
          const oldValue = value
          value = next
          listeners.forEach(listener => listener(oldValue, next))
          this.channel.postMessage({
            meta: {atom: this.id, timestamp: Date.now()},
            patch: {path: "/state", op: "replace", value: next}
          })
        }
      },
      onChange: listener => {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
      clear: () => {
        listeners.clear()
      }
    }
  }
}
