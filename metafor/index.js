import {matchTrigger} from "./measure.js";
import {parseFunctions} from "./parser.js";

const DEVELOPMENT = true // TODO: реализовать режим разработки
if (DEVELOPMENT) {
  const channel = new BroadcastChannel("validator")
  channel.onmessage = ({ data }) => console.warn(`${data.id}: ${data.message}`)
}

/**
 * @template {import("./types/index.js").ContextDefinition} C - контекст атома
 * @template {Record<string, any>} I - ядро атома
 * @template {string} S - состояние атома
 */
export class ClassMetaFor {
  title = ""
  description = ""
  graph = /** @type {() => Promise<any & HTMLElement>} */() => Promise.resolve(/** @type {any} */ (undefined))
  // graph = /** @type {() => Promise<MetaForGraph & HTMLElement>} */() => Promise.resolve(/** @type {any} */ (undefined))
  component = /**@type {HTMLElement | Element} */ (/** @type {unknown} */ (null))
  #process = false
  #parsedCore = /** @type {Record<string, import('./parser.js').ParsedResult>} */ ({})

  get state() {
    return this.$state.value()
  }

  /** @param {import('./types/metafor.ts').MetaForConstructorParams<C, I, S>} params */
  constructor({
                channel,
                id,
                states,
                contextDefinition,
                transitions,
                initialState,
                contextData,
                actions,
                core,
                coreData,
                reactions,
                onTransition,
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
      this.core = /** @type {import('./types/index.js').Core<I>} */ ({})
      this.actions = {}
      this.transitions.length = 0
      this.reactions.length = 0
      this.#parsedCore = {}
      if (typeof destroy === "function") destroy(this)
    }
    this.states = states
    this.$state = this.#createSignal(initialState)
    this.context = /**@type{import('./types/index.js').ContextData<C>}*/ (
        Object.keys(contextDefinition).reduce((acc, key) => {
          const createValue = contextData && contextData[key]
          const defaultValue = "default" in contextDefinition[key] ? contextDefinition[key].default : undefined
          if (typeof createValue !== "undefined") return {...acc, [key]: createValue}
          else if (typeof defaultValue !== "undefined") return {...acc, [key]: defaultValue}
          else return {...acc, [key]: "nullable" in contextDefinition[key] ? null : undefined}
        }, {})
    )

    this.types = contextDefinition
    this.transitions = transitions || []
    if (onTransition)
      this.$state.onChange((oldValue, newValue) => {
        if (newValue !== undefined) onTransition(oldValue, newValue, this)
      })
    if (onUpdate) this.onUpdate(onUpdate)

    this.core = /** @type {import('./types/index.js').Core<I>}*/ (
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
        if (reaction.atom && reaction.atom === meta.name) {
          reaction.action({
            patch,
            context: this.context,
            meta,
            update: ctx => this.#updateContext({context: ctx, srcName: "reaction", funcName: meta.name}),
            core: this.core
          })
        }
      })
    }
    const actionDefinition = this.transitions.find(i => i.from === this.state && i.action)
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
  #transition() {
    const transitions = this.transitions.find(t => t.from === this.state)
    if (transitions) {
      for (const transition of transitions.to) {
        if (Object.keys(transition.trigger).length === 0) break
        if (matchTrigger(transition.trigger, this.context, this.types)) {
          const actionDefinition = this.transitions.find(i => i.from === transition.state && i.action)
          const action = actionDefinition?.action && this.actions[actionDefinition.action]
          if (!action) {
            this.$state.setValue(transition.state)
            break
          }
          this.process = true
          this.$state.setValue(transition.state)
          this.#runAction(action)
          break
        }
      }
    }
  }

  /**  Обновление контекста из внешнего источника (core, reaction)
   * @param {import("./types/metafor.ts").UpdateContextParams<C>} params - параметры обновления контекста */
  _updateExternal = ({context, srcName = "core", funcName = "unknown"}) => {
    const updCtx = this.#updateContext({context, srcName, funcName})
    if (updCtx && !this.process) this.#transition()
  }

  /** @param {import('./types/index.js').Action<C, I>} action */
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

  /** @param {import('./types/metafor.ts').UpdateContextParams<C>} params */
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
            meta: {name: this.id, func: funcName, target: srcName, timestamp: Date.now()},
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
    this.#transition()
  }

  #updateListeners = new Set()

  /** Уведомления об изменении значений контекста
   * @param {(values: import('./types/context.js').OnUpdateContextData<C>) => void} listener - функция которая будет вызываться при изменении значений контекста
   * @returns {() => void} функция для отписки от уведомлений */
  onUpdate(listener) {
    this.#updateListeners.add(listener)
    return () => this.#updateListeners.delete(listener)
  }

  /** Уведомления о переходах между состояниями
   * @param {(oldState: S, newState: S) => void} listener
   * @returns {() => void} */
  onTransition = listener =>
      this.$state.onChange((oldValue, newValue) => {
        if (newValue !== undefined) listener(oldValue, newValue)
      })

  /** @returns {import('./types/index.js').Snapshot<C, S>} */
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
      transitions: this.transitions.map(t => ({
        from: t.from,
        to: t.to.map(toState => ({
          state: toState.state,
          trigger: toState.trigger
        })),
        action: t.action
      }))
    }
  }

  /** @template T
   * @param {T} value
   * @returns {import('./types/state.js').SignalType<T>} */
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

/**
 *  @param {string} tag - Имя атома.
 *  @param {string} [description] - Краткое описание.
 *  */
export function MetaFor(tag, description = "") {
  return {
    /**
     * @template {string} S
     * @param {...S} states - Список состояний.
     * @returns {{
     *  context: <C extends import("./types").ContextDefinition>(context: import("./types/context").ContextCallback<C>) => {
     *   transitions: (transitions: import("./types").Transitions<C, S>) => {
     *    core: <I extends import("./types/core").CoreObj> (core: import("./types").CoreDefinition<I, C> = () => Object.create({})) => {
     *     actions: (actions: import("./types").Actions<C, I>) => {
     *      reactions: (reactions: import("./types/reaction").ReactionType<C, I>) => {
     *       create: (data: import("./types/create").CreateOptions<C,S,I>) => ClassMetaFor<C,I,S>,
     *       view: (view: import("./types/view").ViewDefinition<I, C, S>) => {
     *         create: (data: import("./types/create").CreateOptions<C,S,I>) => ClassMetaFor<C,I,S>,
     *        }
     *       },
     *       create: (data: import("./types/create").CreateOptions<C,S,I>) => ClassMetaFor<C,I,S>,
     *       view: (view: import("./types/view").ViewDefinition<I, C, S>) => {
     *        create: (data: import("./types/create").CreateOptions<C,S,I>) => ClassMetaFor<C,I,S>,
     *       }
     *      }
     *     }
     *    }
     *   }
     * }}
     */
    states(...states) {
      DEVELOPMENT && import("./validator/index.js").then((module) => module.validateStates({ tag, states }))
      return {
        /**
         * @template {import("./types/index.js").ContextDefinition} C
         * @param {import("./types/context.js").ContextCallback<C>} context - Определение вложенного контекста.
         */
        context(context) {
          const contextDefinition = context(t)
          DEVELOPMENT &&
            import("./validator/index.js").then((module) =>
              module.validateContextDefinition({ tag, context: contextDefinition })
            )
          return {
            transitions(transitions) {
              DEVELOPMENT &&
                import("./validator/index.js").then((module) =>
                  module.validateTransitions({ tag, transitions, contextDefinition })
                )
              return {
                core(core = () => Object.create({})) {
                  const coreDefinition = core
                  DEVELOPMENT &&
                    import("./validator/index.js").then((module) => module.validateCore({ tag, core: coreDefinition }))
                  return {
                    actions(actions) {
                      return {
                        reactions: (reactions = []) => ({
                          create: options => createParticle({options, tag, description, states, contextDefinition, transitions, actions, coreDefinition, reactions}),
                          view: view => createViewHandler(tag, description, states, contextDefinition, transitions, actions, coreDefinition, reactions)(view),
                        }),
                        create: options => createParticle({options, tag, description, states, contextDefinition, transitions, actions, coreDefinition, reactions:[]}),
                        view: view => createViewHandler(tag, description, states, contextDefinition, transitions, actions, coreDefinition, [])(view), 
                      }
                    },
                  }
                },
              }
            },
          }
        },
      }
    },
  }
}

/**
 * Создание атома
 * @template {import("./types/context.js").ContextDefinition} C - Определение контекста
 * @template {string} S - Тип состояния
 * @template {import("./types/core.js").CoreObj} I - Тип данных ядра
 * @param {import("./types/create.js").CreateOptions<C, S, I>} options - Опции создания атома
 */
function createParticle({options, tag, description, states, contextDefinition, transitions, actions, coreDefinition, reactions}) {
  // Валидация опций атома
  DEVELOPMENT && import("./validator/index.js").then((module) => module.validateAtomOptions({ tag, options, states }))

  const { meta, state, context = {}, debug, graph, onTransition, core, onUpdate } = options
  const channel = new BroadcastChannel("channel")
  const atom = new ClassMetaFor({
    channel,
    id: meta?.name || tag,
    states,
    contextDefinition,
    transitions,
    initialState: state,
    contextData: context,
    actions,
    core: coreDefinition,
    // @ts-ignore
    coreData: core,
    reactions,
    onTransition,
    onUpdate,
  })

  // atom.title = name
  atom.description = description || options.description || ""
  if (graph) atom.graph = () => import("./web/graph.js").then((module) => module.default(atom))
  if (debug) import("./debug.js").then((module) => module.default(atom, debug))

  return atom
}

/**
 * Создает обработчик для view
 * @template {import("./types/context.js").ContextDefinition} C - Определение контекста
 * @template {string} S - Тип состояния
 * @template {import("./types/core.js").CoreObj} I - Тип данных ядра
 * @param {string} tag - Идентификатор атома
 * @param {string} description - Описание атома
 * @param {S[]} states - Список состояний
 * @param {import("./types/context.js").ContextDefinition} contextDefinition - Определение контекста
 * @param {import("./types/transition.ts").Transitions<C, S>} transitions - Определение переходов
 * @param {import("./types/action.js").Actions<C, I>} actions - Определение действий
 * @param {import("./types/core.js").CoreDefinition<I, C>} coreDefinition - Определение ядра
 * @param {import("./types/reaction.js").ReactionType<C, I>} reactions - Определение реакций
 * @returns {(view: import("./types/view").ViewDefinition<I, C, S>) => {
 *   create: (options: import("./types/create").CreateOptions<C,S,I>) => import("./index.js").ClassMetaFor<C,I,S>
 * }} - Функция обработчик view
 */
function createViewHandler(
  tag,
  description,
  states,
  contextDefinition,
  transitions,
  actions,
  coreDefinition,
  reactions
) {
  return function (view) {
    return {
      create: (options) => {
        const atom = createParticle({
          options,
          tag,
          description,
          states,
          contextDefinition,
          transitions,
          actions,
          coreDefinition,
          reactions,
        })
        if (view.isolated === undefined) view.isolated = true
        if (options.view?.isolated === false) view.isolated = false
        import("./web/component.js").then((module) => module.default({ view, atom }))
        return atom
      },
    }
  }
}

/** @type {import("./types/index.js").ContextTypes} */ // prettier-ignore
let t = {
  string: params => ({type: "string", ...params}),
  number: params => ({type: "number", ...params}),
  boolean: params => ({type: "boolean", ...params}),
  array: params => ({type: "array", ...params}),
  enum: (...values) => (params = {}) => ({type: "enum", values, ...params})
}
