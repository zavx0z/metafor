# Matrix

Matrix детерминированно вычисляет State, Transition и момент запуска Process.
Energy исполняет Process; Matrix не выполняет его side effects.

## Закон перехода

Переходы одного State проверяются в объявленном порядке. `null` означает
отсутствие исполняемого перехода, а не переход в State 0. Перед вычислением
числа переходов, адресов и блоков условий такие записи полностью исключаются из
исполняемой программы. Поэтому `null`, стоящий перед настоящим Transition, не
может скрыть или сдвинуть его.

## Единый порядок изменений

Полная запись Matrix, изменение Field или lock, `unlock` и структурный Graviton
выполняются через одну последовательную очередь в порядке поступления. Очистка
старого Store и Weak входит в тот же такт полной записи. Ни одна операция не
начинается, пока предыдущая не завершилась или не вернула ошибку, и потому не
работает одновременно с частично применяемым изменением.

Параллельно вызванные операции не объединяются и не переупорядочиваются:
следующая начинается только после полного завершения предыдущей, включая
чтение результата Weak и публикацию вызванных ею Photon.

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

Изменение декларации WIMP инвалидирует executions всех Atom только этого WIMP и
создаёт им новые `processExecutionId`, если после перестройки они остаются в
Process State. Canonical `atom/:id replace` означает изменение runtime binding
этого Atom и делает non-current только его execution, даже если `atom.wimp` и
State сохранились. Удаление Atom или смена его State также делает non-current
только его pending identity. Matrix не останавливает action: Energy отдельно
отсоединяет старое execution и посылает ему cooperative abort после собственной
перестройки. Graviton другого Atom/WIMP старую identity не трогает.

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

## Сбой WebGPU

Ошибка принадлежащей Matrix операции WebGPU и потеря GPU-устройства являются
отказом текущего Weak, а не пустым результатом такта. Первая ошибка сохраняется,
текущая или следующая ожидаемая граница Weak завершается этой ошибкой, а
проверка состояния Matrix возвращает `ok: false`, `initialized: false` и её
причину.

Matrix не переключается с WebGPU на CPU посреди причинной трассы: такое
переключение могло бы скрыть частично выполненный такт. Для продолжения нужен
новый полный запуск Matrix; потерянное устройство не переиспользуется.

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
- Matter/declaration WIMP rebuild сохраняет Atom IDs, но создаёт новую Process
  identity только затронутым Atom;
- live-reparent или смена continuation сохраняет Atom ID, но снимает его старый
  lock и создаёт новую Process identity;
- split shared Field не переписывает дедуплицированный граф соседнего Atom;
- изменение любой декларации WIMP корректно инвалидирует старое execution;
- изменение одного Atom в большой projection остаётся локальным;
- повторные однотипные изменения не вызывают неограниченный рост Store;
- CPU и WebGPU дают одинаковую трассу без замены runtime;
- `null` перед настоящим Transition не меняет его адрес и не скрывает его;
- параллельные `write`, `update`, `unlock` и structural update сохраняют порядок
  поступления и не выполняются одновременно;
- ошибка операции WebGPU и потеря устройства переводят Matrix в нездоровое
  состояние и не превращаются в пустой результат.

Основное покрытие находится в `matrix/incremental.spec.ts`,
`matrix/projection.spec.ts` и `matrix/runtime.parity.spec.ts`. Порядок изменений
проверяется в `matrix/tests/index.spec.ts`, формат переходов — в
`matrix/tests/superposition.spec.ts`, а отказы WebGPU — в
`matrix/weak/tests/weak.gpu.test.ts`, `matrix/weak/device.spec.ts` и
`matrix/monad.spec.ts`.
