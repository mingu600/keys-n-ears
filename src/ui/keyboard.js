// On-screen piano, C2..C6. Shows held notes and hint notes.

const BLACK = new Set([1, 3, 6, 8, 10]);
const LOW = 36; // C2
const HIGH = 84; // C6

export function createKeyboard(container, { onClick }) {
  container.innerHTML = '';
  const keys = new Map();
  let whiteIndex = 0;
  const whiteCount = [...range()].filter((n) => !BLACK.has(n % 12)).length;

  for (const note of range()) {
    const el = document.createElement('div');
    const black = BLACK.has(note % 12);
    el.className = black ? 'key black' : 'key white';
    el.dataset.note = note;
    if (black) {
      el.style.left = `calc(${(whiteIndex / whiteCount) * 100}% - var(--black-w) / 2)`;
    } else {
      el.style.left = `${(whiteIndex / whiteCount) * 100}%`;
      el.style.width = `${100 / whiteCount}%`;
      if (note % 12 === 0) el.textContent = `C${note / 12 - 1}`;
      whiteIndex++;
    }
    el.addEventListener('mousedown', (e) => {
      e.preventDefault();
      onClick(note);
    });
    container.appendChild(el);
    keys.set(note, el);
  }

  return {
    render(held, hint = []) {
      const hintSet = new Set(hint);
      for (const [note, el] of keys) {
        el.classList.toggle('held', held.has(note));
        el.classList.toggle('hint', hintSet.has(note));
      }
    },
  };
}

function* range() {
  for (let n = LOW; n <= HIGH; n++) yield n;
}
