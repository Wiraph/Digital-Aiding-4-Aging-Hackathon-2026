import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
} from "react";
import { Camera, CheckCircle2, HeartPulse, Home, LayoutDashboard, Play } from "lucide-react";
import { AnimatePresence, MotionConfig } from "framer-motion";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { PROMPT_COUNT, defaultConsent, ui, type PatientStage, type Role } from "./app/ui";
import { PageWrapper } from "./components/PageWrapper";
import { useCameraPose } from "./hooks/useCameraPose";
import {
  buildSession,
  finalizeTrial,
  generatePrompts,
  getZone,
  isPromptReached,
  makeDemoPose,
  sideLabel,
} from "./lib/assessment";
import {
  defaultProfile,
  deleteSession,
  loadSessions,
  saveProfile,
  saveSession,
} from "./lib/storage";
import {
  normalizePatientId,
  normalizePatientProfile,
  sessionTime,
} from "./lib/patient";
import { mirrorPoseForDisplay } from "./lib/pose";
import { DashboardPage } from "./pages/DashboardPage";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { AssessmentPage } from "./pages/AssessmentPage";
import { VideoUploadZone } from "./components/VideoUploadZone";
import type {
  AssessmentSession,
  ConsentState,
  PatientProfile,
  PoseSnapshot,
  TrialResult,
  TrialSample,
} from "./types";

function poseSample(pose: PoseSnapshot): TrialSample {
  return {
    timestamp: pose.timestamp,
    leftWrist: pose.leftWrist,
    rightWrist: pose.rightWrist,
    trackingQuality: pose.trackingQuality,
  };
}

function armsRaised(pose: PoseSnapshot | null) {
  if (!pose?.leftWrist || !pose.rightWrist || !pose.leftShoulder || !pose.rightShoulder) {
    return false;
  }
  const leftRaised = pose.leftWrist.y < pose.leftShoulder.y - 0.02;
  const rightRaised = pose.rightWrist.y < pose.rightShoulder.y - 0.02;
  return leftRaised && rightRaised && pose.trackingQuality > 0.45;
}

function calibrationReadiness(pose: PoseSnapshot | null) {
  return {
    face: Boolean(pose?.nose || (pose?.leftEye && pose.rightEye)),
    torso: Boolean(pose?.leftShoulder && pose.rightShoulder && pose.leftHip && pose.rightHip),
    leftHand: Boolean(pose?.leftWrist && pose.leftWrist.confidence > 0.35),
    rightHand: Boolean(pose?.rightWrist && pose.rightWrist.confidence > 0.35),
  };
}

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const role: Role = location.pathname.startsWith("/dashboard") ? "doctor" : "patient";
  const initialSessions = useMemo(() => {
    return loadSessions();
  }, []);
  const prompts = useMemo(() => generatePrompts(PROMPT_COUNT), []);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const assessmentStageRef = useRef<HTMLDivElement | null>(null);
  const camera = useCameraPose(videoRef, canvasRef);

  const [stage, setStage] = useState<PatientStage>("login");
  const [consent, setConsent] = useState<ConsentState>(defaultConsent);
  const [profile, setProfile] = useState<PatientProfile>(defaultProfile);
  const currentProfile = normalizePatientProfile(profile);
  const currentPatientId = normalizePatientId(currentProfile.id);
  const [sessions, setSessions] = useState<AssessmentSession[]>(initialSessions);
  const [activeSessionId, setActiveSessionId] = useState(
    initialSessions.find((session) => normalizePatientId(session.patientId) === currentPatientId)?.id ?? "",
  );
  const [demoMode, setDemoMode] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [trialResults, setTrialResults] = useState<TrialResult[]>([]);
  const [trialElapsed, setTrialElapsed] = useState(0);
  const [holdReady, setHoldReady] = useState(false);
  const [paused, setPaused] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [isCameraFullscreen, setIsCameraFullscreen] = useState(false);
  const [calibrationProgress, setCalibrationProgress] = useState(0);
  const [livePose, setLivePose] = useState<PoseSnapshot | null>(null);
  const [cameraFeedReady, setCameraFeedReady] = useState(false);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [cameraConsentAccepted, setCameraConsentAccepted] = useState(false);
  const [showCameraConsent, setShowCameraConsent] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);

  const latestCameraPoseRef = useRef<PoseSnapshot | null>(null);
  const resultsRef = useRef<TrialResult[]>([]);
  const samplesRef = useRef<TrialSample[]>([]);
  const trialStartRef = useRef(0);
  const assessmentStartRef = useRef(0);
  const holdStartRef = useRef<number | null>(null);
  const completionLockRef = useRef(false);
  const calibrationStartRef = useRef<number | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const videoRecordedRef = useRef(false);
  const assessmentProfileRef = useRef<PatientProfile>(normalizePatientProfile(profile));

  const patientSessions = useMemo(
    () =>
      sessions
        .filter((session) => normalizePatientId(session.patientId) === currentPatientId)
        .sort((a, b) => sessionTime(b) - sessionTime(a)),
    [currentPatientId, sessions],
  );
  const activeSession =
    patientSessions.find((session) => session.id === activeSessionId) ?? patientSessions[0] ?? null;
  const currentPrompt = prompts[currentIndex];
  const readiness = calibrationReadiness(camera.latestPose);
  const progressPercent = ((currentIndex + 1) / prompts.length) * 100;
  const targetHighlight = Math.min(0.75, trialElapsed / 5200);
  const activeZone = getZone(currentPrompt.zoneId);
  const activeZoneStyle = {
    left: `${activeZone.col * 33.3333}%`,
    top: `${activeZone.row * 33.3333}%`,
  } as CSSProperties;

  useEffect(() => {
    if (!patientSessions.some((session) => session.id === activeSessionId)) {
      setActiveSessionId(patientSessions[0]?.id ?? "");
    }
  }, [activeSessionId, patientSessions]);

  useEffect(() => {
    latestCameraPoseRef.current = camera.latestPose;
  }, [camera.latestPose]);

  useEffect(() => {
    if (!camera.stream || demoMode) {
      setCameraFeedReady(false);
      return;
    }

    const video = videoRef.current;
    if (!video) return;

    if (video.srcObject !== camera.stream) {
      video.srcObject = camera.stream;
    }
    video.muted = true;
    video.playsInline = true;

    const playVideo = async () => {
      try {
        await video.play();
        setCameraFeedReady(video.readyState >= 2);
      } catch {
        setCameraFeedReady(false);
      }
    };

    setCameraFeedReady(video.readyState >= 2);
    void playVideo();
  }, [camera.stream, demoMode, stage]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsCameraFullscreen(document.fullscreenElement === assessmentStageRef.current);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  const toggleCameraFullscreen = useCallback(async () => {
    const stageElement = assessmentStageRef.current;
    if (!stageElement) return;
    try {
      if (document.fullscreenElement === stageElement || isCameraFullscreen) {
        if (document.fullscreenElement === stageElement) {
          await document.exitFullscreen();
        }
        setIsCameraFullscreen(false);
        return;
      }
      await stageElement.requestFullscreen();
      setIsCameraFullscreen(true);
    } catch {
      setIsCameraFullscreen((current) => !current);
    }
  }, [isCameraFullscreen]);

  const handleCameraSurfaceClick = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      const target = event.target;
      if (target instanceof HTMLElement && target.closest("button")) return;
      void toggleCameraFullscreen();
    },
    [toggleCameraFullscreen],
  );

  const refreshSessions = useCallback((session?: AssessmentSession) => {
    const stored = loadSessions();
    const next = stored.length > 0 ? stored : session ? [session] : [];
    setSessions(next);
    setActiveSessionId((current) => {
      if (session) return session.id;
      const currentPatientSessions = next.filter(
        (item) => normalizePatientId(item.patientId) === normalizePatientId(profile.id),
      );
      return currentPatientSessions.some((item) => item.id === current)
        ? current
        : currentPatientSessions[0]?.id ?? "";
    });
  }, [profile.id]);

  const stopRecorder = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    if (recorder.state !== "inactive") recorder.stop();
    recorderRef.current = null;
  }, []);

  const startRecorder = useCallback(() => {
    if (!consent.rawVideo || !camera.stream || typeof MediaRecorder === "undefined") return;
    try {
      recordedChunksRef.current = [];
      const options = MediaRecorder.isTypeSupported("video/webm")
        ? { mimeType: "video/webm" }
        : undefined;
      const recorder = new MediaRecorder(camera.stream, options);
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) recordedChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        if (recordedChunksRef.current.length === 0) return;
        const blob = new Blob(recordedChunksRef.current, { type: "video/webm" });
        setRecordedUrl((current) => {
          if (current) URL.revokeObjectURL(current);
          return URL.createObjectURL(blob);
        });
      };
      recorder.start(700);
      recorderRef.current = recorder;
      videoRecordedRef.current = true;
    } catch {
      videoRecordedRef.current = false;
    }
  }, [camera.stream, consent.rawVideo]);

  const finishSession = useCallback(
    (results: TrialResult[], endedAtMs: number, source: "camera" | "demo") => {
      stopRecorder();
      const sessionProfile = normalizePatientProfile(assessmentProfileRef.current);
      const session = buildSession({
        profile: sessionProfile,
        consent,
        source,
        startedAtMs: assessmentStartRef.current,
        endedAtMs,
        trials: results,
        promptsTotal: prompts.length,
        videoRecorded: videoRecordedRef.current,
      });

      if (consent.localData) {
        saveSession(session);
      }
      if (document.fullscreenElement === assessmentStageRef.current) {
        void document.exitFullscreen();
      }
      refreshSessions(session);
      setActiveSessionId(session.id);
      setStage("results");
      navigate("/patient");
      setLivePose(null);
      camera.stopCamera();
    },
    [camera, consent, navigate, prompts.length, refreshSessions, stopRecorder],
  );

  const finishVideoSession = useCallback(
    (session: AssessmentSession) => {
      if (consent.localData) saveSession(session);
      refreshSessions(session);
      setActiveSessionId(session.id);
      setStage("results");
      navigate("/patient");
    },
    [consent.localData, navigate, refreshSessions],
  );

  const beginAssessment = useCallback(
    (forceDemo = false) => {
      const sourceIsDemo = forceDemo || camera.status !== "ready";
      setDemoMode(sourceIsDemo);
      setPaused(false);
      setTrialResults([]);
      resultsRef.current = [];
      setCurrentIndex(0);
      setTrialElapsed(0);
      setHoldReady(false);
      samplesRef.current = [];
      trialStartRef.current = performance.now();
      assessmentStartRef.current = performance.now();
      holdStartRef.current = null;
      completionLockRef.current = false;
      videoRecordedRef.current = false;
      if (!sourceIsDemo) startRecorder();
      setStage("assessment");
    },
    [camera.status, startRecorder],
  );

  const completeCurrentTrial = useCallback(
    (completedAtMs: number, completed = true) => {
      if (completionLockRef.current) return;
      completionLockRef.current = true;
      const prompt = prompts[currentIndex];
      const samples = samplesRef.current;
      const result = finalizeTrial(prompt, samples, trialStartRef.current, completedAtMs, completed);
      const nextResults = [...resultsRef.current, result];
      resultsRef.current = nextResults;
      setTrialResults(nextResults);

      if (currentIndex >= prompts.length - 1) {
        finishSession(nextResults, completedAtMs, demoMode ? "demo" : "camera");
        return;
      }

      setCurrentIndex((index) => index + 1);
    },
    [currentIndex, demoMode, finishSession, prompts],
  );

  const completeRemainingWithDemo = useCallback(() => {
    const now = performance.now();
    const synthetic: TrialResult[] = [];
    prompts.slice(currentIndex).forEach((prompt, offset) => {
      const start = now + offset * 920;
      const samples = Array.from({ length: 12 }, (_, index) =>
        poseSample(makeDemoPose(start + index * 82, prompt, start)),
      );
      synthetic.push(finalizeTrial(prompt, samples, start, start + 920));
    });
    const next = [...resultsRef.current, ...synthetic];
    resultsRef.current = next;
    setTrialResults(next);
    finishSession(next, now + synthetic.length * 920, "demo");
  }, [currentIndex, finishSession, prompts]);

  useEffect(() => {
    if (stage !== "assessment") return;
    trialStartRef.current = performance.now();
    samplesRef.current = [];
    holdStartRef.current = null;
    completionLockRef.current = false;
    setTrialElapsed(0);
    setHoldReady(false);
  }, [currentIndex, stage]);

  useEffect(() => {
    if (stage !== "assessment" || paused) return;
    let frame = 0;
    let lastSampleAt = 0;
    let lastUiAt = 0;

    const tick = () => {
      const now = performance.now();
      const prompt = prompts[currentIndex];
      const pose = demoMode
        ? makeDemoPose(now, prompt, trialStartRef.current)
        : mirrorPoseForDisplay(latestCameraPoseRef.current);

      if (pose) {
        if (demoMode || now - lastUiAt > 90) {
          setLivePose(pose);
        }

        if (now - lastSampleAt > 65) {
          samplesRef.current.push(poseSample(pose));
          lastSampleAt = now;
        }

        const reached = isPromptReached(prompt, pose).reached;
        if (reached) {
          if (holdStartRef.current === null) holdStartRef.current = now;
          if (now - holdStartRef.current > 240) {
            completeCurrentTrial(now);
          }
        } else {
          holdStartRef.current = null;
        }
        setHoldReady(reached);
      }

      if (now - lastUiAt > 85) {
        setTrialElapsed(now - trialStartRef.current);
        lastUiAt = now;
      }

      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [completeCurrentTrial, currentIndex, demoMode, paused, prompts, stage]);

  useEffect(() => {
    if (stage !== "calibration" || camera.status !== "ready") return;
    const pose = camera.latestPose;
    const now = performance.now();
    if (armsRaised(pose)) {
      if (calibrationStartRef.current === null) calibrationStartRef.current = now;
      const progress = Math.min(1, (now - calibrationStartRef.current) / 2200);
      setCalibrationProgress(progress);
      if (progress >= 1) beginAssessment(false);
    } else {
      calibrationStartRef.current = null;
      setCalibrationProgress(0);
    }
  }, [beginAssessment, camera.latestPose, camera.status, stage]);

  useEffect(() => {
    if (stage !== "assessment" || !voiceEnabled || !currentPrompt) return;
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(
      `${sideLabel(currentPrompt.side)} ไปยังช่อง ${currentPrompt.zoneId}`,
    );
    utterance.rate = 0.88;
    utterance.pitch = 0.95;
    window.speechSynthesis.speak(utterance);
    return () => window.speechSynthesis.cancel();
  }, [currentPrompt, stage, voiceEnabled]);

  function updateProfile(next: Partial<PatientProfile>) {
    setProfile((current) => ({ ...current, ...next }));
  }

  function commitCurrentProfile() {
    const nextProfile = normalizePatientProfile(profile);
    assessmentProfileRef.current = nextProfile;
    setProfile(nextProfile);
    setActiveSessionId((current) => {
      const matchingSession = sessions.find(
        (session) => normalizePatientId(session.patientId) === normalizePatientId(nextProfile.id),
      );
      return matchingSession?.id ?? "";
    });
    if (consent.localData) saveProfile(nextProfile);
    return nextProfile;
  }

  function submitProfile() {
    commitCurrentProfile();
    setMenuVisible(true);
    setStage("calibration");
  }

  function startDemoFromProfile() {
    commitCurrentProfile();
    setMenuVisible(true);
    beginAssessment(true);
  }

  function requestCameraStart() {
    if (!cameraConsentAccepted) {
      setShowCameraConsent(true);
      return;
    }
    void camera.startCamera();
  }

  function acceptCameraConsent() {
    setCameraConsentAccepted(true);
    setShowCameraConsent(false);
    void camera.startCamera();
  }

  function removeSession(sessionId: string) {
    deleteSession(sessionId);
    const next = sessions.filter((session) => session.id !== sessionId);
    setSessions(next);
    const nextCurrentSession = next.find(
      (session) => normalizePatientId(session.patientId) === currentPatientId,
    );
    setActiveSessionId(nextCurrentSession?.id ?? "");
  }

  function handleLogin(patientId: string) {
    const matchingSessions = sessions
      .filter((s) => s.patientId.trim().toLowerCase() === patientId.toLowerCase())
      .sort((a, b) => sessionTime(b) - sessionTime(a));
    const lastSession = matchingSessions[0];
    if (lastSession) {
      setProfile({ ...lastSession.patientProfile, id: patientId });
      setActiveSessionId(lastSession.id);
      setMenuVisible(true);
      navigate("/dashboard");
    } else {
      setProfile({ ...defaultProfile, id: patientId });
      setStage("profile");
    }
  }

  function resetPatientFlow() {
    setStage("calibration");
    setTrialResults([]);
    resultsRef.current = [];
    setCurrentIndex(0);
    setTrialElapsed(0);
    setLivePose(null);
    setRecordedUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
  }

  function goHome() {
    navigate("/patient");
    resetPatientFlow();
  }

  return (
    <MotionConfig reducedMotion="never">
    <main className={ui.appShell}>
      <header className={ui.topbar}>
        <div className={ui.brandLockup}>
          <span className={ui.brandMark}>
            <HeartPulse size={24} strokeWidth={2.4} />
          </span>
          <div>
            <h1 className="brand-title">
              เอื้อมไหม
              <span className="en-sub">UemMai · Arm Reach Assessment</span>
            </h1>
          </div>
        </div>
        {menuVisible ? (
          <nav className={ui.nav} aria-label="สลับบทบาทการใช้งาน">
            <button
              className={`${ui.navButton} ${role === "patient" ? ui.navActive : ""}`}
              onClick={goHome}
              type="button"
            >
              <Home size={18} />
              Home
            </button>
            <button
              className={`${ui.navButton} ${role === "doctor" ? ui.navActive : ""}`}
              onClick={() => navigate("/dashboard")}
              type="button"
            >
              <LayoutDashboard size={18} />
              Dashboard
            </button>
          </nav>
        ) : null}
      </header>

      {showCameraConsent ? (
        <div
          className="fixed inset-0 z-[900] grid place-items-center bg-black/65 p-5 backdrop-blur"
          role="presentation"
        >
          <section
            aria-labelledby="camera-consent-title"
            aria-modal="true"
            className="marble-card unveil-card w-[min(520px,100%)] p-6"
            role="dialog"
          >
            <div className="mb-3.5 grid h-[50px] w-[50px] place-items-center rounded-lg bg-[#2f281d] text-[#f2ca76]">
              <Camera size={24} />
            </div>
            <h2 id="camera-consent-title" className="mb-2.5 text-[1.6rem] font-bold leading-tight">
              อนุญาตให้ใช้กล้องสำหรับการทดสอบ
            </h2>
            <p className="mb-[18px] leading-relaxed text-[#3f3324]">
              ระบบจะใช้กล้องเพื่อตรวจจับใบหน้า ลำตัว และตำแหน่งข้อมือแบบเรียลไทม์
              การประมวลผลเกิดในเครื่องนี้ และจะบันทึกข้อมูลตามตัวเลือกที่ยินยอมด้านล่างเท่านั้น
            </p>
            <div className="mb-5 grid gap-3 rounded-2xl bg-[#f4efe3] p-4 text-sm font-bold text-[#2f281d]">
              <label className="flex items-start gap-3">
                <input
                  checked={consent.localData}
                  className="mt-1 h-4 w-4"
                  onChange={(event) =>
                    setConsent((current) => ({ ...current, localData: event.target.checked }))
                  }
                  type="checkbox"
                />
                <span>บันทึกโปรไฟล์และผลสรุปไว้ในอุปกรณ์นี้</span>
              </label>
              <label className="flex items-start gap-3">
                <input
                  checked={consent.rawVideo}
                  className="mt-1 h-4 w-4"
                  onChange={(event) =>
                    setConsent((current) => ({ ...current, rawVideo: event.target.checked }))
                  }
                  type="checkbox"
                />
                <span>บันทึกวิดีโอของรอบทดสอบนี้</span>
              </label>
            </div>
            <div className={ui.row}>
              <button className={ui.primaryButton} onClick={acceptCameraConsent} type="button">
                <CheckCircle2 size={20} />
                อนุญาตและเริ่มกล้อง
              </button>
              <button
                className={ui.secondaryButton}
                onClick={() => setShowCameraConsent(false)}
                type="button"
              >
                ยกเลิก
              </button>
            </div>
          </section>
        </div>
      ) : null}

      <AnimatePresence mode="wait">
        <Routes location={location} key={location.pathname}>
          <Route path="/" element={<Navigate replace to="/patient" />} />
          <Route
            path="/patient"
            element={
              <PageWrapper>
                <section className="min-h-[calc(100vh-89px)]">
                  <AnimatePresence initial={false} mode="wait">
          {stage === "login" ? (
            <LoginPage sessions={sessions} onLogin={handleLogin} />
          ) : null}

          {stage === "profile" ? (
            <HomePage
              onSubmitProfile={submitProfile}
              profile={profile}
              updateProfile={updateProfile}
            />
          ) : null}

          {stage === "video-upload" ? (
            <VideoUploadZone
              profile={assessmentProfileRef.current}
              consent={consent}
              onComplete={finishVideoSession}
              onBack={() => setStage("calibration")}
            />
          ) : null}

          {stage !== "login" && stage !== "profile" && stage !== "video-upload" ? (
            <AssessmentPage
              activeSession={activeSession}
              activeZoneStyle={activeZoneStyle}
              assessmentStageRef={assessmentStageRef}
              beginAssessment={beginAssessment}
              calibrationProgress={calibrationProgress}
              camera={camera}
              cameraFeedReady={cameraFeedReady}
              canvasRef={canvasRef}
              completeCurrentTrial={completeCurrentTrial}
              currentIndex={currentIndex}
              currentPrompt={currentPrompt}
              demoMode={demoMode}
              finishSession={finishSession}
              handleCameraSurfaceClick={handleCameraSurfaceClick}
              holdReady={holdReady}
              isCameraFullscreen={isCameraFullscreen}
              livePose={livePose}
              onOpenDashboard={() => navigate("/dashboard")}
              paused={paused}
              progressPercent={progressPercent}
              promptsLength={prompts.length}
              readiness={readiness}
              recordedUrl={recordedUrl}
              requestCameraStart={requestCameraStart}
              resetPatientFlow={resetPatientFlow}
              resultsRef={resultsRef}
              setCameraFeedReady={setCameraFeedReady}
              setDemoMode={setDemoMode}
              setPaused={setPaused}
              setVoiceEnabled={setVoiceEnabled}
              stage={stage}
              targetHighlight={targetHighlight}
              toggleCameraFullscreen={toggleCameraFullscreen}
              trialElapsed={trialElapsed}
              trialResultsLength={trialResults.length}
              videoRef={videoRef}
              voiceEnabled={voiceEnabled}
              onStartVideoUpload={() => {
                commitCurrentProfile();
                setStage("video-upload");
              }}
            />
          ) : null}

                  </AnimatePresence>
                </section>
              </PageWrapper>
            }
          />
          <Route
            path="/dashboard"
            element={
              <PageWrapper>
                <DashboardPage
                  activeSession={activeSession}
                  activeSessionId={activeSessionId}
                  currentPatientId={currentPatientId}
                  currentProfile={currentProfile}
                  onRemoveSession={removeSession}
                  onSelectSession={setActiveSessionId}
                  onStartAssessment={goHome}
                  patientSessions={patientSessions}
                />
              </PageWrapper>
            }
          />
          <Route path="*" element={<Navigate replace to="/patient" />} />
        </Routes>
      </AnimatePresence>
    </main>
    </MotionConfig>
  );
}

