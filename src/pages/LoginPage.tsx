import { useState, type FormEvent } from "react";
import { LogIn, UserCheck, UserPlus } from "lucide-react";
import { PageWrapper } from "../components/PageWrapper";
import { ui } from "../app/ui";
import type { AssessmentSession } from "../types";

export function LoginPage({
  sessions,
  onLogin,
}: {
  sessions: AssessmentSession[];
  onLogin: (patientId: string) => void;
}) {
  const [patientId, setPatientId] = useState("");

  const trimmedId = patientId.trim();
  const isReturning =
    trimmedId.length > 0 &&
    sessions.some(
      (s) => s.patientId.trim().toLowerCase() === trimmedId.toLowerCase(),
    );
  const isNew = trimmedId.length > 0 && !isReturning;
  const canSubmit = trimmedId.length > 0;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (canSubmit) onLogin(trimmedId);
  }

  return (
    <PageWrapper key="login">
      <section className="grid min-h-[calc(100vh-81px)] w-full place-items-center p-[clamp(28px,4vw,58px)]">
        <form
          className="marble-card unveil-card w-[min(520px,100%)] p-[clamp(24px,3vw,38px)]"
          onSubmit={handleSubmit}
        >
          <div className={ui.sectionTitle}>
            <LogIn size={28} />
            <div>
              <p className={ui.eyebrow}>ยืนยันตัวตน · Patient Login</p>
              <h2 className={ui.title}>
                เข้าสู่ระบบ
                <span className="en-sub">Enter your Patient ID to continue</span>
              </h2>
            </div>
          </div>

          <div className="premium-form mb-5">
            <label>
              รหัสผู้รับการทดสอบ{" "}
              <span className="en-sub" style={{ display: "inline", fontSize: "0.82em" }}>
                Patient ID
              </span>
              <input
                autoFocus
                onChange={(e) => setPatientId(e.target.value)}
                placeholder="เช่น P-0001"
                value={patientId}
              />
            </label>
          </div>

          {isReturning ? (
            <div
              role="status"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                margin: "0 0 1.25rem",
                padding: "0.65rem 1rem",
                borderRadius: "var(--radius-md)",
                background: "oklch(0.93 0.06 154 / 0.22)",
                color: "oklch(0.28 0.12 154)",
                fontSize: "0.875rem",
                fontWeight: 600,
              }}
            >
              <UserCheck size={17} style={{ flexShrink: 0 }} />
              พบประวัติผู้รับการทดสอบ · Returning patient
            </div>
          ) : null}

          {isNew ? (
            <div
              role="status"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                margin: "0 0 1.25rem",
                padding: "0.65rem 1rem",
                borderRadius: "var(--radius-md)",
                background: "oklch(0.90 0.07 72 / 0.18)",
                color: "var(--clinical-blue)",
                fontSize: "0.875rem",
                fontWeight: 600,
              }}
            >
              <UserPlus size={17} style={{ flexShrink: 0 }} />
              ผู้รับการทดสอบใหม่ · New patient — กรอกข้อมูลในขั้นตอนถัดไป
            </div>
          ) : null}

          <div className={ui.row}>
            <button
              className={ui.primaryButton}
              disabled={!canSubmit}
              style={!canSubmit ? { opacity: 0.45, cursor: "not-allowed" } : {}}
              type="submit"
            >
              <LogIn size={21} />
              เข้าสู่ระบบ · Continue
            </button>
          </div>
        </form>
      </section>
    </PageWrapper>
  );
}
