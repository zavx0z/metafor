import {unsafeSVG} from '../../directives/unsafe-svg.js';
import {render, html, nothing, noChange} from '../../html.js';
import {describe, test, beforeAll, expect} from 'bun:test';

describe('unsafeSVG', () => {
  let container: HTMLElement;

  beforeAll(() => {
    container = document.createElement('div');
  });

  test('renders SVG', () => {
    render(
      // prettier-ignore
      html`<svg>before${unsafeSVG(
          '<line x1="0" y1="0" x2="10" y2="10" stroke="black"/>'
        )}</svg>`,
      container
    );
    expect(container.innerHTML).oneOfMatchStringHTMLStripMarkers([
      '<svg>before<line x1="0" y1="0" x2="10" y2="10" stroke="black"></line></svg>',
      '<svg>before<line stroke="black" x1="0" y1="0" x2="10" y2="10"></line></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg">before<line stroke="black" x1="0" y1="0" x2="10" y2="10" /></svg>',
    ]);
    const lineElement = container.querySelector('line')!;
    expect(lineElement.namespaceURI).toBe('http://www.w3.org/2000/svg');
  });

  test('rendering `nothing` renders empty string to content', () => {
    render(html`<svg>before${unsafeSVG(nothing)}after</svg>`, container);
    expect(container.innerHTML).toMatchStringHTMLStripMarkers('<svg>beforeafter</svg>');
  });

  test('rendering `noChange` does not change the previous content', () => {
    const template = (v: string | typeof noChange) =>
      html`<svg>before${unsafeSVG(v)}after</svg>`;
    render(template('<g>Hi</g>'), container);
    expect(container.innerHTML).toMatchStringHTMLStripMarkers('<svg>before<g>Hi</g>after</svg>');
    render(template(noChange), container);
    expect(container.innerHTML).toMatchStringHTMLStripMarkers('<svg>before<g>Hi</g>after</svg>');
  });

  test('rendering `undefined` renders empty string to content', () => {
    render(html`<svg>before${unsafeSVG(undefined)}after</svg>`, container);
    expect(container.innerHTML).toMatchStringHTMLStripMarkers('<svg>beforeafter</svg>');
  });

  test('rendering `null` renders empty string to content', () => {
    render(html`<svg>before${unsafeSVG(null)}after</svg>`, container);
    expect(container.innerHTML).toMatchStringHTMLStripMarkers('<svg>beforeafter</svg>');
  });

  test('dirty checks primitive values', () => {
    const value = 'aaa';
    const t = () => html`<svg>${unsafeSVG(value)}</svg>`;

    // Initial render
    render(t(), container);
    expect(container.innerHTML).oneOfMatchStringHTMLStripMarkers([
      '<svg>aaa</svg>',
      '<svg xmlns="http://www.w3.org/2000/svg">aaa</svg>',
    ]);

    // Modify instance directly. Since @pkg/html doesn't dirty check against
    // actual DOM, but against previous part values, this modification should
    // persist through the next render if dirty checking works.
    const text = container.querySelector('svg')!.childNodes[1] as Text;
    text.textContent = 'bbb';
    expect(container.innerHTML).oneOfMatchStringHTMLStripMarkers([
      '<svg>bbb</svg>',
      '<svg xmlns="http://www.w3.org/2000/svg">bbb</svg>',
    ]);

    // Re-render with the same value
    render(t(), container);
    expect(container.innerHTML).oneOfMatchStringHTMLStripMarkers([
      '<svg>bbb</svg>',
      '<svg xmlns="http://www.w3.org/2000/svg">bbb</svg>',
    ]);
    const text2 = container.querySelector('svg')!.childNodes[1] as Text;
    expect(text).toBe(text2);
  });

  test('throws on non-string values', () => {
    const value = ['aaa'];
    const t = () => html`<div>${unsafeSVG(value as any)}</div>`;
    expect(() => render(t(), container)).toThrow();
  });

  test('renders after other values', () => {
    const value = '<text></text>';
    const primitive = 'aaa';
    const t = (content: any) => html`<svg>${content}</svg>`;

    // Initial unsafeSVG render
    render(t(unsafeSVG(value)), container);
    expect(container.innerHTML).oneOfMatchStringHTMLStripMarkers([
      '<svg><text></text></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg"><text /></svg>',
    ]);

    // Re-render with a non-unsafeSVG value
    render(t(primitive), container);
    expect(container.innerHTML).oneOfMatchStringHTMLStripMarkers([
      '<svg>aaa</svg>',
      '<svg xmlns="http://www.w3.org/2000/svg">aaa</svg>',
    ]);

    // Re-render with unsafeSVG again
    render(t(unsafeSVG(value)), container);
    expect(container.innerHTML).oneOfMatchStringHTMLStripMarkers([
      '<svg><text></text></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg"><text /></svg>',
    ]);
  });
});
