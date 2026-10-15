import { useEffect, useId, useRef, useState } from "react";

export default function TableScroll({ children, label = "Tableau", hidden = false }) {
  const containerRef = useRef(null);
  const hintId = useId();
  const [overflows, setOverflows] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    const observer = new ResizeObserver(() => {
      setOverflows(container.scrollWidth > container.clientWidth + 1);
    });
    observer.observe(container);
    observer.observe(container.firstElementChild);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <div
        ref={containerRef}
        className="table-scroll"
        role="region"
        aria-label={label}
        aria-describedby={overflows ? hintId : undefined}
        tabIndex={overflows ? 0 : undefined}
        hidden={hidden}
      >
        {children}
      </div>
      {!hidden && overflows && (
        <p id={hintId} className="table-scroll-hint">Faites défiler le tableau horizontalement pour voir toutes les colonnes.</p>
      )}
    </>
  );
}
