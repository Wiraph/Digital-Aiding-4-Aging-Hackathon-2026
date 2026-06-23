import type { LandmarkPoint, PoseSnapshot } from "../types";

export function mirrorPoint<T extends LandmarkPoint | undefined>(point: T): T {
  if (!point) return point;
  return { ...point, x: 1 - point.x } as T;
}

export function mirrorPoseForDisplay(pose: PoseSnapshot | null) {
  if (!pose) return null;
  return {
    ...pose,
    nose: mirrorPoint(pose.nose),
    leftEye: mirrorPoint(pose.leftEye),
    rightEye: mirrorPoint(pose.rightEye),
    mouthLeft: mirrorPoint(pose.mouthLeft),
    mouthRight: mirrorPoint(pose.mouthRight),
    leftShoulder: mirrorPoint(pose.leftShoulder),
    rightShoulder: mirrorPoint(pose.rightShoulder),
    leftElbow: mirrorPoint(pose.leftElbow),
    rightElbow: mirrorPoint(pose.rightElbow),
    leftWrist: mirrorPoint(pose.leftWrist),
    rightWrist: mirrorPoint(pose.rightWrist),
    leftHip: mirrorPoint(pose.leftHip),
    rightHip: mirrorPoint(pose.rightHip),
  } satisfies PoseSnapshot;
}
