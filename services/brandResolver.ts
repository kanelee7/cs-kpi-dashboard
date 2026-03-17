import type { ZendeskTicket } from './zendeskClient';

export const SUPPORTED_BRANDS = [
  'arena-z',
  'league-of-kingdoms',
  'lok-chronicle',
  'lok-hunters',
  'the-new-order',
] as const;

const BRAND_ALIAS_MAP: Record<string, string[]> = {
  'arena-z': ['arena-z', 'arena_z', '[az]', ' az ', 'brand-d'],
  'league-of-kingdoms': ['league of kingdoms', 'lok', 'lok_global', 'brand-a'],
  'lok-chronicle': ['lok chronicle', 'lokc', 'chronicle', 'brand-b'],
  'lok-hunters': ['lok hunters', 'lokh', 'hunters', 'brand-c'],
  'the-new-order': ['the new order', 'new order', 'tno', 'brand-e'],
};

const LEGACY_BRAND_BY_CANONICAL: Record<string, string> = {
  'arena-z': 'brand-d',
  'league-of-kingdoms': 'brand-a',
  'lok-chronicle': 'brand-b',
  'lok-hunters': 'brand-c',
  'the-new-order': 'brand-e',
};

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizeBrandId(value: string | null | undefined): string | null {
  if (!value) return null;
  const raw = normalize(value);
  if (raw === 'all') return 'all';
  for (const [brand, aliases] of Object.entries(BRAND_ALIAS_MAP)) {
    if (raw === brand || aliases.some(alias => normalize(alias) === raw)) {
      return brand;
    }
  }
  return null;
}

export function getBrandQueryValues(canonicalBrand: string): string[] {
  const values = new Set<string>([canonicalBrand]);
  const legacy = LEGACY_BRAND_BY_CANONICAL[canonicalBrand];
  if (legacy) values.add(legacy);
  return Array.from(values);
}

function collectSearchTokens(ticket: ZendeskTicket): string[] {
  const tokens: string[] = [];
  tokens.push(ticket.subject ?? '');
  tokens.push(ticket.description ?? '');
  (ticket.tags ?? []).forEach(tag => tokens.push(tag));

  for (const field of ticket.custom_fields ?? []) {
    const value = field?.value;
    if (typeof value === 'string' && value.trim() !== '') {
      tokens.push(value);
    }
  }

  return tokens.map(normalize);
}

export function resolveTicketBrand(ticket: ZendeskTicket): string {
  const maybeBrand = (ticket as unknown as { brand?: unknown }).brand;
  if (typeof maybeBrand === 'string' && maybeBrand.trim() !== '') {
    return normalizeBrandId(maybeBrand) ?? 'unknown';
  }

  const tokens = collectSearchTokens(ticket);
  for (const [brand, aliases] of Object.entries(BRAND_ALIAS_MAP)) {
    for (const alias of aliases) {
      const normalizedAlias = normalize(alias);
      if (tokens.some(token => token.includes(normalizedAlias))) {
        return brand;
      }
    }
  }

  return 'unknown';
}

export function groupTicketsByBrand(tickets: ZendeskTicket[]): Map<string, ZendeskTicket[]> {
  const grouped = new Map<string, ZendeskTicket[]>();
  for (const ticket of tickets) {
    const brand = resolveTicketBrand(ticket);
    const bucket = grouped.get(brand);
    if (bucket) {
      bucket.push(ticket);
    } else {
      grouped.set(brand, [ticket]);
    }
  }
  return grouped;
}
