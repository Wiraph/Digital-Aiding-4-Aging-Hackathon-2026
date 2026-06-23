import {
  FilesetResolver,
  NormalizedLandmark,
  PoseLandmarker,
} from "@mediapipe/tasks-vision";
import type { AssessmentSession, ArmScore, ConsentState, PatientProfile, RiskLabel, VideoAnalysisResult } from "../types";
import { ZONES } from "./assessment";

const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task";
const WASM_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";

const MIN_CONFIDENCE = 0.4;
// Frames a wrist must stay in the same zone before the entry is counted.
const MIN_LOCK_FRAMES = 3;
// Minimum average chroma (max-min of RGB, 0-255) for a grid cell to be considered
// a colored zone highlight. Tuned to pass saturated zone fills (≥50) and reject
// neutral backgrounds, slightly coloured walls, and skin tone.
const ZONE_CHROMA_THRESHOLD = 45;
// Minimum brightness so dark-but-saturated scenes (shadowed blue walls) don't fire.
const ZONE_BRIGHTNESS_MIN = 60;

const clamp = (v: number, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, v));

export interface ActiveZone {
  id: number;   // 1-9 row-major
  x1: number;   // normalised 0-1 bounds within the canvas
  y1: number;
  x2: number;
  y2: number;
}

export type AnalysisPhase = "prep" | "active";

export type FrameCallback = (
  sourceCanvas: HTMLCanvasElement,
  leftWrist: { x: number; y: number } | null,
  rightWrist: { x: number; y: number } | null,
  leftZoneId: number | null,   // tracker-confirmed left zone (null = not reached)
  rightZoneId: number | null,  // tracker-confirmed right zone
  activeZone: ActiveZone | null,
  phase: AnalysisPhase,
) => void;

// ── Zone detection ───────────────────────────────────────────────────────────

/**
 * Detect which of the 9 equal grid cells contains a coloured zone highlight.
 * Returns the cell with highest average chroma above ZONE_CHROMA_THRESHOLD,
 * or null if no cell qualifies.
 * Reads pixel data from an already-drawn canvas in one getImageData call.
 */
function detectActiveZone(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
): ActiveZone | null {
  // One GPU→CPU transfer for the full canvas (done after drawImage anyway)
  const { data } = ctx.getImageData(0, 0, W, H);
  const cW = Math.floor(W / 3);
  const cH = Math.floor(H / 3);
  const STEP = 6; // sample every 6th pixel in each axis

  let bestId = -1;
  let bestChroma = ZONE_CHROMA_THRESHOLD;

  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const x0 = col * cW;
      const y0 = row * cH;
      let sumChroma = 0;
      let sumBrightness = 0;
      let n = 0;

      for (let y = y0; y < y0 + cH; y += STEP) {
        for (let x = x0; x < x0 + cW; x += STEP) {
          const i = (y * W + x) * 4;
          const r = data[i], g = data[i + 1], b = data[i + 2];
          sumChroma += Math.max(r, g, b) - Math.min(r, g, b);
          sumBrightness += (r + g + b) / 3;
          n++;
        }
      }

      if (n === 0) continue;
      const avgChroma = sumChroma / n;
      const avgBrightness = sumBrightness / n;

      if (avgChroma > bestChroma && avgBrightness > ZONE_BRIGHTNESS_MIN) {
        bestChroma = avgChroma;
        bestId = row * 3 + col + 1;
      }
    }
  }

  if (bestId < 0) return null;

  const col = (bestId - 1) % 3;
  const row = Math.floor((bestId - 1) / 3);
  return {
    id: bestId,
    x1: col / 3,
    y1: row / 3,
    x2: (col + 1) / 3,
    y2: (row + 1) / 3,
  };
}

/** True when both wrists are raised above their respective shoulders. */
function detectPrepPhase(lm: NormalizedLandmark[]): boolean {
  const lw = lm[15], rw = lm[16]; // wrists
  const ls = lm[11], rs = lm[12]; // shoulders
  if (!lw || !rw || !ls || !rs) return false;
  if ((lw.visibility ?? 0) < 0.3 || (rw.visibility ?? 0) < 0.3) return false;
  // y=0 = top of frame → wrist above shoulder ≡ wrist.y < shoulder.y
  return lw.y < ls.y - 0.05 && rw.y < rs.y - 0.05;
}

/** True if a point (normalised) lies within a zone's bounding box. */
function wristInZone(pt: { x: number; y: number }, zone: ActiveZone): boolean {
  return pt.x >= zone.x1 && pt.x <= zone.x2 && pt.y >= zone.y1 && pt.y <= zone.y2;
}

function initZoneCounts(): Record<number, number> {
  const out: Record<number, number> = {};
  for (let i = 1; i <= 9; i++) out[i] = 0;
  return out;
}

// ── Zone entry tracker ───────────────────────────────────────────────────────

interface ZoneTracker {
  locked: number | null;
  candidate: number | null;
  candidateN: number;
  lockedFrames: number;
}

function makeTracker(): ZoneTracker {
  return { locked: null, candidate: null, candidateN: 0, lockedFrames: 0 };
}

function tickTracker(
  tr: ZoneTracker,
  zoneId: number | null,
  zoneCounts: Record<number, number>,
  reachList: number[],
): number | null {
  if (zoneId === null) {
    tr.candidate = null;
    tr.candidateN = 0;
    return tr.locked;
  }

  if (zoneId === tr.candidate) {
    tr.candidateN++;
  } else {
    tr.candidate = zoneId;
    tr.candidateN = 1;
  }

  if (tr.candidateN >= MIN_LOCK_FRAMES && zoneId !== tr.locked) {
    zoneCounts[zoneId]++;
    if (tr.locked !== null && tr.lockedFrames > 0) {
      reachList.push(tr.lockedFrames);
    }
    tr.locked = zoneId;
    tr.lockedFrames = 0;
  }

  if (zoneId === tr.locked) {
    tr.lockedFrames++;
  }

  return tr.locked;
}

// ── Scoring helpers ──────────────────────────────────────────────────────────

function sigmoid(z: number): number { return 1 / (1 + Math.exp(-z)); }

function avgOf(list: number[]): number {
  return list.length === 0 ? 0 : list.reduce((a, b) => a + b, 0) / list.length;
}

function speedToScore(avgF: number): number {
  return avgF <= 0 ? 50 : clamp(100 - ((avgF - 2) / 18) * 100);
}

function logisticClassify(
  leftFrameCount: number,
  rightFrameCount: number,
  leftAvgFrames: number,
  rightAvgFrames: number,
) {
  const total = leftFrameCount + rightFrameCount;
  if (total === 0) return { logitProbability: 0.5, dominantArm: "ambidextrous" as const };
  const rightRatio = rightFrameCount / total - 0.5;
  const maxF = Math.max(leftAvgFrames, rightAvgFrames, 1);
  const speedBias = leftAvgFrames > 0 && rightAvgFrames > 0 ? (leftAvgFrames - rightAvgFrames) / maxF : 0;
  const z = 8.0 * rightRatio + 3.0 * speedBias;
  const p = sigmoid(z);
  return {
    logitProbability: p,
    dominantArm: p > 0.6 ? "right" : p < 0.4 ? "left" : "ambidextrous",
  } as const;
}

function buildArmScore(
  frameCount: number,
  reachList: number[],
  zoneCounts: Record<number, number>,
  totalFrames: number,
): ArmScore {
  const usagePct = totalFrames > 0 ? (frameCount / totalFrames) * 100 : 0;
  const avgF = avgOf(reachList);
  const speed = speedToScore(avgF);
  const distinctZones = Object.values(zoneCounts).filter((v) => v > 0).length;
  const accuracy = clamp(60 + distinctZones * 4.4);
  const quality = clamp(speed * 0.45 + accuracy * 0.45 + usagePct * 0.1);
  const completion = (distinctZones / 9) * 100;
  const composite = clamp(speed * 0.28 + accuracy * 0.3 + quality * 0.27 + completion * 0.15);
  return {
    speed, accuracy, quality, completion, composite,
    promptCount: reachList.length,
    completedCount: reachList.length,
    averageReactionMs: avgF * 500,
  };
}

function buildVideoMetrics(
  result: VideoAnalysisResult,
  left: ArmScore,
  right: ArmScore,
): AssessmentSession["metrics"] {
  const asymmetry = Math.abs(left.composite - right.composite);
  const weakerScore = Math.min(left.composite, right.composite);
  const usageGap = Math.abs(result.leftUsagePercent - result.rightUsagePercent);
  const learnedNonUseRiskIndex = clamp(asymmetry * 0.7 + (100 - weakerScore) * 0.24 + usageGap * 0.35);
  const riskLabel: RiskLabel =
    learnedNonUseRiskIndex >= 45 ? "Needs More Practice"
    : learnedNonUseRiskIndex >= 23 ? "Moderate"
    : "Good";
  const overallScore = clamp((left.composite + right.composite) / 2);
  const distinctZonesHit = Object.keys(result.zoneCounts.left).filter(
    (k) => result.zoneCounts.left[+k] > 0 || result.zoneCounts.right[+k] > 0,
  ).length;
  const completionRate = (distinctZonesHit / 9) * 100;

  const s = result.avgSecPerAnalyzedFrame;
  const lSec = (result.leftAvgFramesPerReach * s).toFixed(2);
  const rSec = (result.rightAvgFramesPerReach * s).toFixed(2);
  const dominantTh =
    result.dominantArm === "right" ? "แขนขวา" : result.dominantArm === "left" ? "แขนซ้าย" : "ทั้งสองแขนใกล้เคียงกัน";
  const fasterTh =
    result.fasterArm === "right" ? "แขนขวา" : result.fasterArm === "left" ? "แขนซ้าย" : "ทั้งสองแขน";
  const riskPhrase =
    riskLabel === "Good" ? "พบความเสี่ยง Learned Non-Use ต่ำ"
    : riskLabel === "Moderate" ? "พบความไม่สมดุลระดับปานกลาง ควรติดตาม"
    : "พบความไม่สมดุลชัดเจน — อาจมีรูปแบบ Learned Non-Use";

  return {
    overallScore, left, right,
    leftUsagePercent: result.leftUsagePercent,
    rightUsagePercent: result.rightUsagePercent,
    asymmetry, learnedNonUseRiskIndex, riskLabel,
    trackingQuality: 80,
    completionRate,
    heatmap: { left: result.zoneCounts.left, right: result.zoneCounts.right },
    report: [
      `คะแนนคัดกรองรวม ${Math.round(overallScore)}/100: ${riskPhrase}`,
      `แขนที่ใช้มากกว่า: ${dominantTh} (p=${result.logitProbability.toFixed(2)})`,
      `แขนที่เร็วกว่า: ${fasterTh} — ซ้าย ${lSec}s/ครั้ง · ขวา ${rSec}s/ครั้ง`,
    ],
    followUp: [
      "ทดสอบ 9 ช่องซ้ำและเปรียบเทียบการทำครบ ความเร็ว และความแม่นยำ",
      "เพิ่มการฝึกกิจวัตรประจำวันแบบ task-specific โดยเน้นแขนที่ใช้น้อยกว่า",
      "ส่งต่อให้นักกายภาพบำบัดหากมีอาการปวด เหนื่อยมาก เวียนศีรษะ หรืออ่อนแรงเฉียบพลัน",
    ],
  };
}

// ── Public API ───────────────────────────────────────────────────────────────

export function buildVideoSession(
  result: VideoAnalysisResult,
  profile: PatientProfile,
  consent: ConsentState,
): AssessmentSession {
  const totalFrames = result.leftFrameCount + result.rightFrameCount;
  const leftReachList = Array.from({ length: result.leftReachCount }, () => result.leftAvgFramesPerReach);
  const rightReachList = Array.from({ length: result.rightReachCount }, () => result.rightAvgFramesPerReach);
  const left = buildArmScore(result.leftFrameCount, leftReachList, result.zoneCounts.left, totalFrames);
  const right = buildArmScore(result.rightFrameCount, rightReachList, result.zoneCounts.right, totalFrames);
  const metrics = buildVideoMetrics(result, left, right);
  const zonesReached = Object.keys(result.zoneCounts.left).filter(
    (k) => result.zoneCounts.left[+k] > 0 || result.zoneCounts.right[+k] > 0,
  ).length;
  return {
    id: `VS-${Date.now().toString(36).toUpperCase()}`,
    patientId: profile.id,
    patientProfile: profile,
    createdAt: new Date().toISOString(),
    promptsTotal: zonesReached,
    durationMs: result.durationSec * 1000,
    trials: [],
    metrics,
    consent,
    videoRecorded: false,
    source: "video",
    videoAnalysis: result,
  };
}

export async function analyzeVideo(
  file: File,
  onProgress: (progress: number, statusTh: string) => void,
  onFrame?: FrameCallback,
): Promise<VideoAnalysisResult> {
  onProgress(2, "โหลดวิดีโอ…");
  const videoUrl = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.preload = "auto";
  video.crossOrigin = "anonymous";
  video.playbackRate = 1;

  await new Promise<void>((resolve, reject) => {
    const ok = () => { video.removeEventListener("error", err); resolve(); };
    const err = () => { video.removeEventListener("canplay", ok); reject(new Error("ไม่สามารถโหลดวิดีโอได้")); };
    video.addEventListener("canplay", ok, { once: true });
    video.addEventListener("error", err, { once: true });
    video.src = videoUrl;
    video.load();
  });

  const durationSec = video.duration;
  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    URL.revokeObjectURL(videoUrl);
    throw new Error("วิดีโอไม่มีข้อมูลเวลา กรุณาลองไฟล์อื่น");
  }

  const canvas = document.createElement("canvas");
  canvas.width = 960;
  canvas.height = 540;
  const ctx = canvas.getContext("2d")!;

  onProgress(6, "โหลดโมเดลตรวจจับท่าทาง…");
  const vision = await FilesetResolver.forVisionTasks(WASM_URL);
  const landmarker = await PoseLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
    runningMode: "IMAGE",
    numPoses: 1,
    minPoseDetectionConfidence: MIN_CONFIDENCE,
    minPosePresenceConfidence: MIN_CONFIDENCE,
    minTrackingConfidence: MIN_CONFIDENCE,
  });

  const leftTracker = makeTracker();
  const rightTracker = makeTracker();
  const zoneCounts = { left: initZoneCounts(), right: initZoneCounts() };
  const leftReachList: number[] = [];
  const rightReachList: number[] = [];
  let leftFrameCount = 0;
  let rightFrameCount = 0;
  let analyzedFrames = 0;

  let overlayLeft: { x: number; y: number } | null = null;
  let overlayRight: { x: number; y: number } | null = null;
  let overlayLeftZone: number | null = null;
  let overlayRightZone: number | null = null;
  let currentPhase: AnalysisPhase = "prep";
  let currentActiveZone: ActiveZone | null = null;

  onProgress(10, "กำลังวิเคราะห์ — รอเตรียมพร้อมก่อนเริ่มนับ…");

  await new Promise<void>((resolve) => {
    let lastProgressMs = 0;
    let lastMediaTime = -1;

    const tick: VideoFrameRequestCallback = (_now, { mediaTime }) => {
      if (mediaTime !== lastMediaTime) {
        lastMediaTime = mediaTime;

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        // ── Pose detection ──────────────────────────────────────────
        let leftWrist: { x: number; y: number } | null = null;
        let rightWrist: { x: number; y: number } | null = null;
        let landmarks: NormalizedLandmark[] | null = null;

        try {
          const det = landmarker.detect(canvas);
          landmarks = det.landmarks?.[0] ?? null;
          if (landmarks && landmarks.length >= 17) {
            const lm15 = landmarks[15], lm16 = landmarks[16];
            leftWrist  = lm15 && (lm15.visibility ?? 0) > MIN_CONFIDENCE ? { x: lm15.x, y: lm15.y } : null;
            rightWrist = lm16 && (lm16.visibility ?? 0) > MIN_CONFIDENCE ? { x: lm16.x, y: lm16.y } : null;
          }
        } catch { /* skip bad frame */ }

        // ── Phase detection ─────────────────────────────────────────
        if (landmarks && landmarks.length >= 13) {
          currentPhase = detectPrepPhase(landmarks) ? "prep" : "active";
        }

        // ── Active zone detection (colour analysis) ─────────────────
        currentActiveZone = detectActiveZone(ctx, canvas.width, canvas.height);

        // ── Zone entry counting (only in active phase with a zone lit) ──
        if (currentPhase === "active" && currentActiveZone !== null) {
          const leftInZone  = leftWrist  && wristInZone(leftWrist,  currentActiveZone) ? currentActiveZone.id : null;
          const rightInZone = rightWrist && wristInZone(rightWrist, currentActiveZone) ? currentActiveZone.id : null;

          overlayLeftZone  = tickTracker(leftTracker,  leftInZone,  zoneCounts.left,  leftReachList);
          overlayRightZone = tickTracker(rightTracker, rightInZone, zoneCounts.right, rightReachList);

          if (leftWrist)  leftFrameCount++;
          if (rightWrist) rightFrameCount++;
        } else {
          // Reset tracker candidates when no zone is active or in prep
          overlayLeftZone  = tickTracker(leftTracker,  null, zoneCounts.left,  leftReachList);
          overlayRightZone = tickTracker(rightTracker, null, zoneCounts.right, rightReachList);
        }

        if (leftWrist)  overlayLeft  = leftWrist;
        if (rightWrist) overlayRight = rightWrist;
        analyzedFrames++;

        // ── Progress ────────────────────────────────────────────────
        const now = performance.now();
        if (now - lastProgressMs > 300) {
          lastProgressMs = now;
          const L = Object.values(zoneCounts.left).reduce((a, b) => a + b, 0);
          const R = Object.values(zoneCounts.right).reduce((a, b) => a + b, 0);
          const phaseTh = currentPhase === "prep" ? "[เตรียมพร้อม]" : `ซ้าย ${L} ขวา ${R} ครั้ง`;
          onProgress(
            10 + (mediaTime / durationSec) * 82,
            `เฟรม ${analyzedFrames} · ${mediaTime.toFixed(1)}s / ${durationSec.toFixed(0)}s · ${phaseTh}`,
          );
        }

        onFrame?.(canvas, overlayLeft, overlayRight, overlayLeftZone, overlayRightZone, currentActiveZone, currentPhase);
      }

      if (!video.ended && mediaTime < durationSec - 0.05) {
        video.requestVideoFrameCallback(tick);
      } else {
        resolve();
      }
    };

    video.addEventListener("ended", () => resolve(), { once: true });
    video.requestVideoFrameCallback(tick);
    video.play().catch(() => resolve());
  });

  landmarker.close();
  URL.revokeObjectURL(videoUrl);

  const avgSecPerAnalyzedFrame = analyzedFrames > 0 ? durationSec / analyzedFrames : 0.1;
  const totalActive = leftFrameCount + rightFrameCount;
  const leftUsagePercent  = totalActive > 0 ? (leftFrameCount  / totalActive) * 100 : 50;
  const rightUsagePercent = 100 - leftUsagePercent;
  const leftAvgFramesPerReach  = avgOf(leftReachList);
  const rightAvgFramesPerReach = avgOf(rightReachList);

  const fasterArm: VideoAnalysisResult["fasterArm"] =
    leftAvgFramesPerReach === 0 && rightAvgFramesPerReach === 0 ? "equal"
    : leftAvgFramesPerReach === 0 ? "right"
    : rightAvgFramesPerReach === 0 ? "left"
    : leftAvgFramesPerReach < rightAvgFramesPerReach ? "left"
    : leftAvgFramesPerReach > rightAvgFramesPerReach ? "right"
    : "equal";

  const { logitProbability, dominantArm } = logisticClassify(
    leftFrameCount, rightFrameCount, leftAvgFramesPerReach, rightAvgFramesPerReach,
  );

  onProgress(100, "วิเคราะห์เสร็จสมบูรณ์ ✓");

  return {
    fps: Math.round(analyzedFrames / durationSec),
    durationSec,
    totalSampledFrames: analyzedFrames,
    avgSecPerAnalyzedFrame,
    leftFrameCount,
    rightFrameCount,
    leftUsagePercent,
    rightUsagePercent,
    zoneCounts,
    leftReachCount:  leftReachList.length,
    rightReachCount: rightReachList.length,
    leftAvgFramesPerReach,
    rightAvgFramesPerReach,
    fasterArm,
    logitProbability,
    dominantArm,
  };
}
