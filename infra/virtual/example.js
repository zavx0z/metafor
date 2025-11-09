import { load } from "./dist/virtual.js"
import { Atom } from "@metafor/atom"
const meta = {
  name: "nodes",
  states: {
    данные: {
      ошибка: {
        error: {
          null: false,
        },
      },
      сборка: {
        children: {
          gt: 0,
        },
      },
    },
    сборка: {
      ошибка: {
        error: {
          null: false,
        },
      },
      следующий: {},
    },
    следующий: {
      ошибка: {
        error: {
          null: false,
        },
      },
      сборка: {
        current: {
          gte: 0,
        },
      },
      ожидание: {
        current: {
          lt: 0,
        },
      },
    },
    ожидание: {
      конец: {
        process: {
          length: 0,
        },
      },
    },
    ошибка: {},
    конец: null,
  },
  context: {
    children: {
      type: "number",
      required: true,
      default: 0,
      label: "Кол-во детей",
    },
    current: {
      type: "number",
      required: true,
      default: 0,
      label: "Индекс текущего ребенка",
    },
    process: {
      type: "array",
      required: true,
      default: [],
      label: "создаются",
    },
    success: {
      type: "array",
      required: true,
      default: [],
      label: "успешно завершены",
    },
    rejected: {
      type: "array",
      required: true,
      default: [],
      label: "завершились с ошибкой",
    },
    error: {
      type: "string",
      label: "Ошибка",
    },
  },
  core: {
    child: [],
  },
  processes: {
    данные: {
      type: "action",
      action: {
        src: "({ core }) => core.child.length",
      },
      success: {
        src: '({ data, update }) => update({ children: data, current: 0 }, "s")',
        write: ["children", "current"],
      },
      error: {
        src: '({ error, update }) => update({ error: error.message }, "e")',
        write: ["error"],
      },
    },
    сборка: {
      type: "action",
      action: {
        src: 'async ({ self, context, core }) => {\n        const [{ Atom }, { default: meta }] = await Promise.all([import("@metafor/atom"), import("nodes/node.js")])\n        const node = core.child[context.current]\n        const id = Atom.append(self.atom, meta, { core: { node } })\n        return [...context.process, id]\n      }',
        read: ["current", "process"],
      },
      success: {
        src: '({ data, update }) => update({ process: data }, "s")',
        write: ["process"],
      },
      error: {
        src: '({ error, update }) => update({ error: error.message }, "e")',
        write: ["error"],
      },
    },
    следующий: {
      type: "action",
      action: {
        src: "({ context: { current, children } }) => {\n        const last = current + 1\n        return last === children ? -1 : last\n      }",
        read: ["current", "children"],
      },
      success: {
        src: '({ data, update }) => update({ current: data }, "s")',
        write: ["current"],
      },
      error: {
        src: '({ error, update }) => update({ error: error.message }, "e")',
        write: ["error"],
      },
    },
    конец: {
      type: "finally",
      before: {
        src: '() => {\n      console.log("destroy Nodes")\n    }',
      },
    },
  },
  reactions: {
    reactions: {
      0: {
        label: "",
        cond: '({ context }) => ({\n          atom: { in: context.process },\n          op: "remove",\n        })',
        read: ["success", "process"],
        write: ["success"],
        src: '({ update, atom, context }) => {\n          // if (context.success.length + 1 === context.process.length) self.destroy(false)\n          // else\n          update({ success: [...context.success, atom] }, "r:0")\n        }',
      },
      1: {
        label: "",
        cond: '({ context }) => ({\n          atom: { in: context.process },\n          path: "/context",\n          op: "replace",\n          value: { includeKey: "error" },\n        })',
        read: ["rejected", "success", "process", "error"],
        write: ["error", "rejected"],
        src: '({ update, atom, context }) => {\n          if (context.rejected.length + 1 + context.success.length === context.process.length)\n            update({ error: "Ожидание завершено с ошибкой" }, "r:1")\n          update({ rejected: [...context.rejected, atom] }, "r:1")\n        }',
      },
    },
    states: {
      ожидание: ["0", "1"],
      сборка: ["0", "1"],
      следующий: ["0", "1"],
    },
  },
}
const destroy = await load({ src: "./dist/worker.js", debug: true })
// @ts-ignore
Atom.fromSchema({ meta })
// destroy()
