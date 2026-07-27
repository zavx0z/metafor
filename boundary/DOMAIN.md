# Доменный контракт Boundary

Boundary хранит канонический текущий мир. Он различает изменение существующего
Matter и его явное удаление.

## Идентичность Matter

Закон:

> `replace` изменяет тот же Matter. Только `remove` удаляет Matter.

Простой пример:

```text
Browser #10
├── Screenshot #11
└── Control #12
```

## Идентичность Mass file

Mass declaration WIMP-local: factory property key определяет declaration, а
global key ID и codec определяют ровно один файл
`mass/<key-id>.<extension>`. Codec однозначно задаёт расширение
`json → .json`, `binary → .bin`; MIME в Mass не существует. Boundary хранит
Atom/declaration → key membership и child declaration → parent declaration
source; aggregate Mass ID, Atom-to-Mass relation и bytes в SQLite запрещены.
Direct whole/partial Matter binding переиспользует только существующие key IDs.
Binding требует одинаковый codec. Detach публикует новый key ID после атомарной
file copy с тем же расширением и удаляет source.

Если меняется только `Browser.energyBinding`, после commit остаются те же
`#10`, `#11`, `#12`. Дети по-прежнему ссылаются на `#10`.

Boundary поэтому не удаляет базовую строку `matter_particle` при `replace`:

1. проверяет нового родителя и запрещает цикл;
2. сохраняет `matter_particle.id`;
3. обновляет базовую строку на месте;
4. заменяет только subtype и bindings;
5. делает всё в одной SQLite transaction.

Удаление базовой строки и её каскад разрешены только для явного `remove`.

## Канонический commit Process

Закон:

> Результат Energy является предложением. Мир меняет только Boundary commit.

Matrix создаёт `processExecutionId` и публикует `photon/test`. Boundary
регистрирует его вместе с текущими Atom, State и Process, а после `z/copy`
фиксирует выбранную Energy. Proposal `w+`/`w-` принимается только если все эти
identity по-прежнему совпадают и write-set ограничен объявленными Fields.

Boundary атомарно записывает Fields, затем выпускает отдельные canonical
`gluon`/`higgs` consequences и `w+/w- copy`. Matrix снимает lock только по этому
подтверждению. Запоздалый proposal старого execution не меняет текущий мир.

## Два масштаба изменения

Оба варианта ниже являются целевым доменным контрактом. Совместимое изменение
текущего WIMP, включая live-reparent, уже распространяется на все его Atom.
Приватный клон одного Atom пока отложен.

### 1. Изменение текущего WIMP

Меняется декларация существующего WIMP с тем же `src`. Изменение действует на
все Atom, созданные из этого WIMP.

```text
Browser WIMP
├── Atom #101
├── Atom #202
└── Atom #303
```

После изменения Matter, Fields, States или Processes перестраиваются все три
Atom. Перестройка означает локальный structural diff, а не удаление и повторное
создание:

- ID существующих Atom сохраняются;
- совместимые Field values и State сохраняются;
- совпадающие дочерние Atom/Topology сохраняют identity;
- создаются только действительно новые части;
- выполняющиеся Process старой версии немедленно отсоединяются от Atom, после
  чего Atom может запустить Process новой версии;
- один WIMP update не требует сканирования всего мира: используются индексы
  `WIMP src → Atom IDs` и `Matter declaration → runtime origins`.

Пример: добавление Screenshot в Browser WIMP должно добавить Screenshot каждому
существующему Browser Atom.

### 2. Изменение одного Atom

Структура одного Atom напрямую не редактируется. Для выбранного Atom создаётся
приватный клон его WIMP, принадлежащий только этому Atom.

```text
Atom #101 → private Browser WIMP clone
Atom #202 → исходный Browser WIMP
```

Приватный клон получает новый уникальный `src`; связь с исходным WIMP хранится
отдельно как `baseSrc`. Точный формат clone `src` ещё не определён. Выбранный
Atom сохраняет свой ID и переключает ссылку на новый WIMP, остальные Atom
остаются на исходном `src`.

Неизменённые декларации клона должны переиспользоваться по copy-on-write, а не
копироваться без необходимости. Клон не становится общей декларацией для
других Atom и следует lifecycle своего владельца.

## Process при перестроении

Закон зависит от границы изменения:

- посторонний Graviton другого Atom/WIMP не трогает выполняющийся Process;
- изменение декларации его WIMP инвалидирует старый `processExecutionId` для
  всех Atom этого WIMP;
- Energy сразу отсоединяет старое execution, освобождает его runtime slot и
  перестраивает catalog/bindings;
- остановка старого action запускается после перестройки через `AbortSignal` и
  не блокирует новое execution;
- старые success/error handlers и `w+`/`w-` после отсоединения запрещены;
- поздний `.finally()` старого action не может удалить новое execution.

Простой пример: Browser Process `A` работает, затем меняется Browser Matter.
Browser Atom сохраняет ID, но Matrix создаёт Process `B` с новым
`processExecutionId`. Energy отсоединяет `A`, перестраивает локальное состояние
и только затем вызывает abort. Когда приходит Photon `B`, он запускается сразу,
не ожидая завершения `A`. Результат `A` больше не является результатом мира.

В той же SQLite-транзакции, где Boundary сохраняет изменение WIMP, все старые
pending execution его Atom становятся `superseded`. Поэтому уже отправленный,
но пришедший позже `w+`/`w-` не успеет записать Fields между перестройкой и новым
Photon. Идентичный `replace` ничего не инвалидирует и не выпускает Graviton.

`AbortSignal` физически останавливает только action, который соблюдает этот
контракт. Произвольный JavaScript в том же isolate нельзя принудительно убить:
такой action может ещё жить в фоне, но он отсоединён от протокола. Гарантированное
hard-kill потребует отдельной изоляции выполнения.

## Destroy при удалении Atom

Boundary не создаёт отдельный служебный сигнал. В той же транзакции, где Atom
исчезает из текущего мира, он retire-ит executions и после commit публикует
канонический `graviton remove atom/:id`. Ветка публикуется снизу вверх: сначала
дети, затем родитель.

Energy читает этот remove до удаления Atom из локального catalog и сохраняет
закрытый снимок старых Mass/Energy и всех `destroy(...)` данного WIMP, доступных
в текущем runtime. Затем она сразу освобождает активный slot и Energy store,
отсоединяет execution, вызывает ему abort и асинхронно выполняет destroy hooks
в порядке декларации. Эти hooks не являются новым Matrix execution и не
публикуют `w+`/`w-`.

Поздний destroy работает только со старыми ссылками. Если Atom с тем же ID уже
создан снова, его новая Energy generation не может быть освобождена старым
cleanup. Mass автоматически не удаляется. Не проявленный в Energy Atom не
создаёт пустые stores только ради destroy. Несколько destroy hooks должны быть
идемпотентны; hook дочернего Atom не должен закрывать заимствованный через
binding ресурс родителя, если он им не владеет.

## Identity при structural reconcile

Runtime placement определяется ключом `scope Atom + Matter localId + путь
повторений`. Путь повторений содержит ordinals всех внешних Macho, поэтому два
одинаковых ребёнка в разных повторениях не смешиваются. Текущий родитель не
входит в identity: live-reparent перемещает ту же сущность и сохраняет её ID.
`scope Atom` — экземпляр WIMP, декларация которого создаёт placement; он
хранится отдельно от `owner_atom`, используемого для runtime bindings.

- смена `src` у WIMP Matter сохраняет Atom ID, переносит совместимые Field
  values по одинаковым key/type и сохраняет State по имени, если он объявлен в
  новом WIMP;
- смена контроллера между Axion, Fuzzy и Macho сохраняет Topology ID;
- переход WIMP Matter ↔ topology-controller меняет доменный вид
  `Atom ↔ Topology`, поэтому старый runtime placement удаляется и создаётся
  новый;
- Macho без отдельного item identity сохраняет существующий prefix по ordinal:
  рост добавляет хвост, сокращение удаляет хвост. Reorder элементов сам по себе
  не переименовывает placements; стабильная identity элементов потребует
  отдельного ключа коллекции.

Reconciler строит desired children только внутри затронутых `scope Atom`,
перемещает совпавшие placements, создаёт отсутствующие и удаляет лишние. Один
Matter update не сканирует Atom посторонних WIMP. Если Topology переносится к
другому owner Atom, неизменившиеся дочерние Atom сохраняют ID, но заново
привязывают зависимые Field к новому владельцу; execution перезапускается только
у действительно перепривязанного Atom.

При удалении runtime Atom его pending и superseded executions переносятся в
retired fence до SQL cascade. Поэтому поздние grant/result уже удалённого Atom
распознаются как stale и игнорируются, а не становятся неизвестными execution.
Уже летевшие State/Process Photon для отсутствующего Atom также считаются stale;
неизвестный State или Process у существующего Atom остаётся ошибкой контракта.
Удаление корневого WIMP обходит фактическое runtime-дерево: внешние WIMP
declarations сохраняются, но их Atom внутри удаляемой ветки получают обычные
remove-события, cleanup values и тот же retired fence.
Energy освобождает активный runtime сразу, а destroy выполняет отдельной
очередью в порядке этих remove-событий: cleanup ребёнка должен завершиться до
начала cleanup родителя. Ошибка destroy не откатывает удаление; она логируется,
остальные hooks продолжаются, поэтому физическое закрытие внешнего ресурса
остаётся cooperative best-effort до отдельного lifecycle health.

## Recursive remove и dissolve — разные операции

Действующий `inflaton remove wimp` является рекурсивным удалением repository
contour: корневой Atom и все его runtime-потомки удаляются снизу вверх.
Внешние WIMP declarations потомков и посторонний Boundary state сохраняются,
но identity удалённых Atom не переносится.

`dissolve` не является alias или режимом `remove`. Его первый разрешённый срез
существует только как offline proof над изолированной SQLite:

1. план называет один удаляемый root Atom и один его сохраняемый дочерний Atom;
2. дочерний Atom становится root, сохраняет ID, порядок и потомков, а их
   `scope Atom` переносится на него;
3. ровно пять явно сопоставленных Mass declarations сначала получают fence;
4. target memberships принимают те же global key IDs при одинаковом codec;
   Mass bytes не копируются и не удаляются;
5. source relations этих keys переводятся на target declarations, а target
   становится владельцем вместо alias на удаляемый parent;
   прежние independent target key IDs остаются unreferenced metadata и не
   удаляются этим proof, потому что byte GC требует отдельного решения;
6. aggregate pre-state и каждая membership меняются только по CAS;
7. любой mismatch, включая поздний mismatch после частичных SQL updates,
   откатывает всю transaction;
8. полный `readMetaJSON` валиден до изменения и для planned результата до
   commit; private manifest подтверждает равенство mapped source/target
   `authored key + codec + global key ID + digest`.

Этот proof не является live capability: он не exposed через Monad/Force,
не разрешает удаление Inference и не определяет activation lifecycle.
Рекурсивное удаление и dissolve доказываются соседними, но раздельными тестами.

Следующий non-live prerequisite — приватный staging adapter. Он принимает
закрытый proposal только с operation `dissolve`; recursive `remove` через него
выразить нельзя. Adapter работает с отдельной in-memory SQLite, строит
проверенный dissolve plan, валидирует текущий полный MetaJSON и повторно
сверяет весь plan до атомарной записи immutable receipt. Receipt фиксирует
proposal, plan и MetaJSON digests, source/target Atom identities и требование
ровно пяти fence, но не является разрешением на execution.

Staging не вызывает `materialize`, dissolve execution, fence/release, Force или
runtime lifecycle и не меняет Boundary/Mass. Повтор того же `proposalId`
идемпотентен только при canonical-equivalent proposal; конфликт полностью
откатывает staging transaction. Этот adapter не экспортируется из Boundary
package и не снимает отдельный live preflight/owner gate.

## Проверка

Регрессии доказывают in-place identity Matter, live-reparent и rebind, смену
WIMP `src`, Atom↔Topology, Axion↔Macho, вложенные Macho repetitions, cold-start
миграцию scopes, fan-out одного Matter на несколько Atom и Energy
`detach → rebuild → abort` без результата от старого execution. Удаление ветки
дополнительно доказывает `release → abort → destroy`, child-before-parent,
изоляцию новой generation и подавление поздних Process/Reaction результатов.
Отдельная пара offline-регрессий доказывает, что recursive `remove` удаляет
parent вместе с descendants, а `dissolve` удаляет только parent, сохраняет и
reparent/reorder-ит descendants, явно переносит пять Mass identities и
полностью откатывается при CAS mismatch.
Staging-регрессии отдельно доказывают immutable/idempotent receipt, отклонение
recursive-remove shape и отсутствие Boundary/Mass/deletion effects.
