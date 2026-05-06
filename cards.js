// 48 cards — image-based deck (cards/01.jpg ~ 48.jpg, ~800x567 landscape)
window.CARDS = Array.from({ length: 48 }, (_, i) => {
  const id = i + 1;
  const num = String(id).padStart(2, "0");
  return {
    id,
    num,
    src: `cards/${num}.jpg`,
  };
});
