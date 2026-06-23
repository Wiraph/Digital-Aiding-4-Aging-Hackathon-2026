import type { ConsentState } from "../types";

export type Role = "patient" | "doctor";
export type PatientStage = "login" | "profile" | "calibration" | "assessment" | "results";

export const PROMPT_COUNT = 60;

export const defaultConsent: ConsentState = {
  camera: true,
  localData: true,
  rawVideo: false,
};

export const ui = {
  appShell: "golden-shell",
  topbar: "golden-topbar",
  brandLockup: "brand-lockup",
  brandMark: "brand-mark",
  eyebrow: "section-kicker",
  title: "lux-title",
  nav: "golden-nav",
  navButton: "golden-nav-button",
  navActive: "is-active",
  primaryButton: "lux-button lux-button--primary",
  secondaryButton: "lux-button lux-button--secondary",
  dangerButton: "lux-button lux-button--danger",
  row: "ui-row",
  column: "ui-column",
  sectionTitle: "section-title",
};

export const examButton = "exam-button";
