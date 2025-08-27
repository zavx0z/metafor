import { describe, it, expect } from "bun:test"
import { parseAttributes } from "../../attributes.ts"

describe("комплексные тесты с множественными атрибутами", () => {
  describe("элемент area с shape и coords", () => {
    it("простые статические значения", () => {
      const attrs = parseAttributes('<area shape="rect" coords="0,0,100,100" alt="Прямоугольник" disabled readonly>')
      expect(attrs).toEqual({
        string: {
          shape: { type: "static", value: "rect" },
          alt: { type: "static", value: "Прямоугольник" },
        },
        array: {
          coords: [
            { type: "static", value: "0" },
            { type: "static", value: "0" },
            { type: "static", value: "100" },
            { type: "static", value: "100" },
          ],
        },
        boolean: {
          disabled: { type: "static", value: true },
          readonly: { type: "static", value: true },
        },
      })
    })

    it("динамические значения в coords", () => {
      const attrs = parseAttributes(
        '<area shape="circle" coords="${center.x},${center.y},${radius}" alt="Круг" disabled=${context.disabled} ${context.loading && "loading"}>'
      )
      expect(attrs).toEqual({
        string: {
          shape: { type: "static", value: "circle" },
          alt: { type: "static", value: "Круг" },
        },
        array: {
          coords: [
            { type: "dynamic", value: "center.x" },
            { type: "dynamic", value: "center.y" },
            { type: "dynamic", value: "radius" },
          ],
        },
        boolean: {
          disabled: { type: "dynamic", value: "context.disabled" },
          loading: { type: "dynamic", value: "context.loading" },
        },
      })
    })

    it("смешанные значения в coords", () => {
      const attrs = parseAttributes(
        '<area shape="poly" coords="0,0,${width},${height},50,50" alt="Многоугольник" checked=${isChecked} ${context.visible && "visible"} ${context.active && "active"}>'
      )
      expect(attrs).toEqual({
        string: {
          shape: { type: "static", value: "poly" },
          alt: { type: "static", value: "Многоугольник" },
        },
        array: {
          coords: [
            { type: "static", value: "0" },
            { type: "static", value: "0" },
            { type: "dynamic", value: "width" },
            { type: "dynamic", value: "height" },
            { type: "static", value: "50" },
            { type: "static", value: "50" },
          ],
        },
        boolean: {
          checked: { type: "dynamic", value: "isChecked" },
          visible: { type: "dynamic", value: "context.visible" },
          active: { type: "dynamic", value: "context.active" },
        },
      })
    })

    it("сложные условные выражения в coords", () => {
      const attrs = parseAttributes(
        '<area shape="rect" coords="${isLarge ? "0,0,300,300" : "0,0,100,100"}" alt="Условный прямоугольник" disabled=${context.status === "loading"} ${context.isLarge && "large"} ${context.isActive && "active"}>'
      )
      expect(attrs).toEqual({
        string: {
          shape: { type: "static", value: "rect" },
          coords: { type: "dynamic", value: 'isLarge ? "0,0,300,300" : "0,0,100,100"' },
          alt: { type: "static", value: "Условный прямоугольник" },
        },
        boolean: {
          disabled: { type: "dynamic", value: 'context.status === "loading"' },
          large: { type: "dynamic", value: "context.isLarge" },
          active: { type: "dynamic", value: "context.isActive" },
        },
      })
    })
  })

  describe("элемент img с множественными атрибутами", () => {
    it("src, alt, class, srcset", () => {
      const attrs = parseAttributes(
        '<img src="image.jpg" alt="Изображение" class="photo main" srcset="image.jpg 1x, image@2x.jpg 2x" loading="lazy" ${context.visible && "visible"} ${context.loaded && "loaded"}>'
      )
      expect(attrs).toEqual({
        string: {
          src: { type: "static", value: "image.jpg" },
          alt: { type: "static", value: "Изображение" },
          loading: { type: "static", value: "lazy" },
        },
        array: {
          class: [
            { type: "static", value: "photo" },
            { type: "static", value: "main" },
          ],
          srcset: [
            { type: "static", value: "image.jpg 1x" },
            { type: "static", value: "image@2x.jpg 2x" },
          ],
        },
        boolean: {
          visible: { type: "dynamic", value: "context.visible" },
          loaded: { type: "dynamic", value: "context.loaded" },
        },
      })
    })

    it("динамические значения в нескольких атрибутах", () => {
      const attrs = parseAttributes(
        '<img src="${image.url}" alt="${image.alt}" class="${image.classes}" srcset="${image.srcset}" disabled=${context.disabled} ${context.loading && "loading"} ${context.error && "error"}>'
      )
      expect(attrs).toEqual({
        string: {
          src: { type: "dynamic", value: "image.url" },
          alt: { type: "dynamic", value: "image.alt" },
          class: { type: "dynamic", value: "image.classes" },
          srcset: { type: "dynamic", value: "image.srcset" },
        },
        boolean: {
          disabled: { type: "dynamic", value: "context.disabled" },
          loading: { type: "dynamic", value: "context.loading" },
          error: { type: "dynamic", value: "context.error" },
        },
      })
    })

    it("смешанные значения в разных атрибутах", () => {
      const attrs = parseAttributes(
        '<img src="base.jpg" alt="Фото ${user.name}" class="avatar ${user.status}" srcset="base.jpg 1x, ${user.highResImage} 2x" readonly={user.readonly} ${user.isAdmin && "admin"} ${user.isVerified && "verified"}>'
      )
      expect(attrs).toEqual({
        string: {
          src: { type: "static", value: "base.jpg" },
          alt: { type: "mixed", value: "Фото ${user.name}" },
          readonly: { type: "static", value: "{user.readonly}" },
        },
        array: {
          class: [
            { type: "static", value: "avatar" },
            { type: "dynamic", value: "user.status" },
          ],
          srcset: [
            { type: "static", value: "base.jpg 1x" },
            { type: "mixed", value: "${user.highResImage} 2x" },
          ],
        },
        boolean: {
          admin: { type: "dynamic", value: "user.isAdmin" },
          verified: { type: "dynamic", value: "user.isVerified" },
        },
      })
    })
  })

  describe("элемент iframe с allow и sandbox", () => {
    it("простые статические значения", () => {
      const attrs = parseAttributes(
        '<iframe src="page.html" allow="camera;microphone" sandbox="allow-scripts allow-same-origin" loading="lazy" ${context.trusted && "trusted"} ${context.secure && "secure"}>'
      )
      expect(attrs).toEqual({
        string: {
          src: { type: "static", value: "page.html" },
          loading: { type: "static", value: "lazy" },
        },
        array: {
          allow: [
            { type: "static", value: "camera" },
            { type: "static", value: "microphone" },
          ],
          sandbox: [
            { type: "static", value: "allow-scripts" },
            { type: "static", value: "allow-same-origin" },
          ],
        },
        boolean: {
          trusted: { type: "dynamic", value: "context.trusted" },
          secure: { type: "dynamic", value: "context.secure" },
        },
      })
    })

    it("динамические значения в allow", () => {
      const attrs = parseAttributes(
        '<iframe src="${page.url}" allow="${permissions.join(";")}" sandbox="allow-scripts" disabled=${context.disabled} ${context.loading && "loading"} ${context.error && "error"}>'
      )
      expect(attrs).toEqual({
        string: {
          src: { type: "dynamic", value: "page.url" },
          allow: { type: "dynamic", value: 'permissions.join(";")' },
          sandbox: { type: "static", value: "allow-scripts" },
        },
        boolean: {
          disabled: { type: "dynamic", value: "context.disabled" },
          loading: { type: "dynamic", value: "context.loading" },
          error: { type: "dynamic", value: "context.error" },
        },
      })
    })
  })

  describe("элемент input с accept и class", () => {
    it("простые статические значения", () => {
      const attrs = parseAttributes(
        '<input type="file" accept="image/png,image/jpeg" class="file-input required" required disabled ${context.valid && "valid"} ${context.invalid && "invalid"}>'
      )
      expect(attrs).toEqual({
        string: {
          type: { type: "static", value: "file" },
        },
        array: {
          accept: [
            { type: "static", value: "image/png" },
            { type: "static", value: "image/jpeg" },
          ],
          class: [
            { type: "static", value: "file-input" },
            { type: "static", value: "required" },
          ],
        },
        boolean: {
          required: { type: "static", value: true },
          disabled: { type: "static", value: true },
          valid: { type: "dynamic", value: "context.valid" },
          invalid: { type: "dynamic", value: "context.invalid" },
        },
      })
    })

    it("динамические значения в accept", () => {
      const attrs = parseAttributes(
        '<input type="file" accept="${allowedTypes.join(",")}" class="file-input ${isRequired ? "required" : ""}" checked=${isChecked} ${context.valid && "valid"} ${context.invalid && "invalid"}>'
      )
      expect(attrs).toEqual({
        string: {
          type: { type: "static", value: "file" },
          accept: { type: "dynamic", value: 'allowedTypes.join(",")' },
        },
        array: {
          class: [
            { type: "static", value: "file-input" },
            { type: "dynamic", value: 'isRequired ? "required" : ""' },
          ],
        },
        boolean: {
          checked: { type: "dynamic", value: "isChecked" },
          valid: { type: "dynamic", value: "context.valid" },
          invalid: { type: "dynamic", value: "context.invalid" },
        },
      })
    })
  })

  describe("элемент link с rel и class", () => {
    it("простые статические значения", () => {
      const attrs = parseAttributes(
        '<link rel="stylesheet preload" href="style.css" class="main-styles" disabled ${context.loaded && "loaded"} ${context.cached && "cached"}>'
      )
      expect(attrs).toEqual({
        string: {
          href: { type: "static", value: "style.css" },
          class: { type: "static", value: "main-styles" },
        },
        array: {
          rel: [
            { type: "static", value: "stylesheet" },
            { type: "static", value: "preload" },
          ],
        },
        boolean: {
          disabled: { type: "static", value: true },
          loaded: { type: "dynamic", value: "context.loaded" },
          cached: { type: "dynamic", value: "context.cached" },
        },
      })
    })

    it("динамические значения в rel", () => {
      const attrs = parseAttributes(
        '<link rel="${isPreload ? "preload" : "stylesheet"}" href="${style.url}" class="styles" disabled=${context.disabled} ${context.loading && "loading"} ${context.error && "error"}>'
      )
      expect(attrs).toEqual({
        string: {
          rel: { type: "dynamic", value: 'isPreload ? "preload" : "stylesheet"' },
          href: { type: "dynamic", value: "style.url" },
          class: { type: "static", value: "styles" },
        },
        boolean: {
          disabled: { type: "dynamic", value: "context.disabled" },
          loading: { type: "dynamic", value: "context.loading" },
          error: { type: "dynamic", value: "context.error" },
        },
      })
    })
  })

  describe("элемент a с ping и rel", () => {
    it("простые статические значения", () => {
      const attrs = parseAttributes(
        '<a href="https://example.com" ping="/analytics" rel="noopener noreferrer" disabled ${context.external && "external"} ${context.secure && "secure"}>'
      )
      expect(attrs).toEqual({
        string: {
          href: { type: "static", value: "https://example.com" },
          ping: { type: "static", value: "/analytics" },
        },
        array: {
          rel: [
            { type: "static", value: "noopener" },
            { type: "static", value: "noreferrer" },
          ],
        },
        boolean: {
          disabled: { type: "static", value: true },
          external: { type: "dynamic", value: "context.external" },
          secure: { type: "dynamic", value: "context.secure" },
        },
      })
    })

    it("динамические значения в ping", () => {
      const attrs = parseAttributes(
        '<a href="${link.url}" ping="${analytics.urls.join(" ")}" rel="noopener" disabled=${context.disabled} ${context.external && "external"} ${context.secure && "secure"}>'
      )
      expect(attrs).toEqual({
        string: {
          href: { type: "dynamic", value: "link.url" },
          ping: { type: "dynamic", value: 'analytics.urls.join(" ")' },
          rel: { type: "static", value: "noopener" },
        },
        boolean: {
          disabled: { type: "dynamic", value: "context.disabled" },
          external: { type: "dynamic", value: "context.external" },
          secure: { type: "dynamic", value: "context.secure" },
        },
      })
    })
  })

  describe("элемент meta с accept-charset", () => {
    it("простые статические значения", () => {
      const attrs = parseAttributes(
        '<meta charset="UTF-8" accept-charset="UTF-8 ISO-8859-1" disabled ${context.valid && "valid"} ${context.invalid && "invalid"}>'
      )
      expect(attrs).toEqual({
        string: {
          charset: { type: "static", value: "UTF-8" },
        },
        array: {
          "accept-charset": [
            { type: "static", value: "UTF-8" },
            { type: "static", value: "ISO-8859-1" },
          ],
        },
        boolean: {
          disabled: { type: "static", value: true },
          valid: { type: "dynamic", value: "context.valid" },
          invalid: { type: "dynamic", value: "context.invalid" },
        },
      })
    })
  })

  describe("элемент th с headers и class", () => {
    it("простые статические значения", () => {
      const attrs = parseAttributes(
        '<th headers="col1 col2" class="header-cell sortable" disabled ${context.sortable && "sortable"} ${context.active && "active"}>'
      )
      expect(attrs).toEqual({
        array: {
          headers: [
            { type: "static", value: "col1" },
            { type: "static", value: "col2" },
          ],
          class: [
            { type: "static", value: "header-cell" },
            { type: "static", value: "sortable" },
          ],
        },
        boolean: {
          disabled: { type: "static", value: true },
          sortable: { type: "dynamic", value: "context.sortable" },
          active: { type: "dynamic", value: "context.active" },
        },
      })
    })
  })

  describe("элемент ol с itemref и class", () => {
    it("простые статические значения", () => {
      const attrs = parseAttributes(
        '<ol itemref="item1 item2" class="numbered-list" disabled ${context.ordered && "ordered"} ${context.active && "active"}>'
      )
      expect(attrs).toEqual({
        string: {
          class: { type: "static", value: "numbered-list" },
        },
        array: {
          itemref: [
            { type: "static", value: "item1" },
            { type: "static", value: "item2" },
          ],
        },
        boolean: {
          disabled: { type: "static", value: true },
          ordered: { type: "dynamic", value: "context.ordered" },
          active: { type: "dynamic", value: "context.active" },
        },
      })
    })
  })

  describe("элемент video с sizes и class", () => {
    it("простые статические значения", () => {
      const attrs = parseAttributes(
        '<video sizes="(max-width: 600px) 100vw, 50vw" class="responsive-video" disabled ${context.playing && "playing"} ${context.paused && "paused"}>'
      )
      expect(attrs).toEqual({
        string: {
          class: { type: "static", value: "responsive-video" },
        },
        array: {
          sizes: [
            { type: "static", value: "(max-width:" },
            { type: "static", value: "600px)" },
            { type: "static", value: "100vw," },
            { type: "static", value: "50vw" },
          ],
        },
        boolean: {
          disabled: { type: "static", value: true },
          playing: { type: "dynamic", value: "context.playing" },
          paused: { type: "dynamic", value: "context.paused" },
        },
      })
    })
  })

  describe("сложные случаи с множественными условными атрибутами", () => {
    it("элемент с условными классами и координатами", () => {
      const attrs = parseAttributes(
        '<area shape="rect" coords="${isLarge ? "0,0,300,300" : "0,0,100,100"}" class="${isActive ? "active" : "inactive"} ${isVisible ? "visible" : "hidden"}" disabled=${context.disabled} ${context.isLarge && "large"} ${context.isActive && "active"} ${context.isVisible && "visible"}>'
      )
      expect(attrs).toEqual({
        string: {
          shape: { type: "static", value: "rect" },
          coords: { type: "dynamic", value: 'isLarge ? "0,0,300,300" : "0,0,100,100"' },
        },
        array: {
          class: [
            { type: "dynamic", value: 'isActive ? "active" : "inactive"' },
            { type: "dynamic", value: 'isVisible ? "visible" : "hidden"' },
          ],
        },
        boolean: {
          disabled: { type: "dynamic", value: "context.disabled" },
          large: { type: "dynamic", value: "context.isLarge" },
          active: { type: "dynamic", value: "context.isActive" },
          visible: { type: "dynamic", value: "context.isVisible" },
        },
      })
    })

    it("элемент с множественными динамическими атрибутами", () => {
      const attrs = parseAttributes(
        '<img src="${image.url}" alt="${image.alt}" class="${image.classes}" srcset="${image.srcset}" sizes="${image.sizes}" disabled=${context.disabled} ${context.loading && "loading"} ${context.error && "error"} ${context.visible && "visible"}>'
      )
      expect(attrs).toEqual({
        string: {
          src: { type: "dynamic", value: "image.url" },
          alt: { type: "dynamic", value: "image.alt" },
          class: { type: "dynamic", value: "image.classes" },
          srcset: { type: "dynamic", value: "image.srcset" },
          sizes: { type: "dynamic", value: "image.sizes" },
        },
        boolean: {
          disabled: { type: "dynamic", value: "context.disabled" },
          loading: { type: "dynamic", value: "context.loading" },
          error: { type: "dynamic", value: "context.error" },
          visible: { type: "dynamic", value: "context.visible" },
        },
      })
    })

    it("элемент с смешанными статическими и динамическими атрибутами", () => {
      const attrs = parseAttributes(
        '<iframe src="https://example.com" allow="${permissions.join(";")}" sandbox="allow-scripts ${user.canAccess ? "allow-same-origin" : ""}" class="embed" disabled=${context.disabled} ${context.trusted && "trusted"} ${context.secure && "secure"} ${context.loading && "loading"}>'
      )
      expect(attrs).toEqual({
        string: {
          src: { type: "static", value: "https://example.com" },
          allow: { type: "dynamic", value: 'permissions.join(";")' },
          class: { type: "static", value: "embed" },
        },
        array: {
          sandbox: [
            { type: "static", value: "allow-scripts" },
            { type: "dynamic", value: 'user.canAccess ? "allow-same-origin" : ""' },
          ],
        },
        boolean: {
          disabled: { type: "dynamic", value: "context.disabled" },
          trusted: { type: "dynamic", value: "context.trusted" },
          secure: { type: "dynamic", value: "context.secure" },
          loading: { type: "dynamic", value: "context.loading" },
        },
      })
    })
  })

  describe("граничные случаи", () => {
    it("элемент только с строковыми атрибутами", () => {
      const attrs = parseAttributes(
        '<div id="main" title="Заголовок" data-test="value" disabled ${context.visible && "visible"} ${context.active && "active"}>'
      )
      expect(attrs).toEqual({
        string: {
          id: { type: "static", value: "main" },
          title: { type: "static", value: "Заголовок" },
          "data-test": { type: "static", value: "value" },
        },
        boolean: {
          disabled: { type: "static", value: true },
          visible: { type: "dynamic", value: "context.visible" },
          active: { type: "dynamic", value: "context.active" },
        },
      })
    })

    it("элемент только с массивными атрибутами", () => {
      const attrs = parseAttributes(
        '<div class="container" rel="nofollow noopener" ping="/analytics" disabled ${context.visible && "visible"} ${context.active && "active"}>'
      )
      expect(attrs).toEqual({
        string: {
          class: { type: "static", value: "container" },
          ping: { type: "static", value: "/analytics" },
        },
        array: {
          rel: [
            { type: "static", value: "nofollow" },
            { type: "static", value: "noopener" },
          ],
        },
        boolean: {
          disabled: { type: "static", value: true },
          visible: { type: "dynamic", value: "context.visible" },
          active: { type: "dynamic", value: "context.active" },
        },
      })
    })

    it("элемент с пустыми значениями", () => {
      const attrs = parseAttributes(
        '<div class="" rel="" title="" disabled ${context.visible && "visible"} ${context.active && "active"}>'
      )
      expect(attrs).toEqual({
        boolean: {
          disabled: { type: "static", value: true },
          visible: { type: "dynamic", value: "context.visible" },
          active: { type: "dynamic", value: "context.active" },
        },
      })
    })
  })
})
