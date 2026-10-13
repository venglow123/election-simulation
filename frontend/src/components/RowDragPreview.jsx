import { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";

export default function RowDragPreview({ drag }) {
  const previewRef = useRef(null);
  useLayoutEffect(() => {
    if (drag.mode !== "pointer") return undefined;
    const clone = drag.row.cloneNode(true);
    clone.classList.remove("row-drag-source");
    let content = clone;
    if (drag.row.tagName === "TR") {
      const table = document.createElement("table");
      table.className = drag.row.closest("table").className;
      [...clone.cells].forEach((cell, index) => {
        cell.style.width = `${drag.row.cells[index].getBoundingClientRect().width}px`;
      });
      table.createTBody().append(clone);
      content = table;
    }
    clone.querySelectorAll("[id]").forEach((element) => element.removeAttribute("id"));
    previewRef.current.replaceChildren(content);
    return () => content.remove();
  }, [drag.row, drag.mode]);

  const showLine = drag.valid && drag.lineTop != null && drag.slot !== drag.index && drag.slot !== drag.index + 1;
  return createPortal(
    <>
      {drag.mode === "pointer" && (
        <div
          ref={previewRef}
          className={`row-drag-preview ${drag.row.classList.contains("sim-tab") ? "sidebar-drag-preview" : ""} ${drag.valid ? "" : "row-drag-outside"}`}
          aria-hidden="true"
          inert=""
          style={{
            width: drag.width,
            left: drag.left + drag.x - drag.startX,
            top: drag.y - drag.offsetY,
          }}
        />
      )}
      {showLine && (
        <div className="row-insertion-line" aria-hidden="true"
          style={{ left: drag.row.getBoundingClientRect().left, top: drag.lineTop, width: drag.width }} />
      )}
    </>,
    document.body
  );
}
