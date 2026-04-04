import { describe, it, expect } from "bun:test"
import { parseAttributes } from "../index.ts"

describe("события (events) с атрибутами on...", () => {
  describe("простые события", () => {
    it("onclick с простой стрелочной функцией", () => {
      const attrs = parseAttributes('onclick="${() => console.log("clicked")}"')
      expect(attrs).toEqual({
        event: {
          onclick: '() => console.log("clicked")',
        },
      })
    })

    it("onclick с параметрами", () => {
      const attrs = parseAttributes('onclick="${(e) => handleClick(e)}"')
      expect(attrs).toEqual({
        event: {
          onclick: "(e) => handleClick(e)",
        },
      })
    })

    it("onclick с множественными параметрами", () => {
      const attrs = parseAttributes('onclick="${(event, data) => handleClick(event, data)}"')
      expect(attrs).toEqual({
        event: {
          onclick: "(event, data) => handleClick(event, data)",
        },
      })
    })

    it("onclick с деструктуризацией", () => {
      const attrs = parseAttributes('onclick="${({ target, type }) => handleClick(target, type)}"')
      expect(attrs).toEqual({
        event: {
          onclick: "({ target, type }) => handleClick(target, type)",
        },
      })
    })

    it("onclick без кавычек", () => {
      const attrs = parseAttributes('onclick=${() => console.log("clicked")}')
      expect(attrs).toEqual({
        event: {
          onclick: '() => console.log("clicked")',
        },
      })
    })

    it("onchange без кавычек", () => {
      const attrs = parseAttributes("onchange=${(e) => setValue(e.target.value)}")
      expect(attrs).toEqual({
        event: {
          onchange: "(e) => setValue(e.target.value)",
        },
      })
    })

    it("onsubmit без кавычек", () => {
      const attrs = parseAttributes("onsubmit=${(e) => { e.preventDefault(); submitForm(); }}")
      expect(attrs).toEqual({
        event: {
          onsubmit: "(e) => { e.preventDefault(); submitForm(); }",
        },
      })
    })

    it("onkeydown без кавычек", () => {
      const attrs = parseAttributes('onkeydown=${(e) => e.key === "Enter" && handleEnter()}')
      expect(attrs).toEqual({
        event: {
          onkeydown: '(e) => e.key === "Enter" && handleEnter()',
        },
      })
    })
  })

  describe("различные типы событий", () => {
    it("onchange с простой функцией", () => {
      const attrs = parseAttributes('onchange="${(e) => setValue(e.target.value)}"')
      expect(attrs).toEqual({
        event: {
          onchange: "(e) => setValue(e.target.value)",
        },
      })
    })

    it("onsubmit с preventDefault", () => {
      const attrs = parseAttributes('onsubmit="${(e) => { e.preventDefault(); submitForm(); }}"')
      expect(attrs).toEqual({
        event: {
          onsubmit: "(e) => { e.preventDefault(); submitForm(); }",
        },
      })
    })

    it("onkeydown с проверкой клавиши", () => {
      const attrs = parseAttributes('onkeydown="${(e) => e.key === "Enter" && handleEnter()}"')
      expect(attrs).toEqual({
        event: {
          onkeydown: '(e) => e.key === "Enter" && handleEnter()',
        },
      })
    })

    it("onmouseover с условной логикой", () => {
      const attrs = parseAttributes('onmouseover="${(e) => isHoverable && showTooltip(e)}"')
      expect(attrs).toEqual({
        event: {
          onmouseover: "(e) => isHoverable && showTooltip(e)",
        },
      })
    })

    it("onfocus с асинхронной функцией", () => {
      const attrs = parseAttributes('onfocus="${async (e) => await validateField(e.target)}"')
      expect(attrs).toEqual({
        event: {
          onfocus: "async (e) => await validateField(e.target)",
        },
      })
    })

    it("onfocus без кавычек", () => {
      const attrs = parseAttributes("onfocus=${async (e) => await validateField(e.target)}")
      expect(attrs).toEqual({
        event: {
          onfocus: "async (e) => await validateField(e.target)",
        },
      })
    })

    it("onblur с возвратом значения", () => {
      const attrs = parseAttributes('onblur="${(e) => { const value = e.target.value; return validate(value); }}"')
      expect(attrs).toEqual({
        event: {
          onblur: "(e) => { const value = e.target.value; return validate(value); }",
        },
      })
    })

    it("onblur без кавычек", () => {
      const attrs = parseAttributes("onblur=${(e) => { const value = e.target.value; return validate(value); }}")
      expect(attrs).toEqual({
        event: {
          onblur: "(e) => { const value = e.target.value; return validate(value); }",
        },
      })
    })
  })

  describe("сложные события", () => {
    it("onclick с тернарным оператором", () => {
      const attrs = parseAttributes('onclick="${(e) => isEnabled ? handleClick(e) : showError()}"')
      expect(attrs).toEqual({
        event: {
          onclick: "(e) => isEnabled ? handleClick(e) : showError()",
        },
      })
    })

    it("onclick с тернарным оператором без кавычек", () => {
      const attrs = parseAttributes("onclick=${(e) => isEnabled ? handleClick(e) : showError()}")
      expect(attrs).toEqual({
        event: {
          onclick: "(e) => isEnabled ? handleClick(e) : showError()",
        },
      })
    })

    it("onchange с множественными условиями", () => {
      const attrs = parseAttributes(
        'onchange="${(e) => { const value = e.target.value; if (value.length > 0) validate(value); else clearError(); }}"'
      )
      expect(attrs).toEqual({
        event: {
          onchange:
            "(e) => { const value = e.target.value; if (value.length > 0) validate(value); else clearError(); }",
        },
      })
    })

    it("onchange с множественными условиями без кавычек", () => {
      const attrs = parseAttributes(
        "onchange=${(e) => { const value = e.target.value; if (value.length > 0) validate(value); else clearError(); }}"
      )
      expect(attrs).toEqual({
        event: {
          onchange:
            "(e) => { const value = e.target.value; if (value.length > 0) validate(value); else clearError(); }",
        },
      })
    })

    it("onsubmit с try-catch", () => {
      const attrs = parseAttributes(
        'onsubmit="${async (e) => { e.preventDefault(); try { await submitData(); } catch (error) { showError(error); } }}"'
      )
      expect(attrs).toEqual({
        event: {
          onsubmit:
            "async (e) => { e.preventDefault(); try { await submitData(); } catch (error) { showError(error); } }",
        },
      })
    })

    it("onsubmit с try-catch без кавычек", () => {
      const attrs = parseAttributes(
        "onsubmit=${async (e) => { e.preventDefault(); try { await submitData(); } catch (error) { showError(error); } }}"
      )
      expect(attrs).toEqual({
        event: {
          onsubmit:
            "async (e) => { e.preventDefault(); try { await submitData(); } catch (error) { showError(error); } }",
        },
      })
    })

    it("onkeyup с debounce", () => {
      const attrs = parseAttributes(
        'onkeyup="${(e) => { clearTimeout(debounceTimer); debounceTimer = setTimeout(() => search(e.target.value), 300); }}"'
      )
      expect(attrs).toEqual({
        event: {
          onkeyup:
            "(e) => { clearTimeout(debounceTimer); debounceTimer = setTimeout(() => search(e.target.value), 300); }",
        },
      })
    })
  })

  describe("события с контекстом", () => {
    it("onclick с доступом к контексту", () => {
      const attrs = parseAttributes('onclick="${(e) => handleClick(e, context.userId)}"')
      expect(attrs).toEqual({
        event: {
          onclick: "(e) => handleClick(e, context.userId)",
        },
      })
    })

    it("onchange с состоянием", () => {
      const attrs = parseAttributes('onchange="${(e) => setState(prev => ({ ...prev, value: e.target.value }))}"')
      expect(attrs).toEqual({
        event: {
          onchange: "(e) => setState(prev => ({ ...prev, value: e.target.value }))",
        },
      })
    })

    it("onsubmit с API вызовом", () => {
      const attrs = parseAttributes(
        'onsubmit="${async (e) => { e.preventDefault(); const result = await api.submit(formData); if (result.success) redirect("/success"); }}"'
      )
      expect(attrs).toEqual({
        event: {
          onsubmit:
            'async (e) => { e.preventDefault(); const result = await api.submit(formData); if (result.success) redirect("/success"); }',
        },
      })
    })
  })

  describe("множественные события", () => {
    it("несколько событий на одном элементе", () => {
      const attrs = parseAttributes(
        'onchange="${(e) => setValue(e.target.value)}" onfocus="${() => showHelp()}" onblur="${() => hideHelp()}"'
      )
      expect(attrs).toEqual({
        event: {
          onchange: "(e) => setValue(e.target.value)",
          onfocus: "() => showHelp()",
          onblur: "() => hideHelp()",
        },
      })
    })

    it("события с другими атрибутами", () => {
      const attrs = parseAttributes(
        'class="btn" disabled=${isLoading} onclick="${(e) => handleClick(e)}" onmouseover="${() => showTooltip()}"'
      )
      expect(attrs).toEqual({
        event: {
          onclick: "(e) => handleClick(e)",
          onmouseover: "() => showTooltip()",
        },
        string: {
          class: { type: "static", value: "btn" },
        },
        boolean: {
          disabled: { type: "dynamic", value: "isLoading" },
        },
      })
    })
  })

  describe("события с булевыми атрибутами в фигурных скобках", () => {
    it("события с условными булевыми атрибутами", () => {
      const attrs = parseAttributes(
        'onclick="${(e) => handleClick(e)}" ${isLoading && "disabled"} ${hasError && "data-error"}'
      )
      expect(attrs).toEqual({
        event: {
          onclick: "(e) => handleClick(e)",
        },
        boolean: {
          disabled: { type: "dynamic", value: "isLoading" },
          "data-error": { type: "dynamic", value: "hasError" },
        },
      })
    })

    it("события с множественными условными атрибутами", () => {
      const attrs = parseAttributes(
        'onchange="${(e) => setValue(e.target.value)}" ${isValid && "data-valid"} ${isRequired && "required"} ${isDisabled && "disabled"} onfocus="${() => showHelp()}"'
      )
      expect(attrs).toEqual({
        event: {
          onchange: "(e) => setValue(e.target.value)",
          onfocus: "() => showHelp()",
        },
        boolean: {
          "data-valid": { type: "dynamic", value: "isValid" },
          required: { type: "dynamic", value: "isRequired" },
          disabled: { type: "dynamic", value: "isDisabled" },
        },
      })
    })
  })

  describe("граничные случаи", () => {
    it("пустая стрелочная функция", () => {
      const attrs = parseAttributes('onclick="${() => {}}"')
      expect(attrs).toEqual({
        event: {
          onclick: "() => {}",
        },
      })
    })

    it("пустая стрелочная функция без кавычек", () => {
      const attrs = parseAttributes("onclick=${() => {}}")
      expect(attrs).toEqual({
        event: {
          onclick: "() => {}",
        },
      })
    })

    it("событие с возвратом значения", () => {
      const attrs = parseAttributes('onclick="${() => true}"')
      expect(attrs).toEqual({
        event: {
          onclick: "() => true",
        },
      })
    })

    it("событие с возвратом значения без кавычек", () => {
      const attrs = parseAttributes("onclick=${() => true}")
      expect(attrs).toEqual({
        event: {
          onclick: "() => true",
        },
      })
    })

    it("событие с комментарием", () => {
      const attrs = parseAttributes('onclick="${(e) => { /* handle click */ handleClick(e); }}"')
      expect(attrs).toEqual({
        event: {
          onclick: "(e) => { /* handle click */ handleClick(e); }",
        },
      })
    })

    it("событие с комментарием без кавычек", () => {
      const attrs = parseAttributes("onclick=${(e) => { /* handle click */ handleClick(e); }}")
      expect(attrs).toEqual({
        event: {
          onclick: "(e) => { /* handle click */ handleClick(e); }",
        },
      })
    })

    it("событие с template literals", () => {
      const attrs = parseAttributes('onclick="${(e) => console.log(`Clicked at ${e.clientX}, ${e.clientY}`)}"')
      expect(attrs).toEqual({
        event: {
          onclick: "(e) => console.log(`Clicked at ${e.clientX}, ${e.clientY}`)",
        },
      })
    })
  })

  describe("события для разных элементов", () => {
    it("onload для img", () => {
      const attrs = parseAttributes('src="image.jpg" onload="${(e) => imageLoaded(e.target)}"')
      expect(attrs).toEqual({
        event: {
          onload: "(e) => imageLoaded(e.target)",
        },
        string: {
          src: { type: "static", value: "image.jpg" },
        },
      })
    })

    it("onerror для img", () => {
      const attrs = parseAttributes('src="image.jpg" onerror="${(e) => handleImageError(e)}"')
      expect(attrs).toEqual({
        event: {
          onerror: "(e) => handleImageError(e)",
        },
        string: {
          src: { type: "static", value: "image.jpg" },
        },
      })
    })

    it("onplay для video", () => {
      const attrs = parseAttributes(
        'src="video.mp4" onplay="${() => startAnalytics()}" onpause="${() => pauseAnalytics()}"'
      )
      expect(attrs).toEqual({
        event: {
          onplay: "() => startAnalytics()",
          onpause: "() => pauseAnalytics()",
        },
        string: {
          src: { type: "static", value: "video.mp4" },
        },
      })
    })

    it("oninput для textarea", () => {
      const attrs = parseAttributes('oninput="${(e) => autoResize(e.target)}" onfocus="${() => showPlaceholder()}"')
      expect(attrs).toEqual({
        event: {
          oninput: "(e) => autoResize(e.target)",
          onfocus: "() => showPlaceholder()",
        },
      })
    })
  })

  describe("кастомные события на on...", () => {
    it("onCustomEvent с простой функцией", () => {
      const attrs = parseAttributes('onCustomEvent="${(e) => handleCustomEvent(e)}"')
      expect(attrs).toEqual({
        event: {
          onCustomEvent: "(e) => handleCustomEvent(e)",
        },
      })
    })

    it("onCustomEvent без кавычек", () => {
      const attrs = parseAttributes("onCustomEvent=${(e) => handleCustomEvent(e)}")
      expect(attrs).toEqual({
        event: {
          onCustomEvent: "(e) => handleCustomEvent(e)",
        },
      })
    })

    it("onDataChange с параметрами", () => {
      const attrs = parseAttributes('onDataChange="${(event, data) => updateData(event, data)}"')
      expect(attrs).toEqual({
        event: {
          onDataChange: "(event, data) => updateData(event, data)",
        },
      })
    })

    it("onDataChange без кавычек", () => {
      const attrs = parseAttributes("onDataChange=${(event, data) => updateData(event, data)}")
      expect(attrs).toEqual({
        event: {
          onDataChange: "(event, data) => updateData(event, data)",
        },
      })
    })

    it("onStateUpdate с деструктуризацией", () => {
      const attrs = parseAttributes('onStateUpdate="${({ type, payload }) => updateState(type, payload)}"')
      expect(attrs).toEqual({
        event: {
          onStateUpdate: "({ type, payload }) => updateState(type, payload)",
        },
      })
    })

    it("onStateUpdate без кавычек", () => {
      const attrs = parseAttributes("onStateUpdate=${({ type, payload }) => updateState(type, payload)}")
      expect(attrs).toEqual({
        event: {
          onStateUpdate: "({ type, payload }) => updateState(type, payload)",
        },
      })
    })

    it("onValidation с условной логикой", () => {
      const attrs = parseAttributes('onValidation="${(e) => isValid && validateField(e.target)}"')
      expect(attrs).toEqual({
        event: {
          onValidation: "(e) => isValid && validateField(e.target)",
        },
      })
    })

    it("onValidation без кавычек", () => {
      const attrs = parseAttributes("onValidation=${(e) => isValid && validateField(e.target)}")
      expect(attrs).toEqual({
        event: {
          onValidation: "(e) => isValid && validateField(e.target)",
        },
      })
    })

    it("onAsyncOperation с асинхронной функцией", () => {
      const attrs = parseAttributes('onAsyncOperation="${async (e) => await performAsyncOperation(e)}"')
      expect(attrs).toEqual({
        event: {
          onAsyncOperation: "async (e) => await performAsyncOperation(e)",
        },
      })
    })

    it("onAsyncOperation без кавычек", () => {
      const attrs = parseAttributes("onAsyncOperation=${async (e) => await performAsyncOperation(e)}")
      expect(attrs).toEqual({
        event: {
          onAsyncOperation: "async (e) => await performAsyncOperation(e)",
        },
      })
    })

    it("onComplexLogic с множественными условиями", () => {
      const attrs = parseAttributes(
        'onComplexLogic="${(e) => { const value = e.target.value; if (value.length > 0) process(value); else clearError(); }}"'
      )
      expect(attrs).toEqual({
        event: {
          onComplexLogic:
            "(e) => { const value = e.target.value; if (value.length > 0) process(value); else clearError(); }",
        },
      })
    })

    it("onComplexLogic без кавычек", () => {
      const attrs = parseAttributes(
        "onComplexLogic=${(e) => { const value = e.target.value; if (value.length > 0) process(value); else clearError(); }}"
      )
      expect(attrs).toEqual({
        event: {
          onComplexLogic:
            "(e) => { const value = e.target.value; if (value.length > 0) process(value); else clearError(); }",
        },
      })
    })

    it("несколько кастомных событий на одном элементе", () => {
      const attrs = parseAttributes(
        'onCustomEvent="${(e) => handleCustom(e)}" onDataChange="${(e) => updateData(e)}" onStateUpdate="${(e) => updateState(e)}"'
      )
      expect(attrs).toEqual({
        event: {
          onCustomEvent: "(e) => handleCustom(e)",
          onDataChange: "(e) => updateData(e)",
          onStateUpdate: "(e) => updateState(e)",
        },
      })
    })

    it("несколько кастомных событий без кавычек", () => {
      const attrs = parseAttributes(
        "onCustomEvent=${(e) => handleCustom(e)} onDataChange=${(e) => updateData(e)} onStateUpdate=${(e) => updateState(e)}"
      )
      expect(attrs).toEqual({
        event: {
          onCustomEvent: "(e) => handleCustom(e)",
          onDataChange: "(e) => updateData(e)",
          onStateUpdate: "(e) => updateState(e)",
        },
      })
    })

    it("смешанные стандартные и кастомные события", () => {
      const attrs = parseAttributes(
        'onclick="${(e) => handleClick(e)}" onCustomEvent="${(e) => handleCustom(e)}" onfocus="${() => showHelp()}"'
      )
      expect(attrs).toEqual({
        event: {
          onclick: "(e) => handleClick(e)",
          onCustomEvent: "(e) => handleCustom(e)",
          onfocus: "() => showHelp()",
        },
      })
    })

    it("смешанные стандартные и кастомные события без кавычек", () => {
      const attrs = parseAttributes(
        "onclick=${(e) => handleClick(e)} onCustomEvent=${(e) => handleCustom(e)} onfocus=${() => showHelp()}"
      )
      expect(attrs).toEqual({
        event: {
          onclick: "(e) => handleClick(e)",
          onCustomEvent: "(e) => handleCustom(e)",
          onfocus: "() => showHelp()",
        },
      })
    })

    it("кастомные события с другими атрибутами", () => {
      const attrs = parseAttributes(
        'class="container" onCustomEvent="${(e) => handleCustom(e)}" onDataChange="${(e) => updateData(e)}"'
      )
      expect(attrs).toEqual({
        event: {
          onCustomEvent: "(e) => handleCustom(e)",
          onDataChange: "(e) => updateData(e)",
        },
        string: {
          class: { type: "static", value: "container" },
        },
      })
    })

    it("кастомные события с другими атрибутами без кавычек", () => {
      const attrs = parseAttributes(
        'class="container" onCustomEvent=${(e) => handleCustom(e)} onDataChange=${(e) => updateData(e)}'
      )
      expect(attrs).toEqual({
        event: {
          onCustomEvent: "(e) => handleCustom(e)",
          onDataChange: "(e) => updateData(e)",
        },
        string: {
          class: { type: "static", value: "container" },
        },
      })
    })
  })
})
