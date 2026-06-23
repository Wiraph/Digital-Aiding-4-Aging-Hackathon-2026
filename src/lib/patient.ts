import type { AssessmentSession, PatientProfile, TrialResult } from "../types";

export function formatMs(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0.0s";
  return `${(value / 1000).toFixed(1)}s`;
}

export function riskClass(label: string) {
  if (label === "Good") return "score-tile--good";
  if (label === "Moderate") return "score-tile--moderate";
  return "score-tile--practice";
}

export function riskLabelTh(label: string) {
  if (label === "Good") return "ดี";
  if (label === "Moderate") return "ควรติดตาม";
  return "ควรฝึกเพิ่มเติม";
}

export function thaiSideLabel(side: string) {
  if (side === "left") return "มือซ้าย";
  if (side === "right") return "มือขวา";
  if (side === "both") return "สองมือ";
  return "ใช้มือใดก็ได้";
}

export function sexLabelTh(sex: string) {
  if (sex === "female") return "หญิง";
  if (sex === "male") return "ชาย";
  if (sex === "other") return "อื่น ๆ";
  return "ไม่ระบุ";
}

export function sourceLabelTh(source: string) {
  return source === "camera" ? "กล้องจริง" : "สัญญาณสาธิต";
}

export function normalizePatientId(value: string) {
  return value.trim() || "ไม่ระบุรหัส";
}

export function normalizePatientProfile(profile: PatientProfile) {
  return {
    ...profile,
    id: profile.id.trim() || "P-0001",
    name: profile.name.trim(),
  };
}

export function sessionTime(session: AssessmentSession) {
  const time = new Date(session.createdAt).getTime();
  return Number.isFinite(time) ? time : 0;
}

export function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value));
}

export function compactDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "short",
  }).format(new Date(value));
}

export function compactDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
  }).format(new Date(value));
}

export function timelineStatusTag(label: AssessmentSession["metrics"]["riskLabel"]) {
  if (label === "Good") return { label: "Stable", tone: "stable" };
  if (label === "Moderate") return { label: "Monitor", tone: "monitor" };
  return { label: "Practice", tone: "practice" };
}

export function trialComposite(trial: TrialResult) {
  if (!trial.completed) return 0;
  return clampPercent(trial.speedScore * 0.28 + trial.accuracyScore * 0.32 + trial.qualityScore * 0.3 + 10);
}
