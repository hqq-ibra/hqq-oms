import { OrderStatus, OrderType } from './enums';

export const NEW_MOLD_FLOW: OrderStatus[] = [
  OrderStatus.NEW,
  OrderStatus.SAMPLE_RECEIVED,
  OrderStatus.CAD_DRAWING_READY,
  OrderStatus.SENT_TO_FACTORY,
  OrderStatus.MOLD_READY,
  OrderStatus.SILICONE_CASTING,
  OrderStatus.SHIPPED_FROM_FACTORY,
  OrderStatus.RECEIVED_LOCALLY,
  OrderStatus.SHIPPED_TO_CUSTOMER,
  OrderStatus.COMPLETED,
];

export const REPEAT_FLOW: OrderStatus[] = [
  OrderStatus.NEW,
  OrderStatus.SENT_TO_FACTORY,
  OrderStatus.SILICONE_CASTING,
  OrderStatus.SHIPPED_FROM_FACTORY,
  OrderStatus.RECEIVED_LOCALLY,
  OrderStatus.SHIPPED_TO_CUSTOMER,
  OrderStatus.COMPLETED,
];

export function getWorkflow(type: OrderType): OrderStatus[] {
  return type === OrderType.NEW_MOLD ? NEW_MOLD_FLOW : REPEAT_FLOW;
}

export function getAllowedTransitions(
  type: OrderType,
  currentStatus: OrderStatus,
): OrderStatus[] {
  const flow = getWorkflow(type);
  const idx = flow.indexOf(currentStatus);
  if (idx === -1 || idx >= flow.length - 1) return [];
  return [flow[idx + 1]];
}

export function isValidTransition(
  type: OrderType,
  from: OrderStatus,
  to: OrderStatus,
): boolean {
  return getAllowedTransitions(type, from).includes(to);
}

export const STATUS_LABELS: Record<OrderStatus, string> = {
  [OrderStatus.NEW]: 'New',
  [OrderStatus.SAMPLE_RECEIVED]: 'Sample Received',
  [OrderStatus.CAD_DRAWING_READY]: 'CAD Drawing Ready',
  [OrderStatus.SENT_TO_FACTORY]: 'Sent to Factory',
  [OrderStatus.MOLD_READY]: 'Mold Ready',
  [OrderStatus.SILICONE_CASTING]: 'Silicone Casting',
  [OrderStatus.SHIPPED_FROM_FACTORY]: 'Shipped from Factory',
  [OrderStatus.RECEIVED_LOCALLY]: 'Received Locally',
  [OrderStatus.SHIPPED_TO_CUSTOMER]: 'Shipped to Customer',
  [OrderStatus.COMPLETED]: 'Completed',
};
