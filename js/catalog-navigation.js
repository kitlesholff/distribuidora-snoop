(function () {
  'use strict';
  // Somente navegação visual: o filtro, os preços e o carrinho continuam no app.js.
  const nav = document.querySelector('#categoryNavigation');
  if (!nav) return;
  const list = nav.querySelector('#categories');
  const previous = nav.querySelector('#previousCategories');
  const next = nav.querySelector('#nextCategories');
  const expand = nav.querySelector('#expandCategories');
  const catalog = document.querySelector('#produtos');
  const header = document.querySelector('.topbar');
  const mobile = window.matchMedia('(max-width: 820px)');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const behavior = () => reducedMotion.matches ? 'instant' : 'smooth';
  let expanded = false;
  let frame = 0;

  function updateEdges() {
    previous.disabled = list.scrollLeft <= 2;
    next.disabled = list.scrollLeft + list.clientWidth >= list.scrollWidth - 2;
  }

  function reveal(button) {
    if (!button || expanded || !mobile.matches) return;
    const viewport = list.getBoundingClientRect();
    const rect = button.getBoundingClientRect();
    if (rect.left < viewport.left + 3) list.scrollBy({ left: rect.left - viewport.left - 3, behavior: behavior() });
    else if (rect.right > viewport.right - 3) list.scrollBy({ left: rect.right - viewport.right + 3, behavior: behavior() });
  }

  function setExpanded(value) {
    expanded = value;
    nav.classList.toggle('is-expanded', value);
    expand.setAttribute('aria-expanded', String(value));
    expand.querySelector('span').textContent = value ? 'Recolher' : 'Ver todas';
    updateLayout();
    // Interrompe também a inércia de um gesto de toque antes de abrir a grade.
    list.scrollTo({ left: 0, top: 0, behavior: 'instant' });
  }

  function updateLayout() {
    if (header) catalog.style.setProperty('--catalog-header-height', `${header.getBoundingClientRect().height}px`);
    if (!mobile.matches && expanded) {
      setExpanded(false);
      return;
    }
    // Mede com a faixa inteira disponível para evitar alternância das setas no limite.
    previous.hidden = true;
    next.hidden = true;
    const overflowing = list.scrollWidth > list.clientWidth + 2;
    expand.hidden = !mobile.matches || (!overflowing && !expanded);
    previous.hidden = next.hidden = !mobile.matches || expanded || !overflowing;
    updateEdges();
  }

  function scheduleLayout() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => { updateLayout(); reveal(list.querySelector('.active')); });
  }

  previous.addEventListener('click', () => list.scrollBy({ left: -list.clientWidth * .8, behavior: behavior() }));
  next.addEventListener('click', () => list.scrollBy({ left: list.clientWidth * .8, behavior: behavior() }));
  expand.addEventListener('click', () => {
    setExpanded(!expanded);
    if (!expanded) reveal(list.querySelector('.active'));
  });
  list.addEventListener('scroll', updateEdges, { passive: true });
  list.addEventListener('click', event => {
    const button = event.target.closest('[data-category]');
    if (!button) return;
    if (expanded) setExpanded(false);
    reveal(button);
    // Ao trocar depois de rolar vários produtos, volta apenas ao início dos resultados.
    const results = document.querySelector('#catalogResults');
    const bottom = nav.getBoundingClientRect().bottom;
    if (mobile.matches && results.getBoundingClientRect().top < bottom) {
      window.scrollBy({ top: results.getBoundingClientRect().top - bottom - 12, behavior: behavior() });
    }
  });
  list.addEventListener('focusin', event => reveal(event.target.closest('[data-category]')));
  nav.addEventListener('keydown', event => {
    if (event.key === 'Escape' && expanded) {
      setExpanded(false);
      expand.focus({ preventScroll: true });
      reveal(list.querySelector('.active'));
    }
  });
  new MutationObserver(scheduleLayout).observe(list, { childList: true });
  if ('ResizeObserver' in window) {
    const observer = new ResizeObserver(scheduleLayout);
    observer.observe(nav.querySelector('.category-rail'));
    if (header) observer.observe(header);
  }
  window.addEventListener('resize', scheduleLayout, { passive: true });
  if (document.fonts) document.fonts.ready.then(scheduleLayout);
  nav.classList.add('is-enhanced');
  updateLayout();
  scheduleLayout();
})();
