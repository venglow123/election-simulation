import { Link } from "react-router-dom";

export default function Breadcrumbs({ items, label = "Fil d’Ariane" }) {
  return (
    <nav className="breadcrumbs" aria-label={label}>
      <ol>
        {items.map((item, index) => {
          const isCurrent = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`}>
              {index > 0 && <span className="breadcrumbs-separator" aria-hidden="true">›</span>}
              {item.onClick && !isCurrent ? (
                <button type="button" className="breadcrumbs-link-button" onClick={item.onClick}>
                  {item.label}
                </button>
              ) : item.to && !isCurrent ? (
                <Link to={item.to}>{item.label}</Link>
              ) : (
                <span aria-current={isCurrent ? "page" : undefined}>{item.label}</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}