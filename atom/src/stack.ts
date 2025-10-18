import { Source } from "../electromagnetic.t"
import { type Task, Tasks } from "./stack.t"
export { type Task, Tasks }
/**
 * Очищает стек процесса состояния.
 *
 * Состояние с процессом action().success().error() | action().success() | action().error() | action()
 *
 *   - срабатывает один из этапов success/error, где каждый из этапов может обновлять контекст результатом из action
 *    ```js
 *     [
 *       {path: "/state", op: "test", value: state},
 *       {path: "/context", op: "replace", src: MsgSrc.Success},
 *       {path: "/state", op: "replace", value: state}
 *     ]
 *    ```
 *    ```js
 *     [
 *       {path: "/state", op: "test", value: state},
 *       {path: "/context", op: "replace", src: MsgSrc.Error},
 *       {path: "/state", op: "replace", value: state}
 *     ]
 *    ```
 *   - может и не обновлять, тогда патч {path: "/context"} не добавляется
 *    ```js
 *     [
 *       {path: "/state", op: "test", value: state},
 *       {path: "/state", op: "replace", value: state}
 *     ]
 *    ```
 *   - еще в процессе может контекст обновиться сторонним источником через реакции
 *    ```js
 *     [
 *       {path: "/state", op: "test", value: state},
 *       {path: "/context", op: "replace", src: MsgSrc.Reaction},
 *       {path: "/context", op: "replace", src: MsgSrc.Reaction},
 *       {path: "/state", op: "replace", value: state}
 *     ]
 *    ```
 *   - в стеке могут храниться патчи обновления контекста вне процесса,
 *     то есть когда процесс завершается, атом может оставаться в состоянии,
 *     но контекст обновляется сторонним источником через реакции
 *     !ВАЖНО: при очистке стека, патчи обновления контекста вне процесса не удаляются!
 *    ```js
 *     [
 *       {path: "/state", op: "test", value: state},
 *       {path: "/state", op: "replace", value: state}
 *       {path: "/context", op: "replace", src: MsgSrc.Reaction},
 *       {path: "/context", op: "replace", src: MsgSrc.Reaction},
 *     ]
 *    ```
 */
export function clearProcessTasks(stack: Task[], state: string): Task[] {
  let INTO = false

  stack = stack.filter((task) => {
    // НАЧАЛО ПРОЦЕССА [без процесса в состоянии отсутствует]
    if (task.path === "/state" && task.op === "test" && task.value === state) {
      INTO = true
      return false
    }
    // ОБНОВЛЕНИЕ КОНТЕКСТА ОБРАБОТЧИКОМ SUCCESS/ERROR
    // Успешное завершение процесса (обновление контекста) [без объявления в процессе этапа success - отсутствует]
    if (task.path === "/context" && task.op === "replace" && task.src === Source.Success) return false
    // Неуспешное завершение процесса (обновление контекста) [без объявления в процессе этапа error - отсутствует]
    if (task.path === "/context" && task.op === "replace" && task.src === Source.Error) return false

    // ОБРАБОТКА ВОЗМОЖНЫХ ПАТЧЕЙ ОБНОВЛЕНИЯ КОНТЕКСТА РЕАКЦИЯМИ ВНУТРИ ПРОЦЕССА
    if (INTO && task.path === "/context" && task.op === "replace" && task.src === Source.Reaction) return false

    // КОНЕЦ ПРОЦЕССА [присутствует всегда в любом переходе]
    if (task.path === "/state" && task.op === "replace" && task.value === state) {
      INTO = false
      return false
    }

    return true
  })
  return stack
}
