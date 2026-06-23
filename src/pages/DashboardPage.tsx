import { type CSSProperties, type ReactNode, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Brain,
  CheckCircle2,
  ClipboardList,
  Download,
  Loader2,
  Play,
  RefreshCw,
  Sparkles,
  TrendingUp,
  Trash2,
  WifiOff,
} from "lucide-react";
import { askNotebookLM, type NlmResult } from "../lib/notebooklm";
import { AnimatedBentoCard } from "../components/motion/AnimatedBentoCard";
import { AnimatedBentoContainer } from "../components/motion/AnimatedBentoContainer";
import { ZONES } from "../lib/assessment";
import {
  clampPercent,
  compactDate,
  compactDateTime,
  normalizePatientId,
  riskLabelTh,
  sexLabelTh,
  sourceLabelTh,
  timelineStatusTag,
  trialComposite,
} from "../lib/patient";
import { exportSessionJson } from "../lib/storage";
import { ui } from "../app/ui";
import type { AssessmentSession, PatientProfile, TrialResult } from "../types";

function dominanceStats(metrics: AssessmentSession["metrics"]) {
  const usageDelta = metrics.rightUsagePercent - metrics.leftUsagePercent;
  const scoreDelta = metrics.right.composite - metrics.left.composite;
  const speedDelta = metrics.right.speed - metrics.left.speed;
  const accuracyDelta = metrics.right.accuracy - metrics.left.accuracy;
  const dominanceIndex =
    usageDelta * 0.45 + scoreDelta * 0.25 + speedDelta * 0.2 + accuracyDelta * 0.1;
  const dominantArm =
    Math.abs(dominanceIndex) < 6 ? "ใกล้เคียงกัน" : dominanceIndex > 0 ? "แขนขวาเด่นกว่า" : "แขนซ้ายเด่นกว่า";
  const weakerArm =
    metrics.left.composite < metrics.right.composite ? "แขนซ้าย" : "แขนขวา";

  return {
    dominanceIndex,
    dominantArm,
    weakerArm,
  };
}

function progressSeries(sessions: AssessmentSession[], activeSession: AssessmentSession) {
  const targetPatientId = normalizePatientId(activeSession.patientId);
  const patientSessions = sessions
    .filter((session) => normalizePatientId(session.patientId) === targetPatientId)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  if (patientSessions.length >= 3) {
    const recent = patientSessions.slice(-6);
    const labels = recent.map((session) => compactDate(session.createdAt));
    const hasDuplicateDates = new Set(labels).size < labels.length;
    return recent.map((session, index) => ({
      label: hasDuplicateDates ? `Visit ${index + 1}` : labels[index],
      value: Math.round(session.metrics.overallScore),
    }));
  }

  const completed = activeSession.trials.filter((trial) => trial.completed);
  if (completed.length === 0) {
    return [{ label: "Current", value: Math.round(activeSession.metrics.overallScore) }];
  }

  const blockCount = Math.min(6, Math.max(3, Math.ceil(completed.length / 8)));
  const blockSize = Math.ceil(completed.length / blockCount);
  return Array.from({ length: blockCount }, (_, index) => {
    const block = completed.slice(index * blockSize, (index + 1) * blockSize);
    const value =
      block.reduce((sum: number, trial: TrialResult) => sum + trialComposite(trial), 0) /
      Math.max(1, block.length);
    return {
      label: `Block ${index + 1}`,
      value: Math.round(value),
    };
  });
}

// Fritsch-Carlson monotone cubic interpolation.
// The line passes through every data point and never overshoots between them —
// critical for clinical charts where implied values must reflect real readings.
function monotonePath(points: Array<{ x: number; y: number }>): string {
  const n = points.length;
  if (n === 0) return "";
  if (n === 1) return `M ${points[0].x} ${points[0].y}`;
  if (n === 2) return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;

  const dx = Array.from({ length: n - 1 }, (_, i) => points[i + 1].x - points[i].x);
  const dy = Array.from({ length: n - 1 }, (_, i) => points[i + 1].y - points[i].y);
  const slopes = dx.map((d, i) => (d === 0 ? 0 : dy[i] / d));

  const tangents = Array.from({ length: n }, (_, i): number => {
    if (i === 0) return slopes[0];
    if (i === n - 1) return slopes[n - 2];
    if (slopes[i - 1] * slopes[i] <= 0) return 0;
    const h0 = dx[i - 1];
    const h1 = dx[i];
    return (3 * (h0 + h1)) / ((2 * h1 + h0) / slopes[i - 1] + (h1 + 2 * h0) / slopes[i]);
  });

  return points.slice(1).reduce((path, pt, i) => {
    const p0 = points[i];
    const h = pt.x - p0.x;
    const cp1x = (p0.x + h / 3).toFixed(1);
    const cp1y = (p0.y + (tangents[i] * h) / 3).toFixed(1);
    const cp2x = (pt.x - h / 3).toFixed(1);
    const cp2y = (pt.y - (tangents[i + 1] * h) / 3).toFixed(1);
    return `${path} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${pt.x} ${pt.y}`;
  }, `M ${points[0].x} ${points[0].y}`);
}

function MicroMetricCard({
  label,
  value,
  detail,
  icon,
  tone,
}: {
  label: string;
  value: string | number;
  detail: string;
  icon: ReactNode;
  tone: "score" | "risk" | "completion";
}) {
  return (
    <AnimatedBentoCard className={`micro-card micro-card--${tone}`}>
      <div className="micro-card__icon">{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </AnimatedBentoCard>
  );
}

function ProgressTimeline({
  sessions,
  activeSessionId,
  onSelect,
}: {
  sessions: AssessmentSession[];
  activeSessionId: string;
  onSelect: (sessionId: string) => void;
}) {
  const chronological = [...sessions].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  const previousScore = new Map<string, number>();
  chronological.forEach((session, index) => {
    previousScore.set(session.id, chronological[index - 1]?.metrics.overallScore ?? session.metrics.overallScore);
  });
  const ordered = [...chronological].reverse();

  return (
    <section className="progress-timeline" aria-label="Progress timeline">
      <div className="timeline-head">
        <p>Progress Timeline</p>
        <h2>Session History</h2>
        <span>{ordered.length} clinical records</span>
      </div>
      <div className="timeline-list">
        {ordered.length === 0 ? (
          <p className="timeline-empty">ยังไม่มีผลทดสอบสำหรับรหัสนี้</p>
        ) : null}
        {ordered.map((session) => {
          const delta = session.metrics.overallScore - (previousScore.get(session.id) ?? session.metrics.overallScore);
          const isImproving = delta >= 0;
          const status = timelineStatusTag(session.metrics.riskLabel);
          const score = Math.round(session.metrics.overallScore);
          const dateTime = compactDateTime(session.createdAt);
          return (
            <button
              aria-label={`${dateTime} ${status.label} ${isImproving ? "up" : "down"} ${score}`}
              className={`timeline-item ${session.id === activeSessionId ? "is-active" : ""}`}
              key={session.id}
              onClick={() => onSelect(session.id)}
              type="button"
            >
              <span className="timeline-dot" />
              <span className="timeline-date">{dateTime}</span>
              <span className={`timeline-status timeline-status--${status.tone}`}>
                {status.label}
              </span>
              <span className={`timeline-score ${isImproving ? "is-up" : "is-down"}`}>
                {isImproving ? <ArrowUpRight size={15} /> : <ArrowDownRight size={15} />}
                {score}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function DashboardEmptyState({
  profile,
  patientId,
  onStartAssessment,
}: {
  profile: PatientProfile;
  patientId: string;
  onStartAssessment: () => void;
}) {
  const patientName = profile.name || "ผู้รับการทดสอบ";

  return (
    <section className="dashboard-main bento-dashboard-main">
      <div className="dashboard-empty">
        <div className="dashboard-empty__icon">
          <ClipboardList size={28} />
        </div>
        <div>
          <p className="bento-kicker">Physical Therapy Dashboard</p>
          <h2>ยังไม่มีผลทดสอบของ {patientName}</h2>
          <span className="dashboard-meta">ID {patientId} · โปรไฟล์นี้พร้อมเริ่มบันทึกผลใหม่</span>
        </div>
        <button className={ui.primaryButton} onClick={onStartAssessment} type="button">
          <Play size={19} />
          เริ่มทดสอบรหัสนี้
        </button>
      </div>
    </section>
  );
}

function ProgressChartBento({
  sessions,
  activeSession,
}: {
  sessions: AssessmentSession[];
  activeSession: AssessmentSession;
}) {
  const series = progressSeries(sessions, activeSession);
  const width = 680;
  const height = 280;
  const padding = { top: 22, right: 24, bottom: 46, left: 58 };
  const yAxisValues = [0, 25, 50, 75, 100];
  const chartHeight = height - padding.top - padding.bottom;
  const plotWidth = width - padding.left - padding.right;
  const points = series.map((item, index) => ({
    x: padding.left + (index / Math.max(1, series.length - 1)) * plotWidth,
    y: padding.top + ((100 - clampPercent(item.value)) / 100) * chartHeight,
  }));
  const linePath = monotonePath(points);
  const areaPath =
    points.length > 0
      ? `${linePath} L ${points[points.length - 1].x} ${height - padding.bottom} L ${points[0].x} ${height - padding.bottom} Z`
      : "";

  return (
    <AnimatedBentoCard className="progress-chart-bento">
      <div className="bento-card__heading">
        <div>
          <span>Patient Progress</span>
          <h3>Smooth Recovery Trajectory</h3>
        </div>
        <strong>{Math.round(activeSession.metrics.overallScore)}/100</strong>
      </div>
      <svg className="progress-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Patient progress line chart">
        <defs>
          <linearGradient id="progressArea" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="oklch(0.58 0.14 60 / 0.28)" />
            <stop offset="100%" stopColor="oklch(0.98 0.006 78 / 0)" />
          </linearGradient>
          <linearGradient id="progressStroke" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="oklch(0.44 0.17 52)" />
            <stop offset="100%" stopColor="oklch(0.72 0.14 72)" />
          </linearGradient>
        </defs>
        <line className="chart-axis-line" x1={padding.left} x2={padding.left} y1={padding.top} y2={height - padding.bottom} />
        {yAxisValues.map((value) => {
          const y = padding.top + ((100 - value) / 100) * chartHeight;
          return (
            <g key={value}>
              <line className="chart-gridline" x1={padding.left} x2={width - padding.right} y1={y} y2={y} />
              <text className="progress-axis-label" x={padding.left - 14} y={y + 4} textAnchor="end">
                {value}
              </text>
            </g>
          );
        })}
        <path className="progress-area" d={areaPath} />
        <path className="progress-line" d={linePath} />
        {points.map((point, index) => (
          <g key={`${series[index].label}-${index}`}>
            <circle className="progress-point" cx={point.x} cy={point.y} r="3.6" />
            <text className="progress-label" x={point.x} y={height - 18} textAnchor="middle">
              {series[index].label}
            </text>
          </g>
        ))}
      </svg>
    </AnimatedBentoCard>
  );
}

function DivergingPerformanceBento({ session }: { session: AssessmentSession }) {
  const rows = [
    { label: "Usage", left: session.metrics.leftUsagePercent, right: session.metrics.rightUsagePercent },
    { label: "Speed", left: session.metrics.left.speed, right: session.metrics.right.speed },
    { label: "Accuracy", left: session.metrics.left.accuracy, right: session.metrics.right.accuracy },
    { label: "Quality", left: session.metrics.left.quality, right: session.metrics.right.quality },
  ];

  return (
    <AnimatedBentoCard className="square-bento diverging-bento">
      <div className="bento-card__heading">
        <div>
          <span>Left vs Right</span>
          <h3>Diverging Arm Performance</h3>
        </div>
      </div>
      <div className="diverging-chart">
        <div className="diverging-labels" aria-hidden="true">
          <span>Left Arm</span>
          <span>Right Arm</span>
        </div>
        <div className="diverging-plot">
          <span className="diverging-center-axis" aria-hidden="true" />
          {rows.map((row) => (
            <div className="diverging-row" key={row.label}>
              <span className="diverging-row__label">{row.label}</span>
              <div className="diverging-track" aria-label={`${row.label}: left arm ${Math.round(row.left)}, right arm ${Math.round(row.right)}`}>
                <span className="diverging-bar diverging-bar--left" style={{ width: `${clampPercent(row.left) / 2}%` }} />
                <span className="diverging-bar diverging-bar--right" style={{ width: `${clampPercent(row.right) / 2}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </AnimatedBentoCard>
  );
}

type HeatmapArm = "left" | "both" | "right";

function MovementHeatmapBento({ session }: { session: AssessmentSession }) {
  const [arm, setArm] = useState<HeatmapArm>("both");

  const values = ZONES.map((zone) => {
    const left = session.metrics.heatmap.left[zone.id] ?? 0;
    const right = session.metrics.heatmap.right[zone.id] ?? 0;
    if (arm === "left") return left;
    if (arm === "right") return right;
    return left + right;
  });
  const max = Math.max(1, ...values);
  const total = values.reduce((sum, v) => sum + v, 0);

  const armOptions: { key: HeatmapArm; labelTh: string; labelEn: string }[] = [
    { key: "left", labelTh: "ซ้าย", labelEn: "L" },
    { key: "both", labelTh: "ทั้งคู่", labelEn: "Both" },
    { key: "right", labelTh: "ขวา", labelEn: "R" },
  ];

  return (
    <AnimatedBentoCard className="square-bento movement-heatmap-bento">
      <div className="bento-card__heading">
        <div>
          <span>Movement Distribution</span>
          <h3>Reach Density Heatmap</h3>
        </div>
        <div className="heatmap-arm-toggle" role="group" aria-label="แสดงข้อมูลแขน">
          {armOptions.map((option) => (
            <button
              aria-pressed={arm === option.key}
              className={`heatmap-arm-btn${arm === option.key ? " is-active" : ""}`}
              key={option.key}
              onClick={() => setArm(option.key)}
              type="button"
            >
              <span className="heatmap-arm-btn__th">{option.labelTh}</span>
              <span className="heatmap-arm-btn__en">{option.labelEn}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="movement-heatmap-grid">
        {ZONES.map((zone, index) => {
          const count = values[index];
          const intensity = count / max;
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          return (
            <span
              aria-label={`Zone ${zone.id}: ${count} ครั้ง, ${pct}%`}
              className="movement-heatmap-cell"
              key={zone.id}
              style={{ "--heat": intensity } as CSSProperties}
            >
              <span className="heatmap-cell-tip" aria-hidden="true">
                <span className="heatmap-cell-tip__count">{count}</span>
                <span className="heatmap-cell-tip__label">ครั้ง</span>
                <span className="heatmap-cell-tip__pct">{pct}%</span>
              </span>
            </span>
          );
        })}
      </div>
    </AnimatedBentoCard>
  );
}

type InsightState =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "success"; result: NlmResult }
  | { phase: "error"; message: string };

function AIClinicalInsightsBento({ session }: { session: AssessmentSession }) {
  const [state, setState] = useState<InsightState>({ phase: "idle" });
  const stats = dominanceStats(session.metrics);

  const fallbackInsights = [
    {
      icon: <CheckCircle2 size={18} />,
      text: `${stats.dominantArm} during free reach behavior; monitor ${stats.weakerArm} for avoidance patterns.`,
    },
    {
      icon: <Activity size={18} />,
      text: `${riskLabelTh(session.metrics.riskLabel)} Learned Non-Use signal with ${Math.round(session.metrics.asymmetry)} point side-to-side separation.`,
    },
    {
      icon: <Brain size={18} />,
      text:
        session.metrics.trackingQuality >= 85
          ? "High confidence tracking quality supports using this session as follow-up evidence."
          : session.metrics.trackingQuality >= 70
            ? "Tracking quality is usable — same-lighting retest recommended."
            : "Repeat session before making high-confidence clinical comparisons.",
    },
  ];

  async function generate() {
    setState({ phase: "loading" });
    try {
      const result = await askNotebookLM(session);
      setState({ phase: "success", result });
    } catch (err) {
      setState({ phase: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }

  return (
    <AnimatedBentoCard className="insight-bento">
      <div className="insight-title">
        <Sparkles size={20} />
        <div>
          <span>Clinical Insights</span>
          <h3>AI Summary for Follow-up</h3>
        </div>
        {state.phase === "success" && (
          <button
            aria-label="สร้างใหม่"
            className="insight-regen-btn"
            onClick={generate}
            title="สร้างใหม่"
            type="button"
          >
            <RefreshCw size={14} />
          </button>
        )}
      </div>

      {state.phase === "idle" && (
        <>
          <ul className="insight-list">
            {fallbackInsights.map((item) => (
              <li key={item.text}>
                <span>{item.icon}</span>
                <p>{item.text}</p>
              </li>
            ))}
          </ul>
          <button className="insight-generate-btn" onClick={generate} type="button">
            <Sparkles size={15} />
            วิเคราะห์ด้วย NotebookLM
            <span className="insight-generate-btn__sub">Generate AI Summary</span>
          </button>
        </>
      )}

      {state.phase === "loading" && (
        <div className="insight-loading">
          <Loader2 size={28} className="insight-spinner" />
          <p>กำลังประมวลผล…</p>
          <span>Analyzing session data</span>
        </div>
      )}

      {state.phase === "error" && (
        <div className="insight-error">
          <WifiOff size={24} />
          <p>{state.message}</p>
          <button className="insight-generate-btn" onClick={generate} type="button">
            <RefreshCw size={14} />
            ลองใหม่อีกครั้ง · Retry
          </button>
        </div>
      )}

      {state.phase === "success" && (
        <div className="insight-nlm-result">
          <div className="insight-section insight-section--solutions">
            <div className="insight-section__heading">
              <CheckCircle2 size={15} />
              แนวทางแก้ไข · Solutions
            </div>
            <ul className="insight-list">
              {state.result.solutions.map((text, i) => (
                <li key={i}>
                  <span><CheckCircle2 size={18} /></span>
                  <p>{text}</p>
                </li>
              ))}
            </ul>
          </div>
          <div className="insight-section insight-section--watchout">
            <div className="insight-section__heading">
              <AlertTriangle size={15} />
              สิ่งที่ต้องระวัง · Watch Out
            </div>
            <ul className="insight-list">
              {state.result.watchOut.map((text, i) => (
                <li key={i}>
                  <span className="insight-warn-icon"><AlertTriangle size={18} /></span>
                  <p>{text}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </AnimatedBentoCard>
  );
}

export function DashboardPage({
  activeSession,
  activeSessionId,
  currentPatientId,
  currentProfile,
  onRemoveSession,
  onSelectSession,
  onStartAssessment,
  patientSessions,
}: {
  activeSession: AssessmentSession | null;
  activeSessionId: string;
  currentPatientId: string;
  currentProfile: PatientProfile;
  onRemoveSession: (sessionId: string) => void;
  onSelectSession: (sessionId: string) => void;
  onStartAssessment: () => void;
  patientSessions: AssessmentSession[];
}) {
  return (
    <section className="dashboard-layout bento-dashboard-layout">
      <aside className="dashboard-sidebar" aria-label={`ประวัติของ ${currentPatientId}`}>
        <ProgressTimeline activeSessionId={activeSessionId} onSelect={onSelectSession} sessions={patientSessions} />
      </aside>

      {activeSession ? (
        <section className="dashboard-main bento-dashboard-main">
          <div className="dashboard-header">
            <div>
              <p className="bento-kicker">Physical Therapy Dashboard</p>
              <h2>Clinical overview for {activeSession.patientProfile.name}</h2>
              <span className="dashboard-meta">
                ID {normalizePatientId(activeSession.patientId)} ·{" "}
                Age {activeSession.patientProfile.age} · {sexLabelTh(activeSession.patientProfile.sex)} ·{" "}
                {sourceLabelTh(activeSession.source)} · {patientSessions.length} sessions
              </span>
            </div>
            <div className="dashboard-actions">
              <button className={ui.secondaryButton} onClick={() => exportSessionJson(activeSession)} type="button">
                <Download size={19} />
                Export JSON
              </button>
              <button className="lux-button lux-button--ghost-danger" onClick={() => onRemoveSession(activeSession.id)} type="button">
                <Trash2 size={19} />
                Delete
              </button>
            </div>
          </div>

          <AnimatedBentoContainer className="bento-grid" delayChildren={0.08} staggerChildren={0.075}>
            <MicroMetricCard
              detail={riskLabelTh(activeSession.metrics.riskLabel)}
              icon={<TrendingUp size={21} />}
              label="Current Score"
              tone="score"
              value={Math.round(activeSession.metrics.overallScore)}
            />
            <MicroMetricCard
              detail={`${Math.round(activeSession.metrics.asymmetry)}pt arm asymmetry · ${riskLabelTh(activeSession.metrics.riskLabel)}`}
              icon={<Brain size={21} />}
              label="Learned Non-Use (LNU)"
              tone="risk"
              value={Math.round(activeSession.metrics.learnedNonUseRiskIndex)}
            />
            <MicroMetricCard
              detail={
                activeSession.source === "video" && activeSession.videoAnalysis
                  ? `${activeSession.videoAnalysis.leftReachCount + activeSession.videoAnalysis.rightReachCount} reach events · ${activeSession.promptsTotal}/9 zones`
                  : `${activeSession.trials.length}/${activeSession.promptsTotal} targets`
              }
              icon={<CheckCircle2 size={21} />}
              label="Completion Rate"
              tone="completion"
              value={`${Math.round(activeSession.metrics.completionRate)}%`}
            />
            <ProgressChartBento activeSession={activeSession} sessions={patientSessions} />
            <DivergingPerformanceBento session={activeSession} />
            <MovementHeatmapBento session={activeSession} />
            <AIClinicalInsightsBento session={activeSession} />
          </AnimatedBentoContainer>
        </section>
      ) : (
        <DashboardEmptyState
          patientId={currentPatientId}
          profile={currentProfile}
          onStartAssessment={onStartAssessment}
        />
      )}
    </section>
  );
}
