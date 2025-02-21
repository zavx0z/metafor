# 🎨 Система рёбер

## Режим отладки
![Режим отладки](./img/edges-debug.png?width=500)

## Создание и управление рёбрами

```javascript
const viewport = document.querySelector('quantum-viewport')

// Добавление ребра
viewport.canvas.applyPatch({
  op: "add",
  path: "node1 > node2",
  value: {
    source: { x: 100, y: 100 },
    target: { x: 300, y: 200 },
    color: "#FF5733",
    width: 2,
    type: "curved" // "curved" | "straight"
  }
})

// Удаление ребра
viewport.canvas.applyPatch({
  op: "remove",
  path: "node1 > node2"
})

// Обновление стиля
viewport.canvas.applyPatch({
  op: "update",
  path: "node1 > node2",
  value: {
    color: "#28A745",
    width: 3
  }
})
``` 