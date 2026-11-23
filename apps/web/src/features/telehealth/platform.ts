export type Kind = "ios-safari" | "ios-app" | "android-chrome" | "android-app" | "other";
/** In-app WebView (the Kiorex patient app): iOS WebViews carry no "Safari" token, Android WebViews carry "; wv)". */
export function detectPlatform(ua: string): Kind {
  if (/iPhone|iPad|iPod/i.test(ua)) return /Safari/i.test(ua) ? "ios-safari" : "ios-app";
  if (/Android/i.test(ua)) return /;\s*wv\)/i.test(ua) ? "android-app" : "android-chrome";
  return "other";
}
