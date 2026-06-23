import { useCallback, useEffect, useRef, useState } from "react";
import {
  FilesetResolver,
  PoseLandmarker,
  type NormalizedLandmark,
} from "@mediapipe/tasks-vision";
import type { LandmarkPoint, PoseSnapshot } from "../types";

type CameraStatus =
  | "idle"
  | "requesting-camera"
  | "loading-model"
  | "ready"
  | "error";

function cameraErrorMessage(caught: unknown) {
  if (caught instanceof DOMException) {
    if (caught.name === "NotAllowedError") {
      return "ยังไม่ได้อนุญาตให้ใช้กล้อง กรุณากดอนุญาตในเบราว์เซอร์แล้วลองอีกครั้ง";
    }
    if (caught.name === "NotFoundError") {
      return "ไม่พบกล้องในอุปกรณ์นี้ กรุณาเชื่อมต่อกล้องแล้วลองอีกครั้ง";
    }
    if (caught.name === "NotReadableError") {
      return "กล้องกำลังถูกใช้งานโดยแอปอื่น กรุณาปิดแอปนั้นแล้วลองอีกครั้ง";
    }
  }

  return "ไม่สามารถเริ่มกล้องหรือโมเดลตรวจจับท่าทางได้ กรุณาลองใหม่อีกครั้ง";
}

const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task";

const WASM_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";

const ARM_LINES = [
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
] as const;

const TORSO_LINES = [
  [11, 12],
  [11, 23],
  [12, 24],
  [23, 24],
] as const;

const FACE_POINTS = [0, 2, 5, 9, 10] as const;

function toPoint(landmark: NormalizedLandmark | undefined): LandmarkPoint | undefined {
  if (!landmark) return undefined;
  const confidence = landmark.visibility ?? 0.75;
  return {
    x: landmark.x,
    y: landmark.y,
    z: landmark.z,
    confidence,
  };
}

function quality(points: Array<LandmarkPoint | undefined>) {
  const visible = points.filter((point): point is LandmarkPoint => Boolean(point));
  if (visible.length === 0) return 0;
  return (
    visible.reduce((sum, point) => sum + Math.max(0, Math.min(1, point.confidence)), 0) /
    visible.length
  );
}

function drawPose(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  landmarks: NormalizedLandmark[],
) {
  const context = canvas.getContext("2d");
  if (!context || video.videoWidth === 0 || video.videoHeight === 0) return;

  if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
  }

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.save();
  context.translate(canvas.width, 0);
  context.scale(-1, 1);
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  context.restore();
  context.lineCap = "round";
  context.lineJoin = "round";

  const xOf = (point: NormalizedLandmark) => (1 - point.x) * canvas.width;
  const yOf = (point: NormalizedLandmark) => point.y * canvas.height;

  const drawLine = (
    from: number,
    to: number,
    color = "rgba(242, 202, 118, 0.92)",
    width = 4,
  ) => {
    const a = landmarks[from];
    const b = landmarks[to];
    if (!a || !b) return;
    context.lineWidth = width;
    context.strokeStyle = color;
    context.shadowColor = "rgba(242, 202, 118, 0.58)";
    context.shadowBlur = 10;
    context.beginPath();
    context.moveTo(xOf(a), yOf(a));
    context.lineTo(xOf(b), yOf(b));
    context.stroke();
    context.shadowBlur = 0;
  };

  const drawJoint = (index: number, color = "#f2ca76", radius = 8) => {
    const point = landmarks[index];
    if (!point) return;
    context.fillStyle = color;
    context.beginPath();
    context.arc(xOf(point), yOf(point), radius, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = "rgba(23, 18, 10, 0.86)";
    context.lineWidth = 2;
    context.stroke();
  };

  const drawHandHalo = (index: number, label: string) => {
    const point = landmarks[index];
    if (!point) return;
    const x = xOf(point);
    const y = yOf(point);
    const radius = Math.min(canvas.width, canvas.height) * 0.105;

    context.fillStyle = "rgba(242, 202, 118, 0.12)";
    context.strokeStyle = "rgba(242, 202, 118, 0.86)";
    context.lineWidth = 4;
    context.shadowColor = "rgba(242, 202, 118, 0.58)";
    context.shadowBlur = 16;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.shadowBlur = 0;

    context.font = "800 30px Montserrat, 'Noto Sans Thai', system-ui, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "bottom";
    context.lineWidth = 6;
    context.strokeStyle = "rgba(11, 10, 8, 0.95)";
    context.strokeText(label, x, y - radius - 8);
    context.fillStyle = "#fff0bd";
    context.fillText(label, x, y - radius - 8);

    const dotOffsets = [
      [0, -0.38],
      [-0.2, -0.24],
      [0.2, -0.24],
      [-0.12, 0.02],
      [0.12, 0.02],
    ];
    dotOffsets.forEach(([dx, dy]) => {
      context.fillStyle = "#f2ca76";
      context.beginPath();
      context.arc(x + dx * radius, y + dy * radius, 7, 0, Math.PI * 2);
      context.fill();
    });
  };

  TORSO_LINES.forEach(([from, to]) => {
    drawLine(from, to, "rgba(218, 178, 96, 0.74)", 4);
  });

  ARM_LINES.forEach(([from, to]) => {
    drawLine(from, to, "rgba(242, 202, 118, 0.92)", 5);
  });

  [
    { index: 15, color: "#d5c392" },
    { index: 16, color: "#f2ca76" },
    { index: 11, color: "#201811" },
    { index: 12, color: "#201811" },
    { index: 13, color: "#201811" },
    { index: 14, color: "#201811" },
    { index: 23, color: "#201811" },
    { index: 24, color: "#201811" },
  ].forEach(({ index, color }) => {
    drawJoint(index, color, 8);
  });

  FACE_POINTS.forEach((index) => drawJoint(index, "#f2ca76", 7));
  drawHandHalo(15, "มือซ้าย");
  drawHandHalo(16, "มือขวา");
}

function landmarksToPose(landmarks: NormalizedLandmark[], timestamp: number): PoseSnapshot {
  const nose = toPoint(landmarks[0]);
  const leftEye = toPoint(landmarks[2]);
  const rightEye = toPoint(landmarks[5]);
  const mouthLeft = toPoint(landmarks[9]);
  const mouthRight = toPoint(landmarks[10]);
  const leftShoulder = toPoint(landmarks[11]);
  const rightShoulder = toPoint(landmarks[12]);
  const leftElbow = toPoint(landmarks[13]);
  const rightElbow = toPoint(landmarks[14]);
  const leftWrist = toPoint(landmarks[15]);
  const rightWrist = toPoint(landmarks[16]);
  const leftHip = toPoint(landmarks[23]);
  const rightHip = toPoint(landmarks[24]);

  return {
    timestamp,
    source: "camera",
    nose,
    leftEye,
    rightEye,
    mouthLeft,
    mouthRight,
    leftShoulder,
    rightShoulder,
    leftElbow,
    rightElbow,
    leftWrist,
    rightWrist,
    leftHip,
    rightHip,
    trackingQuality: quality([
      nose,
      leftEye,
      rightEye,
      mouthLeft,
      mouthRight,
      leftShoulder,
      rightShoulder,
      leftElbow,
      rightElbow,
      leftWrist,
      rightWrist,
      leftHip,
      rightHip,
    ]),
  };
}

export function useCameraPose(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
) {
  const [status, setStatus] = useState<CameraStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [latestPose, setLatestPose] = useState<PoseSnapshot | null>(null);
  const landmarkerRef = useRef<PoseLandmarker | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastStateUpdateRef = useRef(0);
  const streamRef = useRef<MediaStream | null>(null);

  const stopLoop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const startLoop = useCallback(() => {
    stopLoop();
    const tick = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const landmarker = landmarkerRef.current;
      if (video && canvas && landmarker && video.readyState >= 2) {
        const now = performance.now();
        const result = landmarker.detectForVideo(video, now);
        const landmarks = result.landmarks?.[0] ?? [];
        drawPose(canvas, video, landmarks);
        if (landmarks.length > 0) {
          if (now - lastStateUpdateRef.current > 45) {
            setLatestPose(landmarksToPose(landmarks, now));
            lastStateUpdateRef.current = now;
          }
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [canvasRef, stopLoop, videoRef]);

  const loadModel = useCallback(async () => {
    if (landmarkerRef.current) return landmarkerRef.current;
    setStatus("loading-model");
    const vision = await FilesetResolver.forVisionTasks(WASM_URL);
    const landmarker = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: MODEL_URL,
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      numPoses: 1,
      minPoseDetectionConfidence: 0.45,
      minPosePresenceConfidence: 0.45,
      minTrackingConfidence: 0.45,
    });
    landmarkerRef.current = landmarker;
    return landmarker;
  }, []);

  const startCamera = useCallback(async () => {
    try {
      setError(null);
      setStatus("requesting-camera");
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: "user",
        },
      });
      streamRef.current = mediaStream;
      setStream(mediaStream);
      const video = videoRef.current;
      if (video) {
        video.srcObject = mediaStream;
        await video.play();
      }
      await loadModel();
      setStatus("ready");
      startLoop();
    } catch (caught) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setStream(null);
      setError(cameraErrorMessage(caught));
      setStatus("error");
    }
  }, [loadModel, startLoop, videoRef]);

  const stopCamera = useCallback(() => {
    stopLoop();
    setLatestPose(null);
    const video = videoRef.current;
    if (video) {
      video.pause();
      video.srcObject = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setStream(null);
    setStatus("idle");
  }, [stopLoop, videoRef]);

  useEffect(() => {
    return () => {
      stopLoop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      void landmarkerRef.current?.close();
      landmarkerRef.current = null;
    };
  }, [stopLoop]);

  return {
    status,
    error,
    stream,
    latestPose,
    startCamera,
    stopCamera,
  };
}
