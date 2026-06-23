import type {
  ArmScore,
  ArmSide,
  AssessmentSession,
  ConsentState,
  LandmarkPoint,
  PatientProfile,
  Point2D,
  PoseSnapshot,
  RiskLabel,
  SessionMetrics,
  TrialPrompt,
  TrialResult,
  TrialSample,
  Zone,
} from "../types";

const clamp = (value: number, min = 0, max = 100) =>
  Math.min(max, Math.max(min, value));

export const ZONES: Zone[] = Array.from({ length: 9 }, (_, index) => {
  const row = Math.floor(index / 3);
  const col = index % 3;
  return {
    id: index + 1,
    label: String(index + 1),
    row,
    col,
    center: {
      x: [0.18, 0.5, 0.82][col],
      y: [0.2, 0.5, 0.8][row],
    },
    radius: 0.15,
  };
});

const ZONE_ORDER = [1, 3, 5, 7, 9, 2, 4, 6, 8, 5, 1, 9];
export function generatePrompts(count = 60): TrialPrompt[] {
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    zoneId: ZONE_ORDER[index % ZONE_ORDER.length],
    side: "free",
  }));
}

export function getZone(zoneId: number) {
  return ZONES.find((zone) => zone.id === zoneId) ?? ZONES[4];
}

export function distance(a: Point2D, b: Point2D) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function isInsideZone(point: Point2D | undefined, zone: Zone) {
  if (!point) return false;
  return distance(point, zone.center) <= zone.radius;
}

export function sideLabel(side: ArmSide) {
  if (side === "left") return "แขนซ้าย";
  if (side === "right") return "แขนขวา";
  if (side === "both") return "ทั้งสองแขน";
  return "ใช้แขนใดก็ได้";
}

export function chooseResolvedSide(
  prompt: TrialPrompt,
  samples: TrialSample[],
): "left" | "right" | "both" | "unknown" {
  if (prompt.side === "left" || prompt.side === "right") return prompt.side;
  if (prompt.side === "both") return "both";

  const zone = getZone(prompt.zoneId);
  let leftMin = Number.POSITIVE_INFINITY;
  let rightMin = Number.POSITIVE_INFINITY;

  samples.forEach((sample) => {
    if (sample.leftWrist) {
      leftMin = Math.min(leftMin, distance(sample.leftWrist, zone.center));
    }
    if (sample.rightWrist) {
      rightMin = Math.min(rightMin, distance(sample.rightWrist, zone.center));
    }
  });

  if (!Number.isFinite(leftMin) && !Number.isFinite(rightMin)) return "unknown";
  if (!Number.isFinite(leftMin)) return "right";
  if (!Number.isFinite(rightMin)) return "left";
  return leftMin <= rightMin ? "left" : "right";
}

function wristForSide(
  sample: TrialSample,
  resolvedSide: "left" | "right" | "both" | "unknown",
) {
  if (resolvedSide === "left") return sample.leftWrist;
  if (resolvedSide === "right") return sample.rightWrist;
  if (resolvedSide === "unknown") return undefined;
  if (!sample.leftWrist || !sample.rightWrist) return undefined;
  return {
    x: (sample.leftWrist.x + sample.rightWrist.x) / 2,
    y: (sample.leftWrist.y + sample.rightWrist.y) / 2,
    confidence: Math.min(sample.leftWrist.confidence, sample.rightWrist.confidence),
  } satisfies LandmarkPoint;
}

function scoreSpeed(durationMs: number) {
  return clamp(105 - ((durationMs - 700) / 4300) * 100);
}

function scoreAccuracy(minDistance: number, zone: Zone) {
  return clamp(100 - (minDistance / Math.max(zone.radius, 0.001)) * 55);
}

function calculatePath(points: Point2D[]) {
  if (points.length < 2) return { pathLength: 0, direct: 0, efficiency: 100 };

  const pathLength = points.slice(1).reduce((sum, point, index) => {
    return sum + distance(points[index], point);
  }, 0);
  const direct = distance(points[0], points[points.length - 1]);
  const efficiency = pathLength <= 0 ? 100 : clamp((direct / pathLength) * 100);
  return { pathLength, direct, efficiency };
}

function smoothness(points: Point2D[]) {
  if (points.length < 4) return { smoothnessScore: 86, tremorProxy: 0.04 };

  const changes: number[] = [];
  for (let index = 2; index < points.length; index += 1) {
    const a = points[index - 2];
    const b = points[index - 1];
    const c = points[index];
    const v1 = { x: b.x - a.x, y: b.y - a.y };
    const v2 = { x: c.x - b.x, y: c.y - b.y };
    changes.push(Math.hypot(v2.x - v1.x, v2.y - v1.y));
  }

  const meanChange =
    changes.reduce((sum, value) => sum + value, 0) / Math.max(changes.length, 1);
  return {
    smoothnessScore: clamp(100 - meanChange * 900),
    tremorProxy: meanChange,
  };
}

function hesitationMs(points: Point2D[], samples: TrialSample[]) {
  if (points.length < 2 || samples.length < 2) return 0;
  const origin = points[0];
  const movementIndex = points.findIndex((point) => distance(point, origin) > 0.035);
  if (movementIndex <= 0) return 0;
  return samples[Math.min(movementIndex, samples.length - 1)].timestamp - samples[0].timestamp;
}

export function finalizeTrial(
  prompt: TrialPrompt,
  samples: TrialSample[],
  trialStartMs: number,
  completedAtMs: number,
  completed = true,
): TrialResult {
  const zone = getZone(prompt.zoneId);
  const resolvedSide = chooseResolvedSide(prompt, samples);
  const trackedSamples = samples.filter((sample) => wristForSide(sample, resolvedSide));
  const points = trackedSamples
    .map((sample) => wristForSide(sample, resolvedSide))
    .filter((point): point is LandmarkPoint => Boolean(point));

  const minDistance =
    points.length > 0
      ? Math.min(...points.map((point) => distance(point, zone.center)))
      : 1;
  const finalDistance =
    points.length > 0 ? distance(points[points.length - 1], zone.center) : 1;
  const trackingQuality =
    trackedSamples.reduce((sum, sample) => sum + sample.trackingQuality, 0) /
    Math.max(trackedSamples.length, 1);
  const { efficiency } = calculatePath(points);
  const motion = smoothness(points);
  const durationMs = Math.max(0, completedAtMs - trialStartMs);
  const reactionMs = hesitationMs(points, trackedSamples);
  const actualCompleted = completed && points.length > 0;
  const accuracyScore = actualCompleted ? scoreAccuracy(minDistance, zone) : 0;
  const speedScore = actualCompleted ? scoreSpeed(durationMs) : 0;
  const qualityScore = actualCompleted
    ? clamp(efficiency * 0.48 + motion.smoothnessScore * 0.42 + trackingQuality * 10)
    : 0;

  return {
    promptId: prompt.id,
    zoneId: prompt.zoneId,
    assignedSide: prompt.side,
    resolvedSide,
    completed: actualCompleted,
    reactionMs,
    durationMs,
    minDistance,
    finalDistance,
    accuracyScore,
    speedScore,
    qualityScore,
    pathEfficiency: efficiency,
    smoothnessScore: motion.smoothnessScore,
    hesitationMs: reactionMs,
    tremorProxy: motion.tremorProxy,
    trackingQuality,
  };
}

function average(values: number[], fallback = 0) {
  if (values.length === 0) return fallback;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function armScore(trials: TrialResult[], promptsTotal: number): ArmScore {
  const completed = trials.filter((trial) => trial.completed);
  const speed = average(completed.map((trial) => trial.speedScore), 0);
  const accuracy = average(completed.map((trial) => trial.accuracyScore), 0);
  const quality = average(completed.map((trial) => trial.qualityScore), 0);
  const completion = promptsTotal > 0 ? (completed.length / promptsTotal) * 100 : 0;
  const composite = clamp(speed * 0.28 + accuracy * 0.3 + quality * 0.27 + completion * 0.15);

  return {
    speed,
    accuracy,
    quality,
    completion,
    composite,
    promptCount: promptsTotal,
    completedCount: completed.length,
    averageReactionMs: average(completed.map((trial) => trial.reactionMs), 0),
  };
}

function heatmapForSide(trials: TrialResult[], side: "left" | "right") {
  const map: Record<number, number> = {};
  ZONES.forEach((zone) => {
    map[zone.id] = 0;
  });

  trials.forEach((trial) => {
    if (trial.resolvedSide === side || trial.resolvedSide === "both") {
      map[trial.zoneId] = (map[trial.zoneId] ?? 0) + 1;
    }
  });

  return map;
}

function reportFor(metrics: Omit<SessionMetrics, "report" | "followUp">) {
  const weakerSide =
    metrics.left.composite <= metrics.right.composite ? "left" : "right";
  const strongerSide = weakerSide === "left" ? "right" : "left";
  const weakerSideTh = weakerSide === "left" ? "แขนซ้าย" : "แขนขวา";
  const strongerSideTh = strongerSide === "left" ? "แขนซ้าย" : "แขนขวา";
  const riskPhrase =
    metrics.riskLabel === "Good"
      ? "พบความเสี่ยง Learned Non-Use ต่ำในการคัดกรองครั้งนี้"
      : metrics.riskLabel === "Moderate"
        ? "พบความไม่สมดุลระดับปานกลาง ควรติดตามในการทดสอบครั้งถัดไป"
        : "พบความไม่สมดุลชัดเจนและรูปแบบการใช้งานลดลง ควรให้ผู้เชี่ยวชาญประเมินต่อ";

  return {
    report: [
      `คะแนนคัดกรองรวมอยู่ที่ ${Math.round(metrics.overallScore)}/100: ${riskPhrase}`,
      `${weakerSideTh} มีคะแนนต่ำกว่า ${strongerSideTh} อยู่ ${Math.round(
        metrics.asymmetry,
      )} คะแนน`,
      `คุณภาพการติดตาม landmark เฉลี่ย ${Math.round(metrics.trackingQuality)}% ความเชื่อมั่นของข้อมูลอยู่ในระดับ ${
        metrics.trackingQuality >= 70 ? "เหมาะสมสำหรับการติดตามที่บ้าน" : "จำกัด ควรทดสอบซ้ำในสภาพแสงที่ดีขึ้น"
      }`,
    ],
    followUp: [
      `ทดสอบ 9 ช่องซ้ำและเปรียบเทียบการทำครบ ความเร็ว และความแม่นยำของ${weakerSideTh}`,
      `เพิ่มการฝึกกิจวัตรประจำวันแบบ task-specific โดยเอื้อมไปทาง${weakerSideTh}ในท่านั่งที่ปลอดภัย`,
      "ส่งต่อให้นักกายภาพบำบัดหากมีอาการปวด เหนื่อยมาก เวียนศีรษะ หรืออ่อนแรงเฉียบพลัน",
    ],
  };
}

export function scoreSession(
  trials: TrialResult[],
  promptsTotal: number,
): SessionMetrics {
  const leftTrials = trials.filter(
    (trial) => trial.resolvedSide === "left" || trial.resolvedSide === "both",
  );
  const rightTrials = trials.filter(
    (trial) => trial.resolvedSide === "right" || trial.resolvedSide === "both",
  );
  const leftPrompts = Math.max(1, leftTrials.length);
  const rightPrompts = Math.max(1, rightTrials.length);
  const left = armScore(leftTrials, leftPrompts);
  const right = armScore(rightTrials, rightPrompts);
  const completed = trials.filter((trial) => trial.completed);
  const leftUse = leftTrials.length;
  const rightUse = rightTrials.length;
  const totalUse = Math.max(1, leftUse + rightUse);
  const leftUsagePercent = (leftUse / totalUse) * 100;
  const rightUsagePercent = (rightUse / totalUse) * 100;
  const asymmetry = Math.abs(left.composite - right.composite);
  const weakerScore = Math.min(left.composite, right.composite);
  const usageGap = Math.abs(leftUsagePercent - rightUsagePercent);
  const learnedNonUseRiskIndex = clamp(
    asymmetry * 0.7 + (100 - weakerScore) * 0.24 + usageGap * 0.35,
  );
  const riskLabel: RiskLabel =
    learnedNonUseRiskIndex >= 45
      ? "Needs More Practice"
      : learnedNonUseRiskIndex >= 23
        ? "Moderate"
        : "Good";
  const completionRate = promptsTotal > 0 ? (completed.length / promptsTotal) * 100 : 0;
  const base = {
    overallScore: clamp((left.composite + right.composite) / 2),
    left,
    right,
    leftUsagePercent,
    rightUsagePercent,
    asymmetry,
    learnedNonUseRiskIndex,
    riskLabel,
    trackingQuality: average(completed.map((trial) => trial.trackingQuality * 100), 0),
    completionRate,
    heatmap: {
      left: heatmapForSide(trials, "left"),
      right: heatmapForSide(trials, "right"),
    },
  };
  return {
    ...base,
    ...reportFor(base),
  };
}

export function buildSession(params: {
  profile: PatientProfile;
  consent: ConsentState;
  source: "camera" | "demo";
  startedAtMs: number;
  endedAtMs: number;
  trials: TrialResult[];
  promptsTotal: number;
  videoRecorded: boolean;
}): AssessmentSession {
  return {
    id: `S-${Date.now().toString(36).toUpperCase()}`,
    patientId: params.profile.id,
    patientProfile: params.profile,
    createdAt: new Date().toISOString(),
    promptsTotal: params.promptsTotal,
    durationMs: Math.max(0, params.endedAtMs - params.startedAtMs),
    trials: params.trials,
    metrics: scoreSession(params.trials, params.promptsTotal),
    consent: params.consent,
    videoRecorded: params.videoRecorded,
    source: params.source,
  };
}

export function makeDemoPose(
  nowMs: number,
  prompt: TrialPrompt,
  trialStartMs: number,
): PoseSnapshot {
  const zone = getZone(prompt.zoneId);
  const elapsed = Math.max(0, nowMs - trialStartMs);
  const sideDelay = prompt.side === "right" ? 120 : prompt.side === "both" ? 90 : 70;
  const duration = prompt.side === "right" ? 860 : prompt.side === "both" ? 780 : 640;
  const progress = Math.min(1, Math.max(0, (elapsed - sideDelay) / duration));
  const eased = 1 - Math.pow(1 - progress, 3);
  const wiggle = Math.sin(nowMs / 55) * 0.006;
  const leftHome = { x: 0.34, y: 0.68 };
  const rightHome = { x: 0.66, y: 0.68 };
  const target = zone.center;

  const move = (home: Point2D, active: boolean, bias = 0) => ({
    x: active ? home.x + (target.x - home.x) * eased + wiggle + bias : home.x,
    y: active ? home.y + (target.y - home.y) * eased + Math.abs(wiggle) : home.y,
    confidence: 0.95,
  });

  const freePrefersRight = prompt.side === "free" && prompt.id % 3 === 0;
  const leftActive =
    prompt.side === "left" || prompt.side === "both" || (prompt.side === "free" && !freePrefersRight);
  const rightActive =
    prompt.side === "right" || prompt.side === "both" || (prompt.side === "free" && freePrefersRight);
  const leftWrist = move(leftHome, leftActive, prompt.side === "free" ? -0.006 : 0);
  const rightWrist = move(rightHome, rightActive, 0.008);

  return {
    timestamp: nowMs,
    source: "demo",
    nose: { x: 0.5 + wiggle * 0.45, y: 0.29, confidence: 0.97 },
    leftEye: { x: 0.47 + wiggle * 0.3, y: 0.27, confidence: 0.96 },
    rightEye: { x: 0.53 + wiggle * 0.3, y: 0.27, confidence: 0.96 },
    mouthLeft: { x: 0.475, y: 0.32, confidence: 0.94 },
    mouthRight: { x: 0.525, y: 0.32, confidence: 0.94 },
    leftShoulder: { x: 0.41, y: 0.42, confidence: 0.97 },
    rightShoulder: { x: 0.59, y: 0.42, confidence: 0.97 },
    leftElbow: {
      x: (0.41 + leftWrist.x) / 2 - 0.035,
      y: (0.48 + leftWrist.y) / 2,
      confidence: 0.94,
    },
    rightElbow: {
      x: (0.59 + rightWrist.x) / 2 + 0.035,
      y: (0.48 + rightWrist.y) / 2,
      confidence: 0.94,
    },
    leftWrist,
    rightWrist,
    leftHip: { x: 0.43, y: 0.79, confidence: 0.94 },
    rightHip: { x: 0.57, y: 0.79, confidence: 0.94 },
    trackingQuality: 0.94,
  };
}

export function isPromptReached(prompt: TrialPrompt, pose: PoseSnapshot | null) {
  if (!pose) return { reached: false, resolvedSide: undefined as undefined | "left" | "right" | "both" };
  const zone = getZone(prompt.zoneId);
  const leftIn = isInsideZone(pose.leftWrist, zone);
  const rightIn = isInsideZone(pose.rightWrist, zone);

  if (prompt.side === "left") return { reached: leftIn, resolvedSide: "left" as const };
  if (prompt.side === "right") return { reached: rightIn, resolvedSide: "right" as const };
  if (prompt.side === "both") {
    return { reached: leftIn && rightIn, resolvedSide: "both" as const };
  }

  if (leftIn || rightIn) {
    return {
      reached: true,
      resolvedSide: leftIn ? ("left" as const) : ("right" as const),
    };
  }

  return { reached: false, resolvedSide: undefined };
}
