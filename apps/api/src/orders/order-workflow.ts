const NEW_MOLD_FLOW = [
  'QUOTATION',
  'CONFIRMED',
  'SAMPLE_RECEIVED',
  'CAD_DRAWING_READY',
  'SENT_TO_FACTORY',
  'MOLD_READY',
  'SILICONE_CASTING',
  'SHIPPED_FROM_FACTORY',
  'RECEIVED_LOCALLY',
  'SHIPPED_TO_CUSTOMER',
  'COMPLETED',
] as const;

const REPEAT_FLOW = [
  'QUOTATION',
  'CONFIRMED',
  'SENT_TO_FACTORY',
  'SILICONE_CASTING',
  'SHIPPED_FROM_FACTORY',
  'RECEIVED_LOCALLY',
  'SHIPPED_TO_CUSTOMER',
  'COMPLETED',
] as const;

const FLOWS: Record<string, readonly string[]> = {
  NEW_MOLD: NEW_MOLD_FLOW,
  REPEAT: REPEAT_FLOW,
};

/**
 * A quote the customer declined. Off-flow and terminal: it is in neither flow
 * array, so nothing transitions out of it.
 */
export const REJECTED = 'REJECTED';

export function isValidTransition(
  orderType: string,
  currentStatus: string,
  newStatus: string,
): boolean {
  const flow = FLOWS[orderType];
  if (!flow) return false;

  // The one exception to the linear rule: a quotation can be declined.
  if (currentStatus === 'QUOTATION' && newStatus === REJECTED) return true;

  const currentIdx = flow.indexOf(currentStatus);
  const newIdx = flow.indexOf(newStatus);

  if (currentIdx === -1 || newIdx === -1) return false;
  return newIdx === currentIdx + 1;
}
