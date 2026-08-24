# Требования @nodes/editor

Этот документ владеет универсальными командами изменения живого
[`@nodes/core`](../core/REQUIREMENTS.md) NodeTree. UI-композиция и selection
принадлежат [`@nodes/ui`](../ui/REQUIREMENTS.md), а расчёт геометрии —
[`@nodes/layout`](../layout/README.md).

## Authoring transaction

1. `NodeTreeEditor` не хранит копию графа. Перед каждой командой он получает
   свежий ID-keyed document из NodeTree и фиксирует exact `expectedRevision`.
2. Команда создаёт serializable forward JSON Patch, применяет его к отдельной
   копии document, материализует конечную runtime-definition с повторным
   использованием существующих Parameter и вызывает один core reconcile.
3. Успешная команда возвращает forward и inverse operations. Inverse
   восстанавливает JSON document, но после удаления не воскрешает прежний
   runtime Store object; history, сохраняющая такую identity, должна отдельно
   удерживать удалённый ресурс. History не является скрытой частью editor.
4. Ошибка patch, конфликт revision или невалидная конечная topology не оставляет
   частичного изменения.
5. `addParameter`, `removeParameter`, `addNode`, `removeNode`, `connect`,
   `disconnect` и `setParameterValue` используют тот же transaction contract.
6. Удаление Parameter, на который ссылается Socket, по умолчанию отклоняется.
   Удаление Node с принадлежащими Link допускается только явной составной
   командой, где все disconnect operations видимы в одном patch.
7. Core проверяет direction endpoints: исходный Socket предоставляет
   `output | bidirectional`, целевой — `input | bidirectional`.

## Layout gate

1. Editor сравнивает последнюю принятую layout topologyRevision с текущей и
   сообщает `layoutDirty`, но не импортирует и не запускает solver.
2. Обычное value-only изменение Parameter не делает layout устаревшим.
   Подключённая consumer policy может пометить geometry-sensitive Parameter;
   его изменение и изменение состава Frame, Node, Parameter, Socket или Link
   делают layout устаревшим.
3. View явно запрашивает новую проекцию и подтверждает её точные `revision` и
   `topologyRevision`. Устаревшая проекция не очищает `layoutDirty`.

## Package boundary

1. Главный entrypoint `@nodes/editor` зависит только от exact public contracts
   `@nodes/core` и не импортирует `@nodes/layout`, `@nodes/ui`, `@ui/*`, Engine,
   DOM или product vocabulary.
2. Selection, hover, pan, zoom, открытые меню и выбранная строка Parameter
   принадлежат конкретному view, поэтому не записываются в NodeTreeEditor.
3. Parameter остаётся единственным Store значения. Editor не создаёт соседний
   value Record и не переносит callbacks в JSON presentation.

## Parent playground

1. Parent playground показывает production `NodeTreeEditor` через dev-only
   retained dock: Node, Parameter и Link можно добавить, выбрать и удалить, а
   числовое значение Parameter — изменить тем же Store.
2. После structural команды canvas сохраняет последнюю принятую проекцию и
   явно показывает устаревший layout. Кнопка «Перестроить layout» получает и
   применяет новую проекцию; автоматической перестановки Node нет.
