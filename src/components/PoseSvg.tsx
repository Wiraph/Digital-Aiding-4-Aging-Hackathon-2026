import type { LandmarkPoint, PoseSnapshot } from "../types";
import { mirrorPoseForDisplay } from "../lib/pose";

export function PoseSvg({
  pose,
  showFallback = true,
  clinical = false,
}: {
  pose: PoseSnapshot | null;
  showFallback?: boolean;
  clinical?: boolean;
}) {
  const point = (item: LandmarkPoint | undefined) =>
    item ? { x: item.x * 100, y: item.y * 100, confidence: item.confidence } : null;
  const line = (
    a: LandmarkPoint | undefined,
    b: LandmarkPoint | undefined,
    className = "pose-line",
  ) => {
    const start = point(a);
    const end = point(b);
    if (!start || !end) return null;
    const isTorso = className === "torso-line";
    return (
      <line
        className={className}
        strokeDasharray={isTorso ? "0" : `${Math.max(0.8, 2.8 - Math.min(start.confidence, end.confidence) * 1.4)} 1.2`}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        x1={start.x}
        x2={end.x}
        y1={start.y}
        y2={end.y}
      />
    );
  };

  if (!pose && !showFallback) return null;

  const fallback: PoseSnapshot = {
    source: "demo",
    timestamp: 0,
    nose: { x: 0.5, y: 0.29, confidence: 0.82 },
    leftEye: { x: 0.47, y: 0.27, confidence: 0.8 },
    rightEye: { x: 0.53, y: 0.27, confidence: 0.8 },
    mouthLeft: { x: 0.48, y: 0.34, confidence: 0.76 },
    mouthRight: { x: 0.52, y: 0.34, confidence: 0.76 },
    leftShoulder: { x: 0.36, y: 0.45, confidence: 0.9 },
    rightShoulder: { x: 0.64, y: 0.45, confidence: 0.9 },
    leftElbow: { x: 0.3, y: 0.59, confidence: 0.86 },
    rightElbow: { x: 0.7, y: 0.59, confidence: 0.86 },
    leftWrist: { x: 0.28, y: 0.7, confidence: 0.82 },
    rightWrist: { x: 0.72, y: 0.7, confidence: 0.82 },
    leftHip: { x: 0.42, y: 0.78, confidence: 0.84 },
    rightHip: { x: 0.58, y: 0.78, confidence: 0.84 },
    trackingQuality: 0.82,
  };

  const active = mirrorPoseForDisplay(pose) ?? fallback;
  const joints = [
    active.leftShoulder,
    active.rightShoulder,
    active.leftElbow,
    active.rightElbow,
    active.leftWrist,
    active.rightWrist,
    active.leftHip,
    active.rightHip,
    active.nose,
  ];
  const facePoints = [
    active.nose,
    active.leftEye,
    active.rightEye,
    active.mouthLeft,
    active.mouthRight,
  ];

  const handOverlay = (
    item: LandmarkPoint | undefined,
    label: string,
    className: string,
  ) => {
    const stylePoint = point(item);
    if (!stylePoint) return null;
    const isLeft = className === "left-hand";
    const labelX = Math.min(90, Math.max(10, stylePoint.x + (isLeft ? -8 : 8)));
    const labelAnchor = isLeft ? "end" : "start";
    const dots = [
      { dx: -2.8, dy: -1.5, r: 0.95 },
      { dx: -1.1, dy: -2.5, r: 1.05 },
      { dx: 1.1, dy: -2.5, r: 1.05 },
      { dx: 2.8, dy: -1.5, r: 0.95 },
      { dx: -1.9, dy: 1.2, r: 1.15 },
      { dx: 0, dy: 0.5, r: 1.8 },
      { dx: 1.9, dy: 1.2, r: 1.15 },
    ];

    return (
      <g className={`hand-cluster ${className}`}>
        <circle
          className="hand-aura"
          cx={stylePoint.x}
          cy={stylePoint.y}
          r={clinical ? "7.2" : "5.6"}
          vectorEffect="non-scaling-stroke"
        />
        <circle
          className="hand-halo"
          cx={stylePoint.x}
          cy={stylePoint.y}
          r={clinical ? "8.8" : "6.8"}
          vectorEffect="non-scaling-stroke"
        />
        <g className="hand-dots">
          {dots.map((dot, index) => (
            <circle
              className="hand-dot"
              cx={stylePoint.x + dot.dx}
              cy={stylePoint.y + dot.dy}
              key={`${className}-${index}`}
              r={dot.r}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </g>
        <rect
          className="hand-label-bg"
          height="4.8"
          rx="2.4"
          width="13.2"
          x={labelAnchor === "end" ? labelX - 13.2 : labelX}
          y={Math.max(4.6, stylePoint.y - 14)}
        />
        <text
          className="hand-label"
          dominantBaseline="middle"
          textAnchor={labelAnchor}
          x={labelX}
          y={Math.max(7, stylePoint.y - 11.6)}
        >
          {label}
        </text>
      </g>
    );
  };

  return (
    <svg
      aria-hidden="true"
      className={`pose-svg ${clinical ? "pose-svg--clinical" : ""}`}
      preserveAspectRatio="none"
      viewBox="0 0 100 100"
    >
      <g className="torso-layer">
        {line(active.leftShoulder, active.rightShoulder, "torso-line")}
        {line(active.leftShoulder, active.leftHip, "torso-line")}
        {line(active.rightShoulder, active.rightHip, "torso-line")}
        {line(active.leftHip, active.rightHip, "torso-line")}
      </g>
      <g className="limb-layer">
        {line(active.leftShoulder, active.leftElbow)}
        {line(active.leftElbow, active.leftWrist)}
        {line(active.rightShoulder, active.rightElbow)}
        {line(active.rightElbow, active.rightWrist)}
      </g>
      <g className="joint-layer">
        {joints.map((joint, index) => {
          const stylePoint = point(joint);
          if (!stylePoint) return null;
          return (
            <circle
              className="pose-joint"
              cx={stylePoint.x}
              cy={stylePoint.y}
              key={index}
              r={joint === active.nose ? 1.8 : 2.35}
              vectorEffect="non-scaling-stroke"
            />
          );
        })}
      </g>
      <g className="face-layer">
        {facePoints.map((facePoint, index) => {
          const stylePoint = point(facePoint);
          if (!stylePoint) return null;
          return (
            <circle
              className="face-node"
              cx={stylePoint.x}
              cy={stylePoint.y}
              fill="#f2ca76"
              key={index}
              r="1.25"
              stroke="rgba(24,19,12,.72)"
              strokeWidth="0.3"
              vectorEffect="non-scaling-stroke"
            />
          );
        })}
      </g>
      {handOverlay(active.leftWrist, "มือซ้าย", "left-hand")}
      {handOverlay(active.rightWrist, "มือขวา", "right-hand")}
    </svg>
  );
}
