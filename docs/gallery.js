'use strict';

(() => {
  const gallery = document.querySelector('[aria-labelledby="workbench-gallery"]');
  const form = gallery.querySelector('.gallery-filters');
  const search = form.querySelector('#gallery-search');
  const category = form.querySelector('#gallery-category');
  const count = form.querySelector('#gallery-count');
  const empty = gallery.querySelector('#gallery-empty');
  const navigation = gallery.querySelector('.gallery-nav');

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
