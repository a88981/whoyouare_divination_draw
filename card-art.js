/* Card-back. Real artwork by 小玩 — 我只是想知道 Divination */
window.CardArt = (function () {
  // Returns an empty SVG (kept for layout) — actual visual is the CSS
  // background-image on the parent .card-back-img element. Using a single
  // CSS background (vs. one <image> per SVG) ensures the browser decodes
  // the JPEG only once, eliminating the first-card load delay during shuffle.
  function cardBack(seed = 1) {
    return `<div class="card-back-img" role="img" aria-label="牌背"></div>`;
  }
  return { cardBack };
})();
