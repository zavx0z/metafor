import { Initiator, type Photon } from "../em.t"
import { type Impulse, Energy } from "./stack.t"
export { type Impulse, Energy }

export function getImpulseType(stack: Impulse[], impulse: Impulse): Energy {
  if (impulse.op === "add") return Energy.Init
  if (impulse.op === "test") {
    const lastTask = stack[stack.length - 1]
    if (stack[0]?.op === "add") return Energy.AfterInit
    return Energy.Action
  }
  if (impulse.op === "replace") {
    if (impulse.path === "/state" && impulse.initiator === Initiator.Success) return Energy.Success
    if (impulse.path === "/state" && impulse.initiator === Initiator.Error) return Energy.Error
    if (impulse.path === "/state" && impulse.initiator === Initiator.Transition) return Energy.Transition
    if (impulse.path === "/context" && impulse.initiator === Initiator.Success) return Energy.SuccessUpdate
    if (impulse.path === "/context" && impulse.initiator === Initiator.Error) return Energy.ErrorUpdate
    if (impulse.path === "/context" && impulse.initiator === Initiator.Transition) return Energy.ReactionUpdate
  }
  if (impulse.op === "remove") return Energy.Destroy
  return Energy.Nothing
}

export function impulseInStack(stack: Impulse[], photon: Photon) {
  for (const impulse of stack) {
    if (impulse.atom !== photon.atom) continue
    if (impulse.initiator !== photon.initiator) continue
    if (impulse.op !== photon.patches[0]!.op) continue
    if (impulse.path !== photon.patches[0]!.path) continue
    return true
  }
  return false
}

/**
 * Очищает стек процесса состояния.
 *
 * Состояние с процессом action().success().error() | action().success() | action().error() | action()
 *
 *   - срабатывает один из этапов success/error, где каждый из этапов может обновлять контекст результатом из action
 *    ```js
 *     [
 *       {path: "/state", op: "test", value: state},
 *       {path: "/context", op: "replace", initiator: Initiator.Success},
 *       {path: "/state", op: "replace", value: state}
 *     ]
 *    ```
 *    ```js
 *     [
 *       {path: "/state", op: "test", value: state},
 *       {path: "/context", op: "replace", initiator: Initiator.Error},
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
 *       {path: "/context", op: "replace", initiator: Initiator.Reaction},
 *       {path: "/context", op: "replace", initiator: Initiator.Reaction},
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
 *       {path: "/context", op: "replace", initiator: Initiator.Reaction},
 *       {path: "/context", op: "replace", initiator: Initiator.Reaction},
 *     ]
 *    ```
 */
export function clearProcessImpulse(stack: Impulse[], state: string): Impulse[] {
  let INTO = false

  stack = stack.filter((task) => {
    // НАЧАЛО ПРОЦЕССА [без процесса в состоянии отсутствует]
    if (task.path === "/state" && task.op === "test" && task.value === state) {
      INTO = true
      return false
    }
    // ОБНОВЛЕНИЕ КОНТЕКСТА ОБРАБОТЧИКОМ SUCCESS/ERROR
    // Успешное завершение процесса (обновление контекста) [без объявления в процессе этапа success - отсутствует]
    if (task.path === "/context" && task.op === "replace" && task.initiator === Initiator.Success) return false
    // Неуспешное завершение процесса (обновление контекста) [без объявления в процессе этапа error - отсутствует]
    if (task.path === "/context" && task.op === "replace" && task.initiator === Initiator.Error) return false

    // ОБРАБОТКА ВОЗМОЖНЫХ ПАТЧЕЙ ОБНОВЛЕНИЯ КОНТЕКСТА РЕАКЦИЯМИ ВНУТРИ ПРОЦЕССА
    if (INTO && task.path === "/context" && task.op === "replace" && task.initiator === Initiator.Reaction) return false

    // КОНЕЦ ПРОЦЕССА [присутствует всегда в любом переходе]
    if (task.path === "/state" && task.op === "replace" && task.value === state) {
      INTO = false
      return false
    }

    return true
  })
  return stack
}
