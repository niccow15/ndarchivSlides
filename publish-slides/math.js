(function () {
  'use strict';
  const options = { throwOnError: false, strict: 'error', trust: false, output: 'htmlAndMathml', minRuleThickness: .05 };
  function render(root = document) {
    for (const element of root.querySelectorAll('[data-tex]')) {
      katex.render(element.dataset.tex, element, { ...options, displayMode: element.dataset.display === 'true' });
    }
  }
  function inline(tex) {
    return `<span class="math-inline">${katex.renderToString(tex, { ...options, displayMode: false })}</span>`;
  }
  window.DeckMath = { render, inline };
  render();
})();
