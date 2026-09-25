import { useEffect } from "react";

/** Navigation clavier façon tableur (flèches + Entrée) pour les tableaux éditables. */
export function useGridNavigation(containerRef, { onEnterLastRow } = {}) {
  useEffect(() => {
    const table = containerRef.current;
    if (!table) return undefined;

    function getRows() {
      return Array.from(table.querySelectorAll("tbody tr")).map((tr) =>
        Array.from(tr.querySelectorAll("input.grid-input"))
      );
    }

    function handleKeyDown(e) {
      const target = e.target;
      if (!target.classList || !target.classList.contains("grid-input")) return;

      const rows = getRows();
      let ri = -1;
      let ci = -1;
      for (let r = 0; r < rows.length; r++) {
        const c = rows[r].indexOf(target);
        if (c !== -1) {
          ri = r;
          ci = c;
          break;
        }
      }
      if (ri === -1) return;

      const key = e.key;
      if (key === "ArrowDown" || (key === "Enter" && !e.shiftKey)) {
        e.preventDefault();
        const nextRow = rows[ri + 1];
        if (nextRow && nextRow[ci]) {
          nextRow[ci].focus();
          nextRow[ci].select();
        } else if (key === "Enter" && onEnterLastRow) {
          onEnterLastRow(target, ri, ci);
        }
      } else if (key === "ArrowUp") {
        e.preventDefault();
        const prevRow = rows[ri - 1];
        if (prevRow && prevRow[ci]) {
          prevRow[ci].focus();
          prevRow[ci].select();
        }
      } else if (key === "ArrowRight" && target.selectionStart === target.value.length) {
        if (rows[ri][ci + 1]) {
          e.preventDefault();
          rows[ri][ci + 1].focus();
          rows[ri][ci + 1].select();
        }
      } else if (key === "ArrowLeft" && target.selectionStart === 0) {
        if (rows[ri][ci - 1]) {
          e.preventDefault();
          rows[ri][ci - 1].focus();
          rows[ri][ci - 1].select();
        }
      } else if (key === "Escape") {
        target.blur();
      }
    }

    function handleFocusIn(e) {
      if (e.target.classList && e.target.classList.contains("grid-input")) e.target.select();
    }

    table.addEventListener("keydown", handleKeyDown);
    table.addEventListener("focusin", handleFocusIn);
    return () => {
      table.removeEventListener("keydown", handleKeyDown);
      table.removeEventListener("focusin", handleFocusIn);
    };
  });
}
