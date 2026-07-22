# Matrix

Matrix детерминированно вычисляет State, Transition и момент запуска Process.
Energy исполняет Process; Matrix не выполняет его side effects.

## Главный закон структурного изменения

Изменение структуры одного Atom не должно перестраивать всю Matrix и не должно
повторно запускать незатронутый Process.

Простой пример: Browser Process уже выполняется, а Boundary добавляет дочерний
Screenshot Atom. Matrix добавляет Screenshot в свободный brane slot. Row
Browser остаётся на прежнем месте вместе с lock и `processExecutionId`, поэтому
второй Browser Photon не появляется. Execution не копируется и не создаётся
заново: Matrix проверяет тот же Meta State ID и при перестановке State лишь
обновляет числовой адрес pending execution.

## Граница изменения

Structural Graviton затрагивает:

- изменившийся, добавленный или удалённый Atom;
- всю транзитивно связанную компоненту Atom по canonical `valueId` (если
  A делит value с B, а B другой value с C, затрагиваются A, B и C);
- Atom изменившегося WIMP при изменении любой его declaration.

Остальная projection не перечитывается и её rows не переписываются. Удаление
освобождает brane slot; добавление переиспользует свободный slot либо расширяет
Store. Соседние Atom не перенумеровываются.

Изменение Process declaration инвалидирует только executions Atom этого WIMP.
Удаление Atom или смена его State также отменяет только его pending execution.
Во всех остальных случаях прежний `processExecutionId` продолжает обычный
claim/result handshake. Выполняющийся State узнаётся по canonical Meta State ID,
а не по позиции в массиве: если перед ним добавили другой State, внутренний
`stateIndex` меняется, но execution остаётся тем же.

## Store и Weak

Matrix хранит стабильное отображение `Atom id → brane slot` и обновляет только
затронутые Atom rows, shared blocks, индексы и графы.

Canonical packed ranges переиспользуют capacity и растут геометрически. Если
несколько Atom делят дедуплицированный граф, изменение одного Atom сначала
создаёт ему собственный диапазон (copy-on-write), не переписывая граф соседа.
Значение enum хранит canonical Variant ID, поэтому rename/reorder Variant меняет
его отображение, но не теряет identity Atom, default или Condition.
Enum default не публикуется, пока его Variant не зафиксирован. Используемый
Variant нельзя удалить, а его identity нельзя перенести в другой Field: сначала
нужно перевести ссылки на другой Variant.

- CPU читает изменённый canonical Store напрямую.
- WebGPU сохраняет тот же runtime и compute pipeline, меняет только нужные
  blocks/pointers и увеличивает buffers геометрически.
- Неиспользуемые derived GPU allocations уплотняются редко, когда накопленный
  мусор становится существенным; это не меняет canonical Store.

CPU и WebGPU обязаны выдавать одинаковые State, lock и последовательность
Photon. Обычная стоимость structural update зависит от размера затронутого
фрагмента, а не от числа всех Atom. Исключения — редкое увеличение capacity и
уплотнение derived buffers.

## Где это реализовано

- `matrix/projection.ts` — локальная projection и индексы затронутых сущностей;
- `matrix/incremental.ts` — stable slots и изменение packed Store;
- `matrix/matrix.ts` — применение structural такта и Process lifecycle;
- `matrix/weak/cpu/index.ts` — CPU structural update;
- `matrix/weak/gpu/index.ts` — локальное обновление WebGPU buffers.

## Что обязаны доказывать тесты

- add/remove/move меняют только нужные rows и shared blocks;
- удаление не сдвигает незатронутый Atom, а добавление использует свободный
  slot;
- появление дочернего Atom во время активного Process не создаёт второй Photon,
  а первоначальный `processExecutionId` успешно завершает работу;
- перестановка State сохраняет то же execution по Meta State ID и только
  обновляет его внутренний индекс;
- split shared Field не переписывает дедуплицированный граф соседнего Atom;
- изменение Process declaration корректно инвалидирует старое execution;
- изменение одного Atom в большой projection остаётся локальным;
- повторные однотипные изменения не вызывают неограниченный рост Store;
- CPU и WebGPU дают одинаковую трассу без замены runtime.

Основное покрытие находится в `matrix/incremental.spec.ts`,
`matrix/projection.spec.ts` и `matrix/runtime.parity.spec.ts`.
