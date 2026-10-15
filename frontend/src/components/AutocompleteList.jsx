import { useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { floatingListPosition } from "../utils/floatingListPosition.js";

export default function AutocompleteList({ inputRef, children }) {
  const [position, setPosition] = useState(null);

  useLayoutEffect(() => {
    function measure() {
      const rect = inputRef.current.getBoundingClientRect();
      const viewport = window.visualViewport;
      setPosition(floatingListPosition(rect, {
        top: viewport?.offsetTop || 0,
        left: viewport?.offsetLeft || 0,
        width: viewport?.width || document.documentElement.clientWidth,
        height: viewport?.height || window.innerHeight,
        layoutHeight: window.innerHeight,
      }));
    }
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    window.visualViewport?.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("scroll", measure);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
      window.visualViewport?.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("scroll", measure);
    };
  }, [inputRef]);

  return position && createPortal(
    <ul
      className="autocomplete-list autocomplete-list-floating"
      role="listbox"
      style={position}
      onPointerDown={(event) => event.preventDefault()}
    >
      {children}
    </ul>,
    document.body
  );
}
