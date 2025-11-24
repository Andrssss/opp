// public/controls.js

// Make initControls global so main.js can call it
window.initControls = function ({ onJoin, onReplay, onLive, onMove }) {
  const joinBtn = document.getElementById("joinBtn");
  const replayBtn = document.getElementById("replayBtn");
  const liveBtn = document.getElementById("liveBtn");

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
    if (!onMove) return;

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
    onMove(dx, dy);
  });

  // ---- touch / click D-pad movement ----
  const arrowButtons = document.querySelectorAll(".touch-arrow");
  arrowButtons.forEach((btn) => {
    const dx = parseInt(btn.dataset.dx, 10) || 0;
    const dy = parseInt(btn.dataset.dy, 10) || 0;

    const fire = (evt) => {
      evt.preventDefault();
      if (onMove) onMove(dx, dy);
    };

    btn.addEventListener("click", fire);
    btn.addEventListener("touchstart", fire, { passive: false });
  });
};
