import { useEffect, useRef, useState } from "react";
import { moveCandidateToSlot } from "../utils/candidateOrder.js";

export function useRowReorder(containerRef, {
  rows, getRowKey, getRowLabel, onReorder,
  itemSelector = "tbody > tr",
  scopeKey,
}) {
  const [drag, setDrag] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const current = useRef(null);
  const busy = useRef(false);
  const restoreFocus = useRef(null);
  const dragging = Boolean(drag);
  const scope = useRef(scopeKey);

  function itemElements() {
    return [...containerRef.current.querySelectorAll(itemSelector)].slice(0, rows.length);
  }

  function publish(next) {
    current.current = next;
    setDrag(next?.active ? next : null);
  }

  function begin(index, handle, mode, point) {
    if (busy.current || current.current || rows.length < 2) return;
    const row = itemElements()[index];
    const rect = row.getBoundingClientRect();
    const order = rows.map(getRowKey);
    const label = getRowLabel(rows[index]);
    publish({
      index, label, order, row, handle, mode,
      active: mode === "keyboard",
      slot: index,
      valid: true,
      startX: point.x,
      startY: point.y,
      x: point.x,
      y: point.y,
      left: rect.left,
      width: rect.width,
      offsetY: point.y - rect.top,
      pointerId: point.pointerId,
    });
    if (mode === "keyboard") setAnnouncement(`${label} sélectionné. Utilisez les flèches pour déplacer la ligne.`);
  }

  function updatePointer(x, y) {
    const previous = current.current;
    if (!previous || previous.mode !== "pointer") return;
    const active = previous.active || Math.hypot(x - previous.startX, y - previous.startY) >= 5;
    const elements = itemElements();
    const rects = elements.map((row) => row.getBoundingClientRect());
    const slot = rects.filter((rect) => y > rect.top + rect.height / 2).length;
    const tableRect = containerRef.current.getBoundingClientRect();
    const valid = x >= tableRect.left - 20 && x <= tableRect.right + 20
      && y >= rects[0].top - 20 && y <= rects.at(-1).bottom + 20;
    publish({ ...previous, active, slot, valid, x, y, lineTop: rects[slot]?.top ?? rects.at(-1).bottom });
  }

  function cancel() {
    const previous = current.current;
    publish(null);
    if (previous?.active) setAnnouncement("Déplacement annulé.");
  }

  async function finish() {
    const previous = current.current;
    publish(null);
    if (!previous?.active || !previous.valid) {
      if (previous?.active) setAnnouncement("Déplacement annulé.");
      return;
    }
    const order = moveCandidateToSlot(previous.order, previous.index, previous.slot);
    if (order.every((id, index) => id === previous.order[index])) {
      setAnnouncement("Ordre inchangé.");
      return;
    }
    busy.current = true;
    restoreFocus.current = previous.handle;
    setSaving(true);
    try {
      await onReorder(order);
      setError("");
      setAnnouncement(`${previous.label} déplacé en position ${order.indexOf(previous.order[previous.index]) + 1}.`);
    } catch (reason) {
      setError(reason.message);
      setAnnouncement("Le déplacement n'a pas pu être enregistré.");
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  useEffect(() => {
    if (!dragging) return undefined;
    function escape(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        cancel();
      }
    }
    window.addEventListener("keydown", escape);
    window.addEventListener("blur", cancel);
    const root = document.documentElement;
    const previousCursor = root.style.cursor;
    const previousSelection = root.style.userSelect;
    root.style.cursor = "grabbing";
    root.style.userSelect = "none";
    let scrollContainer = containerRef.current;
    while (scrollContainer && scrollContainer !== document.body) {
      if (/(auto|scroll)/.test(getComputedStyle(scrollContainer).overflowY)
        && scrollContainer.scrollHeight > scrollContainer.clientHeight) break;
      scrollContainer = scrollContainer.parentElement;
    }
    if (scrollContainer === document.body) scrollContainer = null;
    let frame;
    function scroll() {
      const pending = current.current;
      if (pending?.mode === "pointer" && pending.active) {
        const margin = 60;
        const bounds = scrollContainer?.getBoundingClientRect();
        const top = bounds ? Math.max(0, bounds.top) : 0;
        const bottom = bounds ? Math.min(window.innerHeight, bounds.bottom) : window.innerHeight;
        const delta = pending.y < top + margin ? -10 : pending.y > bottom - margin ? 10 : 0;
        if (delta) {
          if (scrollContainer) scrollContainer.scrollBy(0, delta);
          else window.scrollBy(0, delta);
          updatePointer(pending.x, pending.y);
        }
      }
      frame = requestAnimationFrame(scroll);
    }
    frame = requestAnimationFrame(scroll);
    return () => {
      window.removeEventListener("keydown", escape);
      window.removeEventListener("blur", cancel);
      cancelAnimationFrame(frame);
      root.style.cursor = previousCursor;
      root.style.userSelect = previousSelection;
    };
  }, [dragging]);

  useEffect(() => {
    if (!saving && restoreFocus.current) {
      if (restoreFocus.current.isConnected) restoreFocus.current.focus({ preventScroll: true });
      restoreFocus.current = null;
    }
  });

  useEffect(() => {
    const pending = current.current;
    if (scope.current !== scopeKey) {
      scope.current = scopeKey;
      cancel();
    } else if (pending && (rows.length !== pending.order.length
      || rows.some((row, index) => getRowKey(row) !== pending.order[index]))) cancel();
  }, [rows, getRowKey, scopeKey]);

  function handleKeyDown(event, index) {
    const pending = current.current;
    if (event.key === "Escape") {
      cancel();
      return;
    }
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      if (pending?.mode === "keyboard") finish();
      else {
        const rect = event.currentTarget.getBoundingClientRect();
        begin(index, event.currentTarget, "keyboard", { x: rect.left, y: rect.top });
      }
    } else if (pending?.mode === "keyboard" && ["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const position = pending.slot > pending.index ? pending.slot - 1 : pending.slot;
      const target = event.key === "Home" ? 0 : event.key === "End" ? rows.length - 1
        : Math.max(0, Math.min(rows.length - 1, position + (event.key === "ArrowDown" ? 1 : -1)));
      const slot = target > pending.index ? target + 1 : target;
      const elements = itemElements();
      elements[target].scrollIntoView({ block: "nearest" });
      const lineTop = slot < rows.length
        ? elements[slot].getBoundingClientRect().top
        : elements[rows.length - 1].getBoundingClientRect().bottom;
      publish({ ...pending, slot, lineTop });
      setAnnouncement(`${pending.label}, position ${target + 1} sur ${rows.length}.`);
    }
  }

  function handleProps(index) {
    return {
      disabled: saving || rows.length < 2,
      "aria-pressed": drag?.index === index,
      onKeyDown: (event) => handleKeyDown(event, index),
      onBlur: () => {
        if (current.current?.mode === "keyboard") cancel();
      },
      onPointerDown: (event) => {
        if (!event.isPrimary || event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.focus();
        begin(index, event.currentTarget, "pointer", {
          x: event.clientX, y: event.clientY, pointerId: event.pointerId,
        });
        if (current.current?.pointerId === event.pointerId) event.currentTarget.setPointerCapture(event.pointerId);
      },
      onPointerMove: (event) => {
        if (current.current?.mode !== "pointer" || current.current.pointerId !== event.pointerId) return;
        event.preventDefault();
        updatePointer(event.clientX, event.clientY);
      },
      onPointerUp: (event) => {
        if (current.current?.mode !== "pointer" || current.current.pointerId !== event.pointerId) return;
        updatePointer(event.clientX, event.clientY);
        finish();
      },
      onPointerCancel: (event) => {
        if (current.current?.pointerId === event.pointerId) cancel();
      },
      onLostPointerCapture: (event) => {
        if (current.current?.mode === "pointer" && current.current.pointerId === event.pointerId) cancel();
      },
    };
  }

  return { drag, saving, error, announcement, handleProps };
}
