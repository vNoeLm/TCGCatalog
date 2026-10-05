/**
 * How a marketplace card gets from seller to buyer. Sellers pick which of these they offer per
 * listing (ListCardModal); buyers choose one of those at checkout. Shared by the cart drawer and
 * the hold-request API so both agree on what each method needs.
 */

export type HandoverMethodId = 'personal' | 'foxpost' | 'packeta' | 'gls' | 'posta' | 'other';

/** What the buyer has to provide for a method. */
export type HandoverKind = 'personal' | 'locker' | 'address' | 'custom';

export interface HandoverMethod {
  id: HandoverMethodId;
  label: string;
  kind: HandoverKind;
  /** For lockers and pickup points: where the buyer can look theirs up. */
  finderUrl?: string;
}

export const HANDOVER_METHODS: HandoverMethod[] = [
  { id: 'personal', label: 'In person', kind: 'personal' },
  { id: 'foxpost', label: 'Foxpost', kind: 'locker', finderUrl: 'https://foxpost.hu/csomagautomatak' },
  { id: 'packeta', label: 'Packeta', kind: 'locker', finderUrl: 'https://www.packeta.hu/atvevohelyek' },
  { id: 'gls', label: 'GLS', kind: 'address' },
  { id: 'posta', label: 'Magyar Posta', kind: 'address' },
  { id: 'other', label: 'Other', kind: 'custom' },
];

export const ALL_HANDOVER_IDS: HandoverMethodId[] = HANDOVER_METHODS.map((m) => m.id);

export function handoverMethod(id: string | null | undefined): HandoverMethod | undefined {
  // 'pickup' is what older requests stored for in-person.
  const normalized = id === 'pickup' ? 'personal' : id;
  return HANDOVER_METHODS.find((m) => m.id === normalized);
}

export function handoverLabel(id: string | null | undefined): string {
  return handoverMethod(id)?.label || 'Other';
}

/** A listing's methods, treating a missing or empty list (older listings) as "all of them". */
export function listingHandoverIds(methods: readonly string[] | null | undefined): HandoverMethodId[] {
  const known = (methods || []).map((m) => handoverMethod(m)?.id).filter(Boolean) as HandoverMethodId[];
  return known.length > 0 ? known : ALL_HANDOVER_IDS;
}

/**
 * Methods every one of these listings supports - a request covers all of a seller's cards in the
 * cart, so it can only use a method each of them was listed with.
 */
export function sharedHandoverIds(lists: (readonly string[] | null | undefined)[]): HandoverMethodId[] {
  return ALL_HANDOVER_IDS.filter((id) => lists.every((list) => listingHandoverIds(list).includes(id)));
}

/** Where a shipped order goes. Kept in one shape so it can be remembered between checkouts. */
export interface DeliveryDetails {
  recipientName: string;
  phone: string;
  /** Foxpost locker name / ID. */
  foxpostLocker: string;
  /** Packeta pickup point name / ID. */
  packetaPoint: string;
  postalCode: string;
  city: string;
  street: string;
}

export const EMPTY_DELIVERY: DeliveryDetails = {
  recipientName: '',
  phone: '',
  foxpostLocker: '',
  packetaPoint: '',
  postalCode: '',
  city: '',
  street: '',
};

/** The fields a method needs filled in, or null if it needs none from the delivery form. */
export function missingDeliveryFields(methodId: string, d: DeliveryDetails): string[] | null {
  const m = handoverMethod(methodId);
  if (!m || (m.kind !== 'locker' && m.kind !== 'address')) return null;
  const missing: string[] = [];
  if (!d.recipientName.trim()) missing.push('recipient name');
  if (!d.phone.trim()) missing.push('phone number');
  if (m.id === 'foxpost' && !d.foxpostLocker.trim()) missing.push('Foxpost locker');
  if (m.id === 'packeta' && !d.packetaPoint.trim()) missing.push('Packeta pickup point');
  if (m.kind === 'address') {
    if (!d.postalCode.trim()) missing.push('postal code');
    if (!d.city.trim()) missing.push('city');
    if (!d.street.trim()) missing.push('street address');
  }
  return missing;
}

/**
 * The handover details a seller sees on the request (Seller Hub and the chat): only what the
 * chosen method needs, one fact per line. In person has none - that's arranged in the chat.
 */
export function formatHandoverDetails(methodId: string, d: DeliveryDetails, customText = ''): string {
  const m = handoverMethod(methodId);
  if (!m || m.kind === 'personal') return '';
  if (m.kind === 'custom') return customText.trim();
  const lines = [`Recipient: ${d.recipientName.trim()}`, `Phone: ${d.phone.trim()}`];
  if (m.id === 'foxpost') lines.push(`Foxpost locker: ${d.foxpostLocker.trim()}`);
  if (m.id === 'packeta') lines.push(`Packeta pickup point: ${d.packetaPoint.trim()}`);
  if (m.kind === 'address') lines.push(`Address: ${d.postalCode.trim()} ${d.city.trim()}, ${d.street.trim()}`);
  return lines.join('\n');
}
