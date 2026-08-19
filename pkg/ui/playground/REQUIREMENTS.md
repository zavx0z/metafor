# Требования @ui/playground

`@ui/playground` владеет только переиспользуемой dev-инфраструктурой catalog
playground. Он не владеет production semantics UI Components либо consumer.

## Законы

1. Один route выбирает package-specific preview; router поддерживает полные
   вложенные path/hash IDs и deterministic fallback.
2. Общий shell состоит из catalog, sections, preview, dock и info. Desktop
   сохраняет historical five-panel geometry; mobile показывает preview consumer.
3. Shell layout вычисляется FlexBox. CSS-style `%`/`fr`/`grow` является способом
   описания той же системы, а не отдельным layout.
4. Generic surfaces получают readonly descriptors и callbacks. Они не содержат
   Node/Field/Socket либо product switch.
5. Consumer preview является отдельной Surface; package не копирует и не
   адаптирует её renderer.
6. Server helper отключает HMR, собирает browser entry по запросу и не владеет
   persistent runtime process.
7. Playground package не входит production bundle consumer без его прямого
   import.
