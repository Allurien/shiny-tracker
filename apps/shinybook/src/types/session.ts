// A single painting work session — the timer feature.
// Sum of durations across a painting's sessions = hoursWorked.

export interface Session {
  id: string;
  paintingId: string;
  startedAt: string;       // ISO timestamp
  endedAt: string | null;  // null = currently active session
  durationSeconds: number; // 0 while active; computed when ended
  notes?: string;
}
