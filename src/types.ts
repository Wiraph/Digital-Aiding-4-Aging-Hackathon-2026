export type ArmSide = "left" | "right" | "free" | "both";

export type RiskLabel = "Good" | "Moderate" | "Needs More Practice";

export type Sex = "female" | "male" | "other" | "prefer-not";

export interface Point2D {
  x: number;
  y: number;
}

export interface LandmarkPoint extends Point2D {
  z?: number;
  confidence: number;
}

export interface PoseSnapshot {
  timestamp: number;
  source: "camera" | "demo";
  nose?: LandmarkPoint;
  leftEye?: LandmarkPoint;
  rightEye?: LandmarkPoint;
  mouthLeft?: LandmarkPoint;
  mouthRight?: LandmarkPoint;
  leftShoulder?: LandmarkPoint;
  rightShoulder?: LandmarkPoint;
  leftElbow?: LandmarkPoint;
  rightElbow?: LandmarkPoint;
  leftWrist?: LandmarkPoint;
  rightWrist?: LandmarkPoint;
  leftHip?: LandmarkPoint;
  rightHip?: LandmarkPoint;
  trackingQuality: number;
}

export interface Zone {
  id: number;
  label: string;
  row: number;
  col: number;
  center: Point2D;
  radius: number;
}

export interface TrialPrompt {
  id: number;
  zoneId: number;
  side: ArmSide;
}

export interface TrialSample {
  timestamp: number;
  leftWrist?: LandmarkPoint;
  rightWrist?: LandmarkPoint;
  trackingQuality: number;
}

export interface TrialResult {
  promptId: number;
  zoneId: number;
  assignedSide: ArmSide;
  resolvedSide: "left" | "right" | "both" | "unknown";
  completed: boolean;
  reactionMs: number;
  durationMs: number;
  minDistance: number;
  finalDistance: number;
  accuracyScore: number;
  speedScore: number;
  qualityScore: number;
  pathEfficiency: number;
  smoothnessScore: number;
  hesitationMs: number;
  tremorProxy: number;
  trackingQuality: number;
}

export interface ArmScore {
  speed: number;
  accuracy: number;
  quality: number;
  completion: number;
  composite: number;
  promptCount: number;
  completedCount: number;
  averageReactionMs: number;
}

export interface SessionMetrics {
  overallScore: number;
  left: ArmScore;
  right: ArmScore;
  leftUsagePercent: number;
  rightUsagePercent: number;
  asymmetry: number;
  learnedNonUseRiskIndex: number;
  riskLabel: RiskLabel;
  trackingQuality: number;
  completionRate: number;
  heatmap: {
    left: Record<number, number>;
    right: Record<number, number>;
  };
  report: string[];
  followUp: string[];
}

export interface PatientProfile {
  id: string;
  name: string;
  age: number;
  sex: Sex;
  chronicDiseases: string;
  preferredArm: "left" | "right" | "unknown";
}

export interface ConsentState {
  camera: boolean;
  localData: boolean;
  rawVideo: boolean;
}

export interface AssessmentSession {
  id: string;
  patientId: string;
  patientProfile: PatientProfile;
  createdAt: string;
  promptsTotal: number;
  durationMs: number;
  trials: TrialResult[];
  metrics: SessionMetrics;
  consent: ConsentState;
  videoRecorded: boolean;
  source: "camera" | "demo" | "video";
  videoAnalysis?: VideoAnalysisResult;
}

export interface VideoAnalysisResult {
  fps: number;
  durationSec: number;
  totalSampledFrames: number;
  /** Seconds of video time each analyzed frame represents (varies by playback method). */
  avgSecPerAnalyzedFrame: number;
  leftFrameCount: number;
  rightFrameCount: number;
  leftUsagePercent: number;
  rightUsagePercent: number;
  zoneCounts: { left: Record<number, number>; right: Record<number, number> };
  leftReachCount: number;
  rightReachCount: number;
  leftAvgFramesPerReach: number;
  rightAvgFramesPerReach: number;
  fasterArm: "left" | "right" | "equal";
  logitProbability: number;
  dominantArm: "left" | "right" | "ambidextrous";
}
