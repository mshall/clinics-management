export function profileInitials(displayName: string | undefined): string {
  if (!displayName) return "?";
  return displayName
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function avatarGradient(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  const hue = Math.abs(hash) % 360;
  return `linear-gradient(135deg, hsl(${hue} 65% 45%) 0%, hsl(${(hue + 40) % 360} 70% 35%) 100%)`;
}
