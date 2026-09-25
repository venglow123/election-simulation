// Debounce par clé (ex: "candidate:3:pct_r1") pour ne pas annuler la sauvegarde d'un autre champ en cours de frappe.
const timers = new Map();

export function debounceByKey(key, fn, delay) {
  const existing = timers.get(key);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(() => {
    timers.delete(key);
    fn();
  }, delay);
  timers.set(key, timer);
}
