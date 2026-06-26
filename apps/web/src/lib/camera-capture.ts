type PhotoCapabilitiesLike = {
  imageWidth?: { max?: number };
  imageHeight?: { max?: number };
};

type ImageCaptureLike = {
  takePhoto(settings?: { imageWidth?: number; imageHeight?: number }): Promise<Blob>;
  getPhotoCapabilities(): Promise<PhotoCapabilitiesLike>;
};

const JPEG_CAPTURE_QUALITY = 0.97;

const VIDEO_CONSTRAINTS: MediaTrackConstraints[] = [
  {
    facingMode: { ideal: "environment" },
    width: { ideal: 4096, min: 1920 },
    height: { ideal: 3072, min: 1080 },
  },
  {
    facingMode: { ideal: "environment" },
    width: { ideal: 3840, min: 1280 },
    height: { ideal: 2160, min: 720 },
  },
  {
    facingMode: { ideal: "environment" },
    width: { ideal: 1920 },
    height: { ideal: 1080 },
  },
  { facingMode: { ideal: "environment" } },
  true as unknown as MediaTrackConstraints,
];

export async function openCameraStream(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Camera is not available in this browser.");
  }

  let lastError: unknown;
  for (const video of VIDEO_CONSTRAINTS) {
    try {
      return await navigator.mediaDevices.getUserMedia({ video, audio: false });
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Could not access the camera.");
}

async function captureWithImageCapture(track: MediaStreamTrack): Promise<File | null> {
  const ImageCaptureCtor = (window as Window & { ImageCapture?: new (t: MediaStreamTrack) => ImageCaptureLike })
    .ImageCapture;
  if (!ImageCaptureCtor) return null;

  try {
    const capture = new ImageCaptureCtor(track);
    const caps = await capture.getPhotoCapabilities();
    const settings: { imageWidth?: number; imageHeight?: number } = {};

    const maxW = caps.imageWidth?.max;
    const maxH = caps.imageHeight?.max;
    if (maxW && maxH) {
      settings.imageWidth = Math.min(maxW, 4096);
      settings.imageHeight = Math.min(maxH, 3072);
    }

    const blob = await capture.takePhoto(settings);
    if (!blob?.size) return null;

    const type = blob.type?.startsWith("image/") ? blob.type : "image/jpeg";
    return new File([blob], `camera-capture-${Date.now()}.jpg`, { type });
  } catch {
    return null;
  }
}

async function captureFromVideoFrameAsync(video: HTMLVideoElement): Promise<File> {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) throw new Error("Camera is not ready.");

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported.");

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(video, 0, 0, w, h);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", JPEG_CAPTURE_QUALITY),
  );
  if (!blob) throw new Error("Failed to encode captured image.");

  return new File([blob], `camera-capture-${Date.now()}.jpg`, { type: "image/jpeg" });
}

export async function captureStillPhoto(
  stream: MediaStream,
  video: HTMLVideoElement,
): Promise<File> {
  const track = stream.getVideoTracks()[0];
  if (track) {
    const fromImageCapture = await captureWithImageCapture(track);
    if (fromImageCapture) return fromImageCapture;
  }

  return captureFromVideoFrameAsync(video);
}
