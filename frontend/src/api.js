const BASE = "/api";

async function request(method, url, body) {
  const res = await fetch(BASE + url, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${method} ${url} a échoué (${res.status}) ${text}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  listSimulations: () => request("GET", "/simulations"),
  getSimulation: (id) => request("GET", `/simulations/${id}`),
  createSimulation: (name) => request("POST", "/simulations", { name }),
  importSimulation: (payload) => request("POST", "/simulations/import", { payload }),
  reorderSimulations: (order) => request("POST", "/simulations/reorder", { order }),
  updateSimulation: (id, payload) => request("PATCH", `/simulations/${id}`, payload),
  duplicateSimulation: (id) => request("POST", `/simulations/${id}/duplicate`),
  deleteSimulation: (id) => request("DELETE", `/simulations/${id}`),
  addCandidate: (id, payload) => request("POST", `/simulations/${id}/candidates`, payload),
  updateCandidate: (id, candidateId, payload) =>
    request("PATCH", `/simulations/${id}/candidates/${candidateId}`, payload),
  deleteCandidate: (id, candidateId) => request("DELETE", `/simulations/${id}/candidates/${candidateId}`),
  updateTransfer: (id, candidateId, payload) =>
    request("PATCH", `/simulations/${id}/transfers/${candidateId}`, payload),
  updateAbstentionTransfer: (id, payload) => request("PATCH", `/simulations/${id}/abstention-transfer`, payload),
};
