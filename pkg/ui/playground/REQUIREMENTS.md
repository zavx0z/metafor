# Требования @ui/playground

`@ui/playground` владеет только переиспользуемой dev-инфраструктурой catalog
playground. Он не владеет production semantics UI Components либо consumer.

## Законы

1. Один route выбирает package-specific preview. Общая typed declaration
   содержит полные вложенные IDs и fallback, а библиотека жёстко материализует
   их как pathname `/route/id`. Consumer не выбирает hash/path mode или prefix.
2. Общий shell состоит из catalog, sections, preview, dock и info. Он является
   desktop-only рабочей средой, сохраняет historical five-panel geometry и
   занимает весь доступный canvas с небольшим внешним отступом; искусственный
   `maxWidth`/`maxHeight` не оставляет вокруг панелей пустую рамку.
3. Shell layout вычисляется FlexBox. CSS-style `%`/`fr`/`grow` является способом
   описания той же системы, а не отдельным layout.
4. Generic surfaces получают readonly descriptors и callbacks. Они не содержат
   Node/Field/Socket либо product switch.
5. Consumer preview является отдельной Surface; package не копирует и не
   адаптирует её renderer.
6. Server helper отключает HMR, собирает browser entry по запросу и не владеет
   persistent runtime process. HTML title равен exact package name; отдельного
   title override у consumer нет.
7. Playground package не входит production bundle consumer без его прямого
   import.
8. Navigation, dock и info владеют одним retained root и устойчивыми exact
   engine parents, keyed generic descriptor-ами. Изменение размера либо списка
   повторяет локальный FlexBox plan и reconciliate-ит parents; active, disabled,
   title, line и status state материализуют только изменённый owner. Transform
   выше чистого retained root сохраняет plan/materialization counters, child и
   geometry identity.
9. Retained materialization одного playground owner атомарна, а remove и
   dispose рекурсивно очищают его subtree. Диагностика dev-пакета хранит только
   текущие bounded owner keys и накопительные counters, не создаёт второй graph
   и не становится production dependency.
10. Статический backdrop остаётся осознанно flat: у него нет изменяемого
    descriptor state, независимого transform либо пользы от partial
    materialization. Consumer preview остаётся отдельной consumer-owned Surface
    и может иметь один retained parent без переноса consumer vocabulary в shell.
11. Navigation и dock хранят один детерминированный focus среди enabled item:
    pointer, Arrow Up/Down/Left/Right и Home/End меняют одно keyed состояние,
    Enter/Space вызывают текущий route callback. Видимое перемещение focus
    материализует только прежний и новый item owner; disabled item пропускается.
12. Масштабируемый catalog строится из package-owned typed story descriptors.
    Один descriptor связывает component identity, section, variant, args,
    production render, source generator, controls и optional interaction; route,
    поиск, preview, dock, копируемый код и render test не получают отдельных
    расходящихся описаний.
13. Catalog и sections поддерживают большой индекс через поиск, сворачиваемые
    группы и виртуализированное отображение. Initial bundle содержит metadata
    index; story implementation загружается lazy factory только после выбора.
    Точный production import contract принадлежит package owner, а не
    playground.
14. Preview всегда использует production UI на текущем Engine/UiRuntime. Dock
    показывает variants выбранной story. Правая панель постоянно показывает
    сгенерированный TypeScript и действие копирования; ниже неё располагаются
    controls и события, не скрывая код.
15. Все обращённые к человеку строки Workbench пишутся по-русски: навигация и
    поиск, описания preview, демонстрационные подписи, controls, events,
    состояния и статусы. Public API identifiers, import specifiers, route IDs и
    TypeScript-код сохраняют точное исходное написание; имена Blender и API
    остаются точными только там, где являются именем reference либо
    контракта, а не обычной подписью. Внешний Blender catalog используется
    только как reference при выборе собственных Elements, Components и Node UI;
    его ноды, assets и примеры не импортируются в playground.
