import type { AssessmentSession, PatientProfile } from "../types";

const PROFILE_KEY = "vibeCoach.patientProfile";
const SESSIONS_KEY = "vibeCoach.sessions";
const MAX_SESSIONS_PER_PATIENT = 12;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isSession(value: unknown): value is AssessmentSession {
  if (!isRecord(value)) return false;
  if (typeof value.id !== "string" || typeof value.createdAt !== "string") return false;
  if (typeof value.patientId !== "string" || typeof value.promptsTotal !== "number") return false;
  if (!Array.isArray(value.trials) || !isRecord(value.metrics)) return false;
  return true;
}

function normalizePatientId(value: string) {
  return value.trim() || "unknown";
}

export const defaultProfile: PatientProfile = {
  id: "",
  name: "",
  age: 0,
  sex: "prefer-not",
  chronicDiseases: "",
  preferredArm: "unknown",
};

export function loadProfile(): PatientProfile {
  const raw = localStorage.getItem(PROFILE_KEY);
  if (!raw) return defaultProfile;
  try {
    return { ...defaultProfile, ...JSON.parse(raw) } as PatientProfile;
  } catch {
    return defaultProfile;
  }
}

export function saveProfile(profile: PatientProfile) {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

export function loadSessions(): AssessmentSession[] {
  const raw = localStorage.getItem(SESSIONS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isSession).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  } catch {
    return [];
  }
}

export function saveSession(session: AssessmentSession) {
  const counts = new Map<string, number>();
  const merged = [session, ...loadSessions().filter((item) => item.id !== session.id)];
  const next = merged.filter((item) => {
    const patientId = normalizePatientId(item.patientId);
    const count = counts.get(patientId) ?? 0;
    if (count >= MAX_SESSIONS_PER_PATIENT) return false;
    counts.set(patientId, count + 1);
    return true;
  });
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(next));
}

export function deleteSession(sessionId: string) {
  const next = loadSessions().filter((session) => session.id !== sessionId);
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(next));
}

export function exportSessionJson(session: AssessmentSession) {
  const blob = new Blob([JSON.stringify(session, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${session.id.toLowerCase()}-report.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
