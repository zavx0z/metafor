# 🎯 Перетаскиваемые элементы

## Базовая разметка

```html

<quantum-viewport>
  <!-- Простое перетаскивание -->
  <div data-drag-selector>
    Draggable Node
  </div>

  <!-- Перетаскивание за определенную область -->
  <div class="node">
    <div data-drag-selector=".node">
      Drag Handle
    </div>
    Content
  </div>
</quantum-viewport>
```

## Программное создание

```javascript
const node = document.createElement('div');
node.setAttribute('data-drag-selector', '');
node.style.cssText = `
  position: absolute;
  left: 100px;
  top: 100px;
  width: 150px;
  height: 100px;
`;

viewport.appendChild(node);
``` 