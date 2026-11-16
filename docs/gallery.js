'use strict';

(() => {
  function fitFrame(frame) {
    let observer;
    frame.addEventListener('load', () => {
      observer?.disconnect();
      const body = frame.contentDocument?.body;
      if (!body) return;
      function fit() {
        frame.style.height = Math.ceil(body.getBoundingClientRect().height + 2) + 'px';
      }
      observer = new ResizeObserver(fit);
      observer.observe(body);
      fit();
    });
    return () => observer?.disconnect();
  }

  for (const frame of document.querySelectorAll('iframe.live-frame')) fitFrame(frame);

  const gallery = document.querySelector('[aria-labelledby="workbench-gallery"]');
  const form = gallery.querySelector('.gallery-filters');
  const search = form.querySelector('#gallery-search');
  const category = form.querySelector('#gallery-category');
  const count = form.querySelector('#gallery-count');
  const empty = gallery.querySelector('#gallery-empty');
  const navigation = gallery.querySelector('.gallery-nav');
  let active;

  function closePreview() {
    if (!active) return;
    active.disconnect();
    active.frame.remove();
    active.element.classList.remove('is-live');
    active.button.textContent = 'Try here';
    active.button.setAttribute('aria-expanded', 'false');
    active = null;
  }

  function previewFor(element) {
    const link = element.querySelector('h4 a');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'gallery-preview';
    button.textContent = 'Try here';
    button.setAttribute('aria-expanded', 'false');
    button.addEventListener('click', () => {
      const alreadyOpen = active?.element === element;
      closePreview();
      if (alreadyOpen) return;
      const url = new URL(link.href);
      url.searchParams.set('embed', '1');
      const frame = document.createElement('iframe');
      frame.className = 'live-frame';
      frame.title = link.textContent + ' live preview';
      const disconnect = fitFrame(frame);
      frame.src = url.href;
      element.classList.add('is-live');
      button.textContent = 'Close preview';
      button.setAttribute('aria-expanded', 'true');
      button.after(frame);
      active = {element, button, frame, disconnect};
    });
    element.querySelector('h4').after(button);
  }

  function normalize(text) {
    return text.normalize('NFKD').toLowerCase().replace(/\p{Mark}/gu,'')
      .replace(/[^\p{Letter}\p{Number}]+/gu,' ').trim();
  }

  // Reuse the static category headings and card descriptions as the search index.
  const groups = Array.from(navigation.querySelectorAll('a'), link => {
    const heading = gallery.querySelector(link.hash);
    const grid = heading.nextElementSibling;
    const cards = Array.from(grid.querySelectorAll('.gallery-project'), element => {
      const text = Array.from(element.querySelectorAll('h4, dd'), part => part.textContent);
      previewFor(element);
      return {element, keywords:normalize([heading.textContent, ...text].join(' '))};
    });
    const option = document.createElement('option');
    option.value = heading.id;
    option.textContent = heading.textContent;
    category.append(option);
    return {heading, grid, cards};
  });
  const total = groups.reduce((sum, group) => sum + group.cards.length, 0);

  function filter() {
    const terms = normalize(search.value).split(' ').filter(Boolean);
    let visible = 0;
    for (const {heading, grid, cards} of groups) {
      const inCategory = !category.value || category.value === heading.id;
      let matches = 0;
      for (const {element, keywords} of cards) {
        const show = inCategory && terms.every(term => keywords.includes(term));
        element.hidden = !show;
        if (show) matches++;
      }
      heading.hidden = grid.hidden = matches === 0;
      visible += matches;
    }
    if (active?.element.hidden) closePreview();
    count.textContent = `Showing ${visible} of ${total} projects`;
    empty.hidden = visible !== 0;
  }

  search.addEventListener('input', filter);
  category.addEventListener('change', filter);
  form.addEventListener('submit', event => event.preventDefault());
  form.querySelector('#gallery-clear').addEventListener('click', () => {
    form.reset();
    filter();
    search.focus();
  });
  filter();
  navigation.hidden = true;
  form.hidden = false;
})();
