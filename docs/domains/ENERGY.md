# Energy

Energy исполняет Process и Reaction и владеет живыми runtime-сущностями Process.
Matrix решает, когда выполнение должно начаться; Energy не хранит State, не
вычисляет переходы и не разрешает связи Reaction.

## Закон декларации Energy

Meta объявляет только постоянный TypeScript-тип Energy:

```typescript
.energy<{
  socket: WebSocket
  stream: MediaStream
}>()
```

Вызов не принимает объект, не создаёт значения и не попадает в MetaDSL/WIMP.
Поэтому в декларации нет фиктивных `null`, конструкторов и side effects. Если
живые сущности не нужны, используется `.energy()` с пустым типом `{}`.

Реальный объект Energy существует только в Energy runtime. Action создаёт или
заменяет его сущности, а destroy освобождает. Функция или фабрика не может быть
значением верхнего уровня Energy; такое объявление обязано отклоняться
TypeScript:

```typescript
// ошибка типа
.energy<{connect: () => WebSocket}>()
```

## Закон хранения Mass

Mass — persisted filesystem data, а не отдельный Artifact domain/entity. Фабрика
`.mass((mass) => ({profile: mass.json()}))` объявляет только ключ, codec и
описательную metadata. Process, destroy и Matter получают разрешённые
`MassHandle` с `readBytes`, `readText`, `readJson` и `write`. Reaction получает
только явно объявленные собственные ключи и только объявленные для каждого ключа
операции чтения или записи. Содержимое не становится свойством runtime-объекта
Mass.
Boundary выдаёт независимый ID декларации и глобальный ID key-file; Atom хранит
membership прямо в key ID, без aggregate Mass ID. Energy открывает только key,
разрешённые в canonical Atom projection, по плоскому пути
`<worktree>/mass/<key-id>.<extension>`.

Codec однозначно владеет расширением: `json → .json`, `binary → .bin`. MIME не
является частью Mass declaration, projection или handle. Один key ID владеет
одним файлом. Whole и partial Matter binding переиспользуют эти ID только между
совпадающими codec; совпадающие bytes никогда не создают sharing. Detach создаёт
новый key ID, файловый контур атомарно копирует файл с тем же расширением, а
Boundary меняет membership и удаляет source.
Обычная запись также атомарно заменяет key-file через temporary в том же
каталоге. JSON codec сериализует значение, binary принимает только `Uint8Array`.
Mass bytes, manifests и binding registries не проходят через Boundary, Force или
Matrix. Runtime не создаёт и не удаляет key IDs.

## Закон результата Process

Energy исполняет descriptor и отправляет `w+`/`w-` как proposal с
`processExecutionId`, `processId` и разрешённым write-set. Она не записывает
канонический мир и не снимает Matrix lock. Boundary проверяет и commit-ит
proposal; Matrix завершает проход только по `w+/w- copy` от Boundary с той же
execution identity.

## Закон результата Reaction

Energy принимает Reaction только после того, как Boundary зарегистрировал
конкретное подтверждённое изменение State источника, а Matrix выбрала точную
связь и очередь целевого Atom. Фильтр в Energy не исполняется: выбор источника и
State уже завершён раньше.

Reaction получает новое State источника без предыдущего State, снимок только
объявленных собственных Fields, ограниченную проекцию только объявленных
собственных Mass keys, собственное State и `self`. Живые объекты Energy и
произвольный Force Particle ей не передаются.

Обращение `value.a` и destructuring `const {a, b} = value` объявляют читаемые
Fields, а `update({a, b})` объявляет Fields записи. `update` может предлагать
только собственные ordinary Fields: `string`, `number` и `boolean`. `enum` и
`array` являются topology Fields и меняются только Process.

Mass записывается самим action сразу. Эти записи остаются, даже если к моменту
завершения Boundary уже не принимает Field proposal. Boundary повторно
проверяет точную связь, допустимое текущее State и полный Field write-set, затем
commit-ит ordinary Fields одной транзакцией.

После полного холодного рождения execution, которому прежняя Energy ещё не была
выбрана, может получить тот же сохранённый signal и начать action. Если Energy
уже была выбрана, action мог завершить одну или несколько атомарных записей Mass
до остановки. Такое execution не запускается повторно: Boundary завершает его
как `superseded`, уже записанные Mass остаются, а отсутствующий Field proposal не
восстанавливается. Несколько Mass writes одного action не образуют общую
транзакцию и после аварии могут остаться частично выполненными.

Необъявленный ключ завершает обычное выполнение ошибкой. Отсутствующий
объявленный Field, Mass key или обязательная операция handle является нарушением
системного инварианта: Energy переводит свой contour в fail-stop и не выпускает
обычный `w-`. Отдельного пользовательского error-обработчика Reaction нет.

## Закон runtime-перестройки

После полного холодного рождения Energy всегда начинает с пустых живых stores.
Она не восстанавливает WebSocket, controller или action прежнего процесса.
Для незавершённого Process прежнего contour Matrix выпускает новый
`photon/test`; Energy принимает только эту новую identity обычным claim и
создаёт ресурсы заново. Reaction сохраняет прежнюю identity только пока Energy
ещё не была выбрана; выбранное прежде execution повторно Energy не получает.

Canonical `atom/:id replace` полностью заменяет локальную runtime projection
этого Atom. Отсутствующий `continuation` очищает прежние Mass/Energy bindings,
а не оставляет их в catalog. Перед применением такого replace Energy мгновенно
отсоединяет execution только этого Atom; перестраивает binding и лишь затем
посылает старому action `AbortSignal`.

Частичный Graviton другого Atom и добавление дочернего Atom не являются replace
родителя и не перезапускают его Process. Сам `topology/:id replace` только
обновляет структуру catalog и не перепривязывает дочерние runtime stores. Когда
смена owner Topology действительно меняет Field/Mass/Energy binding ребёнка,
Boundary следом публикует canonical replace именно этого дочернего Atom.

## Закон удаления

`graviton remove atom/:id` является единственным сигналом физического удаления.
Energy сначала сохраняет ссылки старой Mass/Energy generation и подходящие
`destroy(...)`, затем удаляет Atom из активного catalog, освобождает runtime
slot и Energy store, abort-ит старый action и запускает destroy асинхронно.

Все destroy hooks WIMP, совместимые с текущим `env`, выполняются в порядке
декларации на закрытом retired context. Cleanup удаляемой ветки завершает
ребёнка до начала cleanup родителя, не блокируя освобождение и перестройку
активного runtime. Они не требуют Photon/Z, не отправляют
`w+`/`w-` и не могут освободить новую generation повторно созданного Atom с тем
же ID. Ошибка destroy логируется, остальные hooks продолжаются: физическое
закрытие внешнего ресурса cooperative и потому best-effort. Поздние Process и
Reaction результаты удалённого Atom подавляются.
Не гидратированный Atom не создаёт пустые Mass/Energy ради cleanup; Mass имеет
отдельный lifetime и автоматически не удаляется.

## Causal retarget для dissolve

Owner-approved non-live prerequisite не подключён к Energy RPC/runtime. Energy
владеет отдельным durable receipt ровно пяти Mass handles, связанным с exact
Boundary admission, stage receipt, checkpoint, plan digest и текущими source
generations. Fence выполняется в deterministic mapping order; результат
каждого handle fsync-ится до следующего, поэтому failure на пятом сохраняет
первые четыре как fenced, а retry/reopen идемпотентно переутверждает их и
продолжает тот же receipt.

Retarget запрещён до exact Boundary commit receipt. После commit каждый
source→target handle retarget идемпотентен по стабильному entry ID, а полученная
target generation сохраняется до следующего entry. Source fence не снимается
этой операцией: superseded source/target binding metadata, прежние target key
IDs и generations сохраняются в receipt с
`retain-until-explicit-gc`. Mass bytes, key rows, history и rollback artifacts
не копируются и не удаляются; отдельного delete/release шага в protocol нет.
Crash/retry не может превратить absent Mass evidence в payload.

Одноразовый live adapter для перехода Inference→Lada удалён. Общие
fence/retarget primitives и их самодостаточные тесты сохранены; публичного или
специального write RPC для повторения старого перехода нет. Retained evidence
прошлой операции остаётся данными восстановления и не считается активной
командой.

## Что обязаны доказывать тесты

- generic сохраняет точные типы сущностей в action, destroy и Matter;
- Mass и Energy не смешиваются;
- Mass filesystem-backed и сохраняет declared key identity without versioning;
- runtime-объект нельзя передать аргументом `.energy(...)`;
- функция верхнего уровня отклоняется;
- вызов не добавляет Energy value в MetaDSL;
- пустая `.energy()` оставляет Energy типом `{}`.
- W proposal не обходит Boundary и не снимает Matrix lock до commit.
- удаление continuation очищает catalog, а canonical Atom replace инвалидирует
  только execution этого Atom.
- Atom remove освобождает активный slot до abort, выполняет destroy на старых
  ссылках ровно один раз и не затрагивает новую generation того же ID.
- dissolve fence/retarget receipt переживает reopen, продолжает late
  five-handle failure без duplicate retarget и не выполняет retarget до
  Boundary commit;
- superseded binding/key metadata сохраняется до отдельного owner GC decision.

Публичный контракт находится в `types/metafor/schema.ts`, runtime-цепочка — в
`metafor.ts`, проверки — в `metafor.spec.ts` и
`tests/types/processes.typing.spec.ts`.
