export function formatDisplayName(name?: string | null, email?: string | null): string {
  const raw = (name || email || '').trim();
  if (!raw) return 'Teammate';

  const base = raw.includes('@') ? raw.split('@')[0] : raw;
  const normalized = base.replace(/[._-]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!normalized) return base.trim();

  const hasUpper = /[A-Z]/.test(normalized);
  const hasLower = /[a-z]/.test(normalized);
  if (hasUpper && hasLower && normalized.includes(' ')) {
    return normalized.trim();
  }

  return normalized
    .split(' ')
    .filter(Boolean)
    .map((word) => word[0]?.toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}
