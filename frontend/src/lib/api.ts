const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export const api = {
  // Config
  getCircuits: () => fetchApi<any[]>("/api/config/circuits"),
  createCircuit: (data: any) =>
    fetchApi<any>("/api/config/circuits", { method: "POST", body: JSON.stringify(data) }),

  getRaceParams: () => fetchApi<any[]>("/api/config/race-params"),
  createRaceParams: (data: any) =>
    fetchApi<any>("/api/config/race-params", { method: "POST", body: JSON.stringify(data) }),
  updateRaceParams: (id: number, data: any) =>
    fetchApi<any>(`/api/config/race-params/${id}`, { method: "PATCH", body: JSON.stringify(data) }),

  getTeams: (raceParamsId: number) => fetchApi<any[]>(`/api/config/teams/${raceParamsId}`),
  replaceTeams: (raceParamsId: number, teams: any[]) =>
    fetchApi<any[]>(`/api/config/teams/${raceParamsId}`, { method: "PUT", body: JSON.stringify(teams) }),

  // Race
  getSnapshot: () => fetchApi<any>("/api/race/snapshot"),
  getClassification: () => fetchApi<any[]>("/api/race/classification"),
  getFifo: () => fetchApi<any>("/api/race/fifo"),

  // Replay
  getReplayLogs: () => fetchApi<{ logs: string[] }>("/api/replay/logs"),
  getReplayStatus: () => fetchApi<any>("/api/replay/status"),
  startReplay: (filename: string, speed: number = 1) =>
    fetchApi<any>("/api/replay/start", { method: "POST", body: JSON.stringify({ filename, speed }) }),
  stopReplay: () => fetchApi<any>("/api/replay/stop", { method: "POST" }),
  pauseReplay: () => fetchApi<any>("/api/replay/pause", { method: "POST" }),
  setReplaySpeed: (speed: number) =>
    fetchApi<any>("/api/replay/speed", { method: "POST", body: JSON.stringify({ speed }) }),
};
