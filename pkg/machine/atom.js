import {QuantumAtom} from "./QuantumAtom.js"

const DEVELOPMENT = true // TODO: реализовать режим разработки
if (DEVELOPMENT) {
  const channel = new BroadcastChannel("validator")
  channel.onmessage = ({data}) => console.warn(`${data.id}: ${data.message}`)
}

/**
 *  @param {string} tag - Имя атома.
 *  @param {string} [description] - Краткое описание.
 *  */
export function Atom(tag, description = "") {
  return {
    /**
     * @template {string} S
     * @param {...S} states - Список состояний.
     * @returns {{
     *  context: <C extends import("./types").ContextDefinition>(context: import("./types/context").ContextCallback<C>) => {
     *   collapses: (collapses: import("./types").Collapses<C, S>) => {
     *    core: <I extends import("./types/core").CoreObj> (core: import("./types").CoreDefinition<I, C> = () => Object.create({})) => {
     *     actions: (actions: import("./types").Actions<C, I>) => {
     *      reactions: (reactions: import("./types/reaction").ReactionType<C, I>) => {
     *       create: (data: import("./types/create").CreateOptions<C,S,I>) => import("./QuantumAtom.js").QuantumAtom<C,I,S>,
     *       view: (view: import("./types/view").ViewDefinition<I, C, S>) => {
     *         create: (data: import("./types/create").CreateOptions<C,S,I>) => import("./QuantumAtom.js").QuantumAtom<C,I,S>,
     *        }
     *       },
     *       create: (data: import("./types/create").CreateOptions<C,S,I>) => import("./QuantumAtom.js").QuantumAtom<C,I,S>,
     *       view: (view: import("./types/view").ViewDefinition<I, C, S>) => {
     *        create: (data: import("./types/create").CreateOptions<C,S,I>) => import("./QuantumAtom.js").QuantumAtom<C,I,S>,
     *       }
     *      }
     *     }
     *    }
     *   }
     * }}
     */
    states(...states) {
      DEVELOPMENT && import("./validator/index.js").then(module => module.validateStates({tag, states}))
      return {
        /**
         * @template {import("./types").ContextDefinition} C
         * @param {import("./types/context").ContextCallback<C>} context - Определение вложенного контекста.
         */
        context(context) {
          const contextDefinition = context(t)
          DEVELOPMENT && import("./validator/index.js").then(module => module.validateContextDefinition({tag, context: contextDefinition}))
          return {
            collapses(collapses) {
              DEVELOPMENT && import("./validator/index.js").then(module => module.validateCollapses({tag, collapses, contextDefinition}))
              return {
                core(core = () => Object.create({})) {
                  const coreDefinition = core
                  DEVELOPMENT && import("./validator/index.js").then(module => module.validateCore({tag, core: coreDefinition}))
                  return {
                    actions(actions) {
                      return {
                        reactions(reactions = []) {
                          return {
                            create: options => createAtom(options, tag, description, states, contextDefinition, collapses, actions, coreDefinition, reactions),
                            view(view) {
                              return {
                                create: options => {
                                  const atom = createAtom(options, tag, description, states, contextDefinition, collapses, actions, coreDefinition, reactions)
                                  if (view.isolated === undefined) view.isolated = true
                                  if (options.view?.isolated === false) view.isolated = false
                                  import("./web/component.js").then(module => module.default({view, atom}))                                  
                                  return atom
                                }
                              }
                            }
                          }
                        },
                        create: options => createAtom(options, tag, description, states, contextDefinition, collapses, actions, coreDefinition, []),
                        view(view) {
                          return {
                            create: options => {
                              const atom = createAtom(options, tag, description, states, contextDefinition, collapses, actions, coreDefinition, [])
                              if (view.isolated === undefined) view.isolated = true
                              if (options.view?.isolated === false) view.isolated = false
                              import("./web/component.js").then(module => module.default({view, atom}))
                              return atom
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}

/**
 * Создание атома
 * @template {import("./types/context").ContextDefinition} C - Определение контекста
 * @template {string} S - Тип состояния
 * @template {import("./types/core").CoreObj} I - Тип данных ядра
 * @param {import("./types/create").CreateOptions<C, S, I>} options - Опции создания атома
 * @param {string} tag - Идентификатор атома
 * @param {string} description - Описание атома
 * @param {S[]} states - Список состояний
 * @param {import("./types/context").ContextDefinition} contextDefinition - Определение контекста
 * @param {import("./types/collapse.js").Collapses<C, S>} collapses - Определение коллапсов
 * @param {import("./types/action").Actions<C, I>} actions - Определение действий
 * @param {import("./types/core").CoreDefinition<I, C>} coreDefinition - Определение ядра
 * @param {import("./types/reaction").ReactionType<C, I>} reactions - Определение реакций
 * @returns {import("./QuantumAtom.js").QuantumAtom<C, I, S>} - Атом
 * */
function createAtom(options, tag, description, states, contextDefinition, collapses, actions, coreDefinition, reactions) {
  // Валидация опций атома
  DEVELOPMENT && import("./validator/index.js").then(module => module.validateAtomOptions({tag, options, states}))

  const {meta, state, context = {}, debug, graph, onCollapse, core, onUpdate} = options
  const channel = new BroadcastChannel("channel")
  const atom = new QuantumAtom({
    channel,
    id: meta?.name || tag,
    states,
    contextDefinition,
    collapses,
    initialState: state,
    contextData: context,
    actions,
    core: coreDefinition,
    // @ts-ignore
    coreData: core,
    reactions,
    onCollapse,
    onUpdate
  })

  // atom.title = name
  atom.description = description || options.description || ""
  if (graph) atom.graph = () => import("./web/graph.js").then(module => module.default(atom))
  if (debug) import("./debug.js").then(module => module.default(atom, debug))

  return atom
}

/** @type {import("./types").ContextTypes} */ // prettier-ignore
let t = {
  string: params => ({type: "string", ...params}),
  number: params => ({type: "number", ...params}),
  boolean: params => ({type: "boolean", ...params}),
  array: params => ({type: "array", ...params}),
  enum: (...values) => (params = {}) => ({type: "enum", values, ...params})
}
