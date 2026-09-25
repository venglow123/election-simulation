export default function WarningsPanel({ warnings }) {
  if (!warnings || warnings.length === 0) return null;
  return (
    <section className="panel warnings">
      <ul>
        {warnings.map((warning, index) => (
          <li key={index}>⚠️ {warning}</li>
        ))}
      </ul>
    </section>
  );
}
