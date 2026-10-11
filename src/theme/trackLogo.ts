/** Unique fallback "logo" colors and initials for a track with no artwork. */

export function trackInitials(title: string): string {
  const words = title
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0 && !/^(the|a|an|ft\.?|feat\.?|&)$/i.test(word));
  if (words.length === 0) {
    return '?';
  }
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }
  return `${words[0][0]}${words[1][0]}`.toUpperCase();
}

function hashSeed(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function trackLogoColors(title: string, artist: string): readonly [string, string] {
  const hash = hashSeed(`${artist}|${title}`.toLowerCase());
  const hue = hash % 360;
  const hue2 = (hue + 38 + (hash % 48)) % 360;
  return [`hsl(${hue}, 74%, 44%)`, `hsl(${hue2}, 70%, 22%)`];
}
