export type Kind = "ios-safari" | "android-chrome" | "other";
export function detectPlatform(ua: string): Kind {
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios-safari";
  if (/Android/i.test(ua)) return "android-chrome";
  return "other";
}
