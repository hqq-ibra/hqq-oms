export interface ProductDemandRow {
  productId: string;
  sku: string;
  nameEn: string;
  inventory: number;
  customers: number;
  stockGap: boolean;
}

export interface CatalogueHealth {
  totalProducts: number;
  productsWithoutCustomer: number;
  productsWithoutDrawing: number;
  totalLinks: number;
}

export interface CostBreakdownRow {
  month: string;
  costType: string;
  currency: string;
  total: number;
  count: number;
}

export interface MonthlyMoneyRow {
  month: string;
  currency: string;
  revenue: number;
  cost: number;
  margin: number | null;
  marginPct: number | null;
}

export interface CustomerBreadthRow {
  customerId: string;
  customerCode: string;
  name: string;
  products: number;
}

export type CustomerSegment = 'ACTIVE' | 'AT_RISK' | 'DORMANT' | 'NEVER_ORDERED';

export interface CustomerSegmentRow {
  customerId: string;
  customerCode: string;
  name: string;
  lastOrderAt: string | null;
  daysSinceLastOrder: number | null;
  segment: CustomerSegment;
}

export interface CycleTimeRow {
  orderId: string;
  orderNumber: string;
  days: number;
}

export interface StatusDwellRow {
  status: string;
  averageDays: number;
  samples: number;
}

export interface OverdueOrderRow {
  orderId: string;
  orderNumber: string;
  customerName: string;
  expectedDeliveryDate: string;
  daysOverdue: number;
}

export interface FactoryLeadTimeRow {
  factoryId: string;
  factoryName: string;
  orderCount: number;
  completedCount: number;
  averageLeadDays: number | null;
}
