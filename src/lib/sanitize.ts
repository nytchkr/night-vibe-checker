export function sanitizeText(s: string): string {
  return s.replace(/<[^>]*>/g, "").trim().slice(0, 500);
}
