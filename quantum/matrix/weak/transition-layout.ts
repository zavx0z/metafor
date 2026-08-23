import type {FieldBytecode} from "@matrix/types/gpu"

type TransitionWithTarget = {
  targetState: number | null
}

type ExecutableTransition<T extends TransitionWithTarget> = T & {
  targetState: number
}

type CompiledConditionBlock = {
  instructions: number[]
  heap: number[]
}

const isExecutableTransition = <T extends TransitionWithTarget>(
  transition: T,
): transition is ExecutableTransition<T> =>
  transition.targetState !== null

/**
 * Собирает общий для обоих внутренних составителей формат программы переходов.
 *
 * `null` удаляется до подсчёта переходов и адресов, поэтому не занимает место
 * в исполняемом блоке State.
 *
 * @see [Пустая запись перед настоящим Transition](https://github.com/zavx0z/metafor/blob/main/matrix/tests/superposition.spec.ts#L135-L161)
 */
export function compileTransitionLayout<T extends TransitionWithTarget>(
  transitions: readonly (readonly T[])[],
  compileConditions: (transition: ExecutableTransition<T>) => CompiledConditionBlock,
): FieldBytecode {
  const executableByState = transitions.map((stateTransitions) =>
    stateTransitions.filter(isExecutableTransition),
  )
  const conditionBlocks = executableByState.flatMap((stateTransitions) =>
    stateTransitions.map(compileConditions),
  )

  const stateTableLength = executableByState.length
  const stateBlocksLength = executableByState.reduce(
    (sum, stateTransitions) => sum + 1 + stateTransitions.length * 2,
    0,
  )
  const conditionBlocksStart = stateTableLength + stateBlocksLength
  const conditionBlockSizes = conditionBlocks.map((block) => block.instructions.length + block.heap.length)
  const statePointers: number[] = []
  const stateBlocks: number[] = []
  let conditionBlockIndex = 0
  let conditionBlockOffset = conditionBlocksStart

  for (const stateTransitions of executableByState) {
    statePointers.push(stateTableLength + stateBlocks.length)
    stateBlocks.push(stateTransitions.length)

    for (const transition of stateTransitions) {
      stateBlocks.push(transition.targetState)
      stateBlocks.push(conditionBlockOffset)
      conditionBlockOffset += conditionBlockSizes[conditionBlockIndex]!
      conditionBlockIndex++
    }
  }

  const bytecode = [...statePointers, ...stateBlocks]
  for (const block of conditionBlocks) {
    bytecode.push(...block.instructions)
    bytecode.push(...block.heap)
  }

  return {
    bytecode: new Uint32Array(bytecode),
    bytecodeOffset: 0,
  }
}
