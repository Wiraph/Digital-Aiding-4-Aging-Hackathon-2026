import {
  type CSSProperties,
  type Dispatch,
  type MouseEvent,
  type MutableRefObject,
  type RefObject,
  type SetStateAction,
} from "react";
import {
  Camera,
  CheckCircle2,
  FileText,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RefreshCcw,
  SkipForward,
  Square,
  Volume2,
} from "lucide-react";
import { MetricBar } from "../components/MetricBar";
import { PageWrapper } from "../components/PageWrapper";
import { PoseSvg } from "../components/PoseSvg";
import { ScoreTile } from "../components/ScoreTile";
import { ZoneGrid } from "../components/ZoneGrid";
import { examButton, ui, type PatientStage } from "../app/ui";
import { formatMs, riskClass, riskLabelTh, thaiSideLabel } from "../lib/patient";
import type { useCameraPose } from "../hooks/useCameraPose";
import type { AssessmentSession, PoseSnapshot, TrialPrompt, TrialResult } from "../types";

type CameraPoseController = ReturnType<typeof useCameraPose>;

export function AssessmentPage({
  activeSession,
  activeZoneStyle,
  assessmentStageRef,
  beginAssessment,
  calibrationProgress,
  camera,
  cameraFeedReady,
  canvasRef,
  completeCurrentTrial,
  currentIndex,
  currentPrompt,
  demoMode,
  finishSession,
  handleCameraSurfaceClick,
  holdReady,
  isCameraFullscreen,
  livePose,
  onOpenDashboard,
  paused,
  progressPercent,
  promptsLength,
  readiness,
  recordedUrl,
  requestCameraStart,
  resetPatientFlow,
  resultsRef,
  setCameraFeedReady,
  setDemoMode,
  setPaused,
  setVoiceEnabled,
  stage,
  targetHighlight,
  toggleCameraFullscreen,
  trialElapsed,
  trialResultsLength,
  videoRef,
  voiceEnabled,
}: {
  activeSession: AssessmentSession | null;
  activeZoneStyle: CSSProperties;
  assessmentStageRef: RefObject<HTMLDivElement | null>;
  beginAssessment: (forceDemo?: boolean) => void;
  calibrationProgress: number;
  camera: CameraPoseController;
  cameraFeedReady: boolean;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  completeCurrentTrial: (completedAtMs: number, completed?: boolean) => void;
  currentIndex: number;
  currentPrompt: TrialPrompt;
  demoMode: boolean;
  finishSession: (results: TrialResult[], endedAtMs: number, source: "camera" | "demo") => void;
  handleCameraSurfaceClick: (event: MouseEvent<HTMLDivElement>) => void;
  holdReady: boolean;
  isCameraFullscreen: boolean;
  livePose: PoseSnapshot | null;
  onOpenDashboard: () => void;
  paused: boolean;
  progressPercent: number;
  promptsLength: number;
  readiness: {
    face: boolean;
    torso: boolean;
    leftHand: boolean;
    rightHand: boolean;
  };
  recordedUrl: string | null;
  requestCameraStart: () => void;
  resetPatientFlow: () => void;
  resultsRef: MutableRefObject<TrialResult[]>;
  setCameraFeedReady: Dispatch<SetStateAction<boolean>>;
  setDemoMode: Dispatch<SetStateAction<boolean>>;
  setPaused: Dispatch<SetStateAction<boolean>>;
  setVoiceEnabled: Dispatch<SetStateAction<boolean>>;
  stage: PatientStage;
  targetHighlight: number;
  toggleCameraFullscreen: () => Promise<void>;
  trialElapsed: number;
  trialResultsLength: number;
  videoRef: RefObject<HTMLVideoElement | null>;
  voiceEnabled: boolean;
}) {
  return (
    <>
      {stage === "calibration" ? (
        <PageWrapper key="calibration">
          <section className="calibration-layout grid min-h-[calc(100vh-89px)] grid-cols-[minmax(520px,1fr)_minmax(330px,420px)] max-[1040px]:grid-cols-1">
            <div className="video-shell max-[700px]:p-[18px]">
              <div className="video-frame aspect-video w-full">
                <video
                  className="absolute inset-0 h-full w-full scale-x-[-1] object-cover"
                  muted
                  onLoadedData={() => setCameraFeedReady(true)}
                  onPlaying={() => setCameraFeedReady(true)}
                  playsInline
                  ref={videoRef}
                  style={{ transform: "scaleX(-1)" }}
                />
                <canvas className="pointer-events-none absolute inset-0 z-[3] h-full w-full object-cover" ref={canvasRef} />
                {camera.status !== "ready" ? (
                  <div className="demo-surface">
                    <PoseSvg pose={null} />
                  </div>
                ) : null}
                <ZoneGrid compact />
              </div>
            </div>
            <aside className="control-panel flex flex-col gap-6 p-8 max-[700px]:p-[18px]">
              <p className={ui.eyebrow}>ปรับเทียบกล้อง</p>
              <h2 className={ui.title}>นั่งตรงกลางภาพ แล้วยกมือทั้งสองข้าง</h2>
              <div
                className={`status-pill ${
                  camera.status === "ready"
                    ? "status-pill--ready"
                    : camera.status === "error"
                      ? "status-pill--error"
                      : ""
                }`}
              >
                <Camera size={21} />
                <span>
                  {camera.status === "idle"
                    ? "ยังไม่ได้เริ่มกล้อง"
                    : camera.status === "requesting-camera"
                      ? "กำลังรออนุญาตใช้กล้อง"
                      : camera.status === "loading-model"
                        ? "กำลังโหลดโมเดลตรวจจับท่าทาง"
                        : camera.status === "ready"
                          ? "พร้อมติดตามท่าทาง"
                          : "ไม่สามารถใช้กล้องได้"}
                </span>
              </div>
              <div className="readiness-grid" aria-label="สถานะการตรวจจับก่อนเริ่มทดสอบ">
                {[
                  ["ใบหน้า", readiness.face],
                  ["ลำตัว", readiness.torso],
                  ["มือซ้าย", readiness.leftHand],
                  ["มือขวา", readiness.rightHand],
                ].map(([label, ready]) => (
                  <span className={`readiness-pill ${ready ? "readiness-pill--ready" : ""}`} key={String(label)}>
                    {label}
                  </span>
                ))}
              </div>
              {camera.error ? (
                <p className="m-0 rounded-lg bg-[#3b1d1d] p-[13px] font-bold text-[#ffd6c7]">
                  {camera.error}
                </p>
              ) : null}
              <MetricBar label="ความพร้อมในการปรับเทียบ" value={calibrationProgress * 100} />
              <div className={ui.column}>
                {camera.status === "idle" || camera.status === "error" ? (
                  <button className={ui.primaryButton} onClick={requestCameraStart} type="button">
                    <Camera size={21} />
                    เริ่มกล้อง
                  </button>
                ) : null}
                <button className={ui.secondaryButton} onClick={() => beginAssessment(false)} type="button">
                  <CheckCircle2 size={20} />
                  ยืนยันด้วยตนเอง
                </button>
                <button className={ui.secondaryButton} onClick={() => beginAssessment(true)} type="button">
                  <Play size={20} />
                  ใช้สัญญาณสาธิต
                </button>
              </div>
            </aside>
          </section>
        </PageWrapper>
      ) : null}

      {stage === "assessment" ? (
        <PageWrapper key="assessment">
          <section className="assessment-page">
            <div className="assessment-theater">
              <div
                aria-label="หน้ากล้อง กดเพื่อขยายเต็มจอ"
                className={`assessment-feed focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-[#f2ca76] ${
                  isCameraFullscreen ? "is-fullscreen" : ""
                }`}
                onClick={handleCameraSurfaceClick}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    void toggleCameraFullscreen();
                  }
                }}
                ref={assessmentStageRef}
                role="button"
                tabIndex={0}
              >
                <video
                  className="absolute inset-0 h-full w-full scale-x-[-1] object-contain"
                  muted
                  onLoadedData={() => setCameraFeedReady(true)}
                  onPlaying={() => setCameraFeedReady(true)}
                  playsInline
                  ref={videoRef}
                  style={{ transform: "scaleX(-1)" }}
                />
                <canvas className="pointer-events-none absolute inset-0 z-[3] h-full w-full object-contain" ref={canvasRef} />
                {!demoMode && (!camera.stream || !cameraFeedReady) ? (
                  <div
                    className="camera-placeholder max-[700px]:top-[43%] max-[700px]:p-4 [&>div]:flex [&>div]:flex-wrap [&>div]:justify-center [&>div]:gap-2"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <Camera size={28} />
                    <strong>ยังไม่เห็นภาพจากกล้อง</strong>
                    <span>
                      อนุญาตการใช้กล้องแล้วกดเริ่มกล้องอีกครั้ง หรือใช้สัญญาณสาธิตเพื่อทดลองต่อ
                    </span>
                    <div>
                      <button className={`${examButton} exam-button--muted`} onClick={requestCameraStart} type="button">
                        <Camera size={18} />
                        เริ่มกล้อง
                      </button>
                      <button className={`${examButton} exam-button--primary`} onClick={() => setDemoMode(true)} type="button">
                        <Play size={18} />
                        สาธิต
                      </button>
                    </div>
                  </div>
                ) : null}
                {demoMode || !camera.stream ? <div className="demo-surface" /> : null}
                <div className="lux-grid-overlay" aria-hidden="true">
                  <div
                    className={`target-zone target-zone--${currentPrompt.side}`}
                    style={
                      {
                        ...activeZoneStyle,
                        "--zone-heat": String(0.18 + targetHighlight),
                      } as CSSProperties
                    }
                  >
                    <span className="target-label max-[700px]:top-2 max-[700px]:px-2.5">
                      เป้าหมาย {currentPrompt.zoneId}
                    </span>
                  </div>
                </div>
                <div className="test-pill max-[700px]:top-3 max-[700px]:max-w-[calc(100%-78px)] max-[700px]:px-3">
                  แบบทดสอบที่ {currentIndex + 1}
                </div>
                {demoMode || !camera.stream ? <PoseSvg clinical pose={livePose} /> : null}
                <button
                  aria-label={isCameraFullscreen ? "ออกจากโหมดเต็มจอ" : "ขยายกล้องเต็มจอ"}
                  aria-pressed={isCameraFullscreen}
                  className="icon-button right-3.5 top-3.5 max-[700px]:right-2.5 max-[700px]:top-2.5"
                  onClick={(event) => {
                    event.stopPropagation();
                    void toggleCameraFullscreen();
                  }}
                  type="button"
                >
                  {isCameraFullscreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
                </button>
                <div className="video-controls max-[700px]:px-3 max-[700px]:pb-3" onClick={(event) => event.stopPropagation()}>
                  <div className="progress-card max-[700px]:w-full">
                    <strong className="break-words text-sm leading-tight">
                      {thaiSideLabel(currentPrompt.side)} ไปยังช่อง {currentPrompt.zoneId}
                    </strong>
                    <progress max={100} value={progressPercent} />
                    <span>
                      {holdReady ? "จับเป้าหมายแล้ว" : `${formatMs(trialElapsed)} · ${trialResultsLength}/${promptsLength}`}
                    </span>
                  </div>
                  <div className="flex flex-wrap justify-center gap-2 max-[700px]:grid max-[700px]:w-full max-[700px]:grid-cols-2">
                    <button className={`${examButton} exam-button--primary`} onClick={() => completeCurrentTrial(performance.now(), false)} type="button">
                      <SkipForward size={18} />
                      ถัดไป
                    </button>
                    <button className={`${examButton} exam-button--muted`} onClick={() => setPaused((current) => !current)} type="button">
                      {paused ? <Play size={18} /> : <Pause size={18} />}
                      {paused ? "ต่อ" : "พัก"}
                    </button>
                    <button
                      aria-pressed={voiceEnabled}
                      className={`${examButton} ${voiceEnabled ? "exam-button--active" : "exam-button--muted"}`}
                      onClick={() => setVoiceEnabled((current) => !current)}
                      type="button"
                    >
                      <Volume2 size={18} />
                      เสียง
                    </button>
                    <button
                      className={`${examButton} exam-button--danger`}
                      onClick={() => finishSession(resultsRef.current, performance.now(), demoMode ? "demo" : "camera")}
                      type="button"
                    >
                      <Square size={16} />
                      จบการฝึก
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </PageWrapper>
      ) : null}

      {stage === "results" && activeSession ? (
        <PageWrapper key="results">
          <section className="marble-card report-card">
            <div className={ui.sectionTitle}>
              <CheckCircle2 size={30} />
              <div>
                <p className={ui.eyebrow}>ผลลัพธ์ผู้รับการทดสอบ</p>
                <h2 className={ui.title}>ทดสอบเสร็จสมบูรณ์</h2>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3.5 max-[1040px]:grid-cols-2 max-[700px]:grid-cols-1">
              <ScoreTile
                detail={riskLabelTh(activeSession.metrics.riskLabel)}
                label="คะแนนรวม"
                tone={riskClass(activeSession.metrics.riskLabel)}
                value={Math.round(activeSession.metrics.overallScore)}
              />
              <ScoreTile
                detail={`ใช้งาน ${Math.round(activeSession.metrics.leftUsagePercent)}%`}
                label="แขนซ้าย"
                tone="score-tile--left"
                value={Math.round(activeSession.metrics.left.composite)}
              />
              <ScoreTile
                detail={`ใช้งาน ${Math.round(activeSession.metrics.rightUsagePercent)}%`}
                label="แขนขวา"
                tone="score-tile--right"
                value={Math.round(activeSession.metrics.right.composite)}
              />
            </div>
            <div className="report-copy">
              {activeSession.metrics.report.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
            {recordedUrl ? (
              <video className="my-4 block max-h-80 w-full rounded-lg bg-[#15110d]" controls src={recordedUrl} />
            ) : null}
            <div className={ui.row}>
              <button className={ui.primaryButton} onClick={onOpenDashboard} type="button">
                <FileText size={21} />
                ดูรายงานสำหรับแพทย์
              </button>
              <button className={ui.secondaryButton} onClick={resetPatientFlow} type="button">
                <RefreshCcw size={20} />
                เริ่มทดสอบใหม่
              </button>
            </div>
          </section>
        </PageWrapper>
      ) : null}
    </>
  );
}
