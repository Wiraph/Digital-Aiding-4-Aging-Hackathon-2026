import { useCallback, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Upload, Video, X } from "lucide-react";
import { ZONES } from "../lib/assessment";
import type { AssessmentSession, ConsentState, PatientProfile } from "../types";
import { analyzeVideo, buildVideoSession, type ActiveZone, type AnalysisPhase, type FrameCallback } from "../lib/videoAnalysis";

type AnalysisState =
  | { phase: "idle" }
  | { phase: "processing"; progress: number; statusTh: string }
  | { phase: "done"; session: AssessmentSession }
  | { phase: "error"; message: string };

interface VideoUploadZoneProps {
  profile: PatientProfile;
  consent: ConsentState;
  onComplete: (session: AssessmentSession) => void;
  onBack: () => void;
}

function drawFrameOverlay(
  displayCanvas: HTMLCanvasElement,
  sourceCanvas: HTMLCanvasElement,
  leftWrist: { x: number; y: number } | null,
  rightWrist: { x: number; y: number } | null,
  leftZoneId: number | null,
  rightZoneId: number | null,
  activeZone: ActiveZone | null,
  phase: AnalysisPhase,
) {
  const ctx = displayCanvas.getContext("2d");
  if (!ctx) return;
  const { width: W, height: H } = displayCanvas;
  const cW = W / 3;
  const cH = H / 3;

  ctx.drawImage(sourceCanvas, 0, 0, W, H);

  // ── Prep phase overlay ───────────────────────────────────────
  if (phase === "prep") {
    ctx.fillStyle = "rgba(242,165,43,0.12)";
    ctx.fillRect(0, 0, W, H);
    ctx.font = "bold 22px Montserrat,sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(0,0,0,0.7)";
    ctx.strokeText("กำลังเตรียมพร้อม…", W / 2, 32);
    ctx.fillStyle = "#f2a52b";
    ctx.fillText("กำลังเตรียมพร้อม…", W / 2, 32);
  }

  // ── Active zone highlight ────────────────────────────────────
  if (activeZone !== null) {
    const col = (activeZone.id - 1) % 3;
    const row = Math.floor((activeZone.id - 1) / 3);
    const ax = col * cW;
    const ay = row * cH;

    const isLeftReached  = leftZoneId  === activeZone.id;
    const isRightReached = rightZoneId === activeZone.id;
    const isReached = isLeftReached || isRightReached;

    // Background fill — amber = target, green = reached
    ctx.fillStyle = isReached ? "rgba(60,180,80,0.22)" : "rgba(242,165,43,0.18)";
    ctx.strokeStyle = isReached ? "#3cb450" : "#f2a52b";
    ctx.lineWidth = isReached ? 4 : 3;
    ctx.shadowColor = ctx.strokeStyle;
    ctx.shadowBlur = isReached ? 24 : 14;
    ctx.beginPath();
    ctx.roundRect(ax + 3, ay + 3, cW - 6, cH - 6, 10);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  // ── Grid lines ───────────────────────────────────────────────
  ctx.strokeStyle = "rgba(242,202,118,0.30)";
  ctx.lineWidth = 1;
  [1, 2].forEach((n) => {
    ctx.beginPath(); ctx.moveTo(n * cW, 0); ctx.lineTo(n * cW, H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, n * cH); ctx.lineTo(W, n * cH); ctx.stroke();
  });

  // ── Wrist dots ───────────────────────────────────────────────
  const drawWrist = (w: { x: number; y: number }, label: string, color: string) => {
    const px = w.x * W;
    const py = w.y * H;
    const r = 18;
    ctx.fillStyle = color + "55";
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.shadowColor = color;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.font = "bold 11px Montserrat,sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(0,0,0,0.85)";
    ctx.strokeText(label, px, py - r - 2);
    ctx.fillStyle = "#fff";
    ctx.fillText(label, px, py - r - 2);
  };
  if (leftWrist)  drawWrist(leftWrist,  "ซ้าย", "#f2a52b");
  if (rightWrist) drawWrist(rightWrist, "ขวา",  "#c45a1f");
}

export function VideoUploadZone({ profile, consent, onComplete, onBack }: VideoUploadZoneProps) {
  const [state, setState] = useState<AnalysisState>({ phase: "idle" });
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const displayCanvasRef = useRef<HTMLCanvasElement>(null);

  const onFrame = useCallback<FrameCallback>((
    sourceCanvas, leftWrist, rightWrist, leftZoneId, rightZoneId, activeZone, phase,
  ) => {
    const dc = displayCanvasRef.current;
    if (!dc) return;
    drawFrameOverlay(dc, sourceCanvas, leftWrist, rightWrist, leftZoneId, rightZoneId, activeZone, phase);
  }, []);

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("video/")) {
        setState({ phase: "error", message: "ไฟล์ที่เลือกไม่ใช่วิดีโอ กรุณาเลือกไฟล์ .mp4, .mov หรือ .webm" });
        return;
      }
      setFileName(file.name);
      setState({ phase: "processing", progress: 0, statusTh: "เตรียมวิดีโอ…" });
      try {
        const result = await analyzeVideo(
          file,
          (progress, statusTh) => setState({ phase: "processing", progress, statusTh }),
          onFrame,
        );
        const session = buildVideoSession(result, profile, consent);
        setState({ phase: "done", session });
      } catch (err) {
        setState({
          phase: "error",
          message: err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการวิเคราะห์วิดีโอ",
        });
      }
    },
    [profile, consent, onFrame],
  );

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
    e.target.value = "";
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) void handleFile(file);
  }

  return (
    <div className="video-upload-page">
      <div className="video-upload-card">
        {/* Header */}
        <div className="video-upload-header">
          <div className="video-upload-icon-wrap"><Video size={26} /></div>
          <div>
            <p className="video-upload-kicker">วิเคราะห์จากวิดีโอ · VIDEO ANALYSIS</p>
            <h2 className="video-upload-title">อัปโหลดวิดีโอการเอื้อมแขน</h2>
          </div>
          <button className="video-upload-back" onClick={onBack} type="button" aria-label="ย้อนกลับ">
            <X size={20} />
          </button>
        </div>

        {/* Idle / Drop zone */}
        {state.phase === "idle" && (
          <>
            <div
              className={`video-drop-zone ${dragOver ? "is-drag-over" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              onClick={() => inputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") inputRef.current?.click(); }}
            >
              <Upload size={36} className="video-drop-icon" />
              <p className="video-drop-main">ลากวิดีโอมาวางที่นี่</p>
              <p className="video-drop-sub">หรือคลิกเพื่อเลือกไฟล์ · MP4 / MOV / WebM</p>
              <span className="video-drop-badge">Real-time · 1080p · 30fps</span>
              <input ref={inputRef} type="file" accept="video/*" className="sr-only" onChange={onInputChange} />
            </div>
            <div className="video-upload-hints">
              <p>📹 ใช้วิดีโอที่บันทึกจากหน้าจอแอป (Screen Recording) ขณะทดสอบ</p>
              <p>🎯 ระบบจะตรวจจับช่องเป้าหมายจากสีในวิดีโอโดยอัตโนมัติ</p>
              <p>⏱ ใช้เวลาวิเคราะห์เท่ากับความยาววิดีโอ (Real-time)</p>
            </div>
          </>
        )}

        {/* Processing — live canvas preview */}
        {state.phase === "processing" && (
          <div className="video-processing">
            <div className="video-preview-wrap">
              <canvas
                ref={displayCanvasRef}
                className="video-preview-canvas"
                width={960}
                height={540}
              />
              <div className="video-preview-legend">
                <span className="vpl-left">● ซ้าย</span>
                <span className="vpl-right">● ขวา</span>
                <span className="vpl-zone">▦ ช่องที่ล็อก</span>
                <span className="vpl-reached">■ ถึงแล้ว</span>
              </div>
            </div>
            <div className="video-proc-bar-wrap">
              <div
                className="video-proc-bar"
                style={{ "--bar-pct": state.progress / 100 } as React.CSSProperties}
              />
            </div>
            <p className="video-proc-file">{fileName}</p>
            <p className="video-proc-status">{state.statusTh}</p>
            <p className="video-proc-pct">{Math.round(state.progress)}%</p>
            <p className="video-proc-note">วิเคราะห์แบบ Real-time — นับเฉพาะตอนที่ระบบแสดงช่องเป้าหมาย</p>
          </div>
        )}

        {/* Done — detailed clinical summary */}
        {state.phase === "done" && state.session.videoAnalysis && (() => {
          const va = state.session.videoAnalysis!;
          const m = state.session.metrics;
          const dominantTh =
            va.dominantArm === "right" ? "แขนขวา"
            : va.dominantArm === "left" ? "แขนซ้าย"
            : "ทั้งสองข้าง (Ambidextrous)";
          const fasterTh =
            va.fasterArm === "right" ? "แขนขวา"
            : va.fasterArm === "left" ? "แขนซ้าย"
            : "เท่ากัน";
          const lSec = (va.leftAvgFramesPerReach * va.avgSecPerAnalyzedFrame).toFixed(2);
          const rSec = (va.rightAvgFramesPerReach * va.avgSecPerAnalyzedFrame).toFixed(2);
          const lZones = ZONES.filter((z) => va.zoneCounts.left[z.id] > 0).map((z) => z.id);
          const rZones = ZONES.filter((z) => va.zoneCounts.right[z.id] > 0).map((z) => z.id);
          const lnuClass = m.riskLabel === "Good" ? "lnu-good" : m.riskLabel === "Moderate" ? "lnu-moderate" : "lnu-risk";
          const lnuTh =
            m.riskLabel === "Good" ? "ต่ำ — ไม่พบสัญญาณ Learned Non-Use ชัดเจน"
            : m.riskLabel === "Moderate" ? "ปานกลาง — ควรติดตามการใช้แขนอย่างใกล้ชิด"
            : "สูง — พบรูปแบบที่อาจเป็น Learned Non-Use ควรประเมินต่อ";
          const usageDiff = Math.abs(va.leftUsagePercent - va.rightUsagePercent);
          const suppressedArm = va.dominantArm === "right" ? "ซ้าย" : va.dominantArm === "left" ? "ขวา" : null;

          return (
            <div className="video-done">
              <div className="video-done-header">
                <CheckCircle2 size={32} className="video-done-icon" />
                <h3 className="video-done-title">วิเคราะห์เสร็จสมบูรณ์</h3>
              </div>

              <div className="video-insight-block">
                <div className="video-insight-row">
                  <span className="vi-label">แขนที่ใช้มากกว่า</span>
                  <span className="vi-val vi-dominant">{dominantTh}</span>
                </div>
                {suppressedArm && (
                  <p className="vi-note">
                    แขน{suppressedArm}ถูกใช้เพียง {Math.round(va.dominantArm === "right" ? va.leftUsagePercent : va.rightUsagePercent)}%
                    {" "}ขณะที่แขนอีกข้างใช้ {Math.round(usageDiff + (100 - usageDiff * 2))}%
                    {" "}— ความแตกต่าง {Math.round(usageDiff)}% อาจบ่งชี้รูปแบบ Learned Non-Use
                  </p>
                )}
              </div>

              <div className="video-done-grid">
                <div className="vdg-section">
                  <p className="vdg-heading">การใช้งาน</p>
                  <div className="vdg-row"><span>ซ้าย</span><strong>{Math.round(va.leftUsagePercent)}% · {va.leftReachCount} ครั้ง</strong></div>
                  <div className="vdg-row"><span>ขวา</span><strong>{Math.round(va.rightUsagePercent)}% · {va.rightReachCount} ครั้ง</strong></div>
                </div>
                <div className="vdg-section">
                  <p className="vdg-heading">ความเร็วเฉลี่ย</p>
                  <div className="vdg-row"><span>ซ้าย</span><strong>{lSec} วินาที/ครั้ง</strong></div>
                  <div className="vdg-row"><span>ขวา</span><strong>{rSec} วินาที/ครั้ง</strong></div>
                  <div className="vdg-row vdg-faster"><span>แขนที่เร็วกว่า</span><strong>{fasterTh}</strong></div>
                </div>
                <div className="vdg-section">
                  <p className="vdg-heading">โซนที่เข้าถึง</p>
                  <div className="vdg-row"><span>ซ้าย</span><strong>{lZones.length > 0 ? `โซน ${lZones.join(", ")}` : "ไม่พบ"}</strong></div>
                  <div className="vdg-row"><span>ขวา</span><strong>{rZones.length > 0 ? `โซน ${rZones.join(", ")}` : "ไม่พบ"}</strong></div>
                </div>
                <div className="vdg-section">
                  <p className="vdg-heading">Logistic Regression</p>
                  <div className="vdg-row"><span>p-value</span><strong>{va.logitProbability.toFixed(3)}</strong></div>
                  <div className="vdg-row"><span>การจำแนก</span><strong>{dominantTh}</strong></div>
                  <div className="vdg-row"><span>วิดีโอ</span><strong>~{va.fps} fps · {va.totalSampledFrames} เฟรม</strong></div>
                </div>
              </div>

              <div className={`video-lnu-badge ${lnuClass}`}>
                <span className="vlnu-label">ความเสี่ยง LNU</span>
                <span className="vlnu-val">{lnuTh}</span>
              </div>

              <button
                className="lux-button lux-button--primary video-done-btn"
                onClick={() => onComplete(state.session)}
                type="button"
              >
                <CheckCircle2 size={20} />
                ดูรายงานสำหรับแพทย์
              </button>
            </div>
          );
        })()}

        {/* Error */}
        {state.phase === "error" && (
          <div className="video-error">
            <AlertTriangle size={32} className="video-error-icon" />
            <p className="video-error-msg">{state.message}</p>
            <button className="lux-button lux-button--secondary" onClick={() => setState({ phase: "idle" })} type="button">
              ลองอีกครั้ง
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
