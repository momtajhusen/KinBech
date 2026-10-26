/** Reasons an admin can pick when rejecting a listing; the seller sees the text. */
export const LISTING_REJECT_REASONS = [
  'Photos do not show the real item.',
  'This item is not allowed on KinBech.',
  'The price looks wrong or misleading.',
  'Phone numbers or links are not allowed in the description.',
  'This is a duplicate of another listing.',
];

export const heldReason = (listing) =>
  String(listing?.moderationReason || '').replace(/\s*Held for manual review\.?\s*$/i, '').trim();
