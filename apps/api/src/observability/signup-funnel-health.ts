/** Public signup: verified OTP challenges vs completed signups in a window. */
export type SignupFunnelCounts = {
  otpVerified: number;
  signupsCompleted: number;
};

export const SIGNUP_FUNNEL_MIN_OTP_VERIFIED = 10;
export const SIGNUP_FUNNEL_COMPLETION_RATE_MIN = 0.5;

export function signupCompletionRate(counts: SignupFunnelCounts): number | null {
  if (counts.otpVerified < 1) return null;
  return counts.signupsCompleted / counts.otpVerified;
}

export function shouldAlertSignupFunnelDrop(counts: SignupFunnelCounts): boolean {
  if (counts.otpVerified < SIGNUP_FUNNEL_MIN_OTP_VERIFIED) return false;
  const rate = signupCompletionRate(counts);
  return rate !== null && rate < SIGNUP_FUNNEL_COMPLETION_RATE_MIN;
}