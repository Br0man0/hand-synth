// Caméra + MediaPipe HandLandmarker, entièrement dans le navigateur.
// Version épinglée : changer la version ici change aussi le WASM chargé.
const MP_VERSION = "0.10.35";
const MP_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}`;
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

export class VisionError extends Error {
  constructor(code, cause) {
    super(code);
    this.code = code; // "insecure" | "no-camera-api" | "camera-denied" | "camera-missing" | "camera" | "model"
    this.cause = cause;
  }
}

export async function startCamera(video) {
  if (!window.isSecureContext) throw new VisionError("insecure");
  if (!navigator.mediaDevices?.getUserMedia) throw new VisionError("no-camera-api");
  // En cas de nouvel essai, on libère d'abord le flux précédent.
  video.srcObject?.getTracks().forEach((t) => t.stop());
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
  } catch (e) {
    const code =
      e?.name === "NotAllowedError" ? "camera-denied"
      : e?.name === "NotFoundError" || e?.name === "OverconstrainedError" ? "camera-missing"
      : "camera";
    throw new VisionError(code, e);
  }
  video.srcObject = stream;
  await video.play();
  return stream;
}

export async function createHandTracker() {
  try {
    const { FilesetResolver, HandLandmarker } = await import(`${MP_BASE}/vision_bundle.mjs`);
    const fileset = await FilesetResolver.forVisionTasks(`${MP_BASE}/wasm`);
    const options = (delegate) => ({
      baseOptions: { modelAssetPath: MODEL_URL, delegate },
      runningMode: "VIDEO",
      numHands: 2,
      minHandDetectionConfidence: 0.6,
      minHandPresenceConfidence: 0.6,
      minTrackingConfidence: 0.5,
    });
    let landmarker;
    try {
      landmarker = await HandLandmarker.createFromOptions(fileset, options("GPU"));
    } catch {
      landmarker = await HandLandmarker.createFromOptions(fileset, options("CPU"));
    }
    return landmarker;
  } catch (e) {
    throw new VisionError("model", e);
  }
}
