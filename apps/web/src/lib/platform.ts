/** Mobile browsers: use native OS camera via file input instead of getUserMedia preview. */
export function shouldUseNativeCameraPicker(): boolean {
  if (typeof window === "undefined") return false;
  const ua = navigator.userAgent;
  const mobileUa = /Android|iPhone|iPad|iPod/i.test(ua);
  const coarseTouch =
    window.matchMedia("(pointer: coarse)").matches && navigator.maxTouchPoints > 0;
  const narrow = window.matchMedia("(max-width: 768px)").matches;
  return mobileUa || (coarseTouch && narrow);
}
