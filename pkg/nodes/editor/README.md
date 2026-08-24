# @nodes/editor

`@nodes/editor` — headless authoring-слой универсального нодового графа. Он
превращает команды добавления и удаления сущностей, изменения Parameter и
connect/disconnect в JSON Patch, применяет полученный конечный документ через
один атомарный commit `@nodes/core` и сообщает прямые и обратные операции.

Editor не содержит Blender, WebGPU, canvas или layout solver. Конкретный view
сам выбирает Node, Parameter и Socket, а layout запускает через подключённый
projector только по явной команде.

Действующие законы находятся в [требованиях editor](REQUIREMENTS.md).
