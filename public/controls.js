// public/controls.js

// onMove(dx, dy) where dx/dy are -1, 0, +1
export function initControls({ onJoin, onReplay, onLive, onMove }) {
  const joinBtn = document.getElementById("joinBtn");
  const replayBtn = document.getElementById("replayBtn");
  const liveBtn = document.getElementById("liveBtn");
  const touchContainer = document.getElementById("touchControls");

  // ---- top buttons ----
  if (joinBtn && onJoin) {
    joinBtn.addEventListener("click", onJoin);
  }
  if (replayBtn && onReplay) {
    replayBtn.addEventListener("click", onReplay);
  }
  if (liveBtn && onLive) {
    liveBtn.addEventListener("click", onLive);
  }

  // ---- keyboard movement ----
  window.addEventListener("keydown", (e) => {
    let dx = 0;
    let dy = 0;

    switch (e.key) {
      case "ArrowUp":
      case "w":
      case "W":
        dy = -1;
        break;
      case "ArrowDown":
      case "s":
      case "S":
        dy = 1;
        break;
      case "ArrowLeft":
      case "a":
      case "A":
        dx = -1;
        break;
      case "ArrowRight":
      case "d":
      case "D":
        dx = 1;
        break;
      default:
        return;
    }

    e.preventDefault();
    if (onMove) onMove(dx, dy);
  });

  // ---- touch D-pad for mobile ----
  if (touchContainer && onMove) {
    touchContainer.className = "touch-dpad";

    const makeBtn = (label, dx, dy) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "touch-arrow";
      btn.textContent = label;

      const fire = (evt) => {
        evt.preventDefault();
        onMove(dx, dy);
      };

      btn.addEventListener("click", fire);
      btn.addEventListener("touchstart", fire, { passive: false });

      return btn;
    };

    const grid = document.createElement("div");
    grid.className = "touch-grid";

    // 3x3 grid:
    // [ ][↑][ ]
    // [←][ ][→]
    // [ ][↓][ ]
    const slots = [
      null,
      makeBtn("↑", 0, -1),
      null,
      makeBtn("←", -1, 0),
      null,
      makeBtn("→", 1, 0),
      null,
      makeBtn("↓", 0, 1),
      null,
    ];

    slots.forEach((btn) => {
      const cell = document.createElement("div");
      cell.className = "touch-cell";
      if (btn) cell.appendChild(btn);
      grid.appendChild(cell);
    });

    touchContainer.appendChild(grid);
  }
}
