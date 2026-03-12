const NEW_MOLD_FLOW = [
  'NEW',
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
  'NEW',
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

export function isValidTransition(
  orderType: string,
  currentStatus: string,
  newStatus: string,
): boolean {
  const flow = FLOWS[orderType];
  if (!flow) return false;

  const currentIdx = flow.indexOf(currentStatus);
  const newIdx = flow.indexOf(newStatus);

  if (currentIdx === -1 || newIdx === -1) return false;
  return newIdx === currentIdx + 1;
}
