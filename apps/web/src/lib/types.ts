export enum OrderStatus {
  NEW = 'NEW',
  SAMPLE_RECEIVED = 'SAMPLE_RECEIVED',
  CAD_DRAWING_READY = 'CAD_DRAWING_READY',
  SENT_TO_FACTORY = 'SENT_TO_FACTORY',
  MOLD_READY = 'MOLD_READY',
  SILICONE_CASTING = 'SILICONE_CASTING',
  SHIPPED_FROM_FACTORY = 'SHIPPED_FROM_FACTORY',
  RECEIVED_LOCALLY = 'RECEIVED_LOCALLY',
  SHIPPED_TO_CUSTOMER = 'SHIPPED_TO_CUSTOMER',
  COMPLETED = 'COMPLETED',
}

export enum OrderType {
  NEW_MOLD = 'NEW_MOLD',
  REPEAT = 'REPEAT',
}

export enum CostType {
  FACTORY = 'FACTORY',
  SHIPPING = 'SHIPPING',
  EXTRA = 'EXTRA',
  SELLING_PRICE = 'SELLING_PRICE',
  MOLD_COST = 'MOLD_COST',
}

export enum Currency {
  SAR = 'SAR',
  USD = 'USD',
  CNY = 'CNY',
}

export enum Permission {
  VIEW_REPORTS = 'VIEW_REPORTS',
  VIEW_COSTS = 'VIEW_COSTS',
  EDIT_COSTS = 'EDIT_COSTS',
  MANAGE_USERS = 'MANAGE_USERS',
  EDIT_ORDERS = 'EDIT_ORDERS',
  CHANGE_STATUS = 'CHANGE_STATUS',
  UPLOAD_FILES = 'UPLOAD_FILES',
  MANAGE_PROJECTS = 'MANAGE_PROJECTS',
  EDIT_PROJECTS = 'EDIT_PROJECTS',
  VIEW_PROJECTS = 'VIEW_PROJECTS',
}

export enum FileType {
  IMAGE = 'IMAGE',
  CAD = 'CAD',
  PDF = 'PDF',
  LINK = 'LINK',
  RECEIPT = 'RECEIPT',
}

export enum EntityType {
  ORDER = 'ORDER',
  CUSTOMER = 'CUSTOMER',
  PRODUCT = 'PRODUCT',
}

export const NEW_MOLD_FLOW: readonly string[] = [
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
];

export const REPEAT_FLOW: readonly string[] = [
  'NEW',
  'SENT_TO_FACTORY',
  'SILICONE_CASTING',
  'SHIPPED_FROM_FACTORY',
  'RECEIVED_LOCALLY',
  'SHIPPED_TO_CUSTOMER',
  'COMPLETED',
];

export const ORDER_FLOWS: Record<string, readonly string[]> = {
  NEW_MOLD: NEW_MOLD_FLOW,
  REPEAT: REPEAT_FLOW,
};

// ─── Project Types ───

export enum ProjectStatus {
  ACTIVE = 'ACTIVE',
  ON_HOLD = 'ON_HOLD',
  DONE = 'DONE',
  CANCELLED = 'CANCELLED',
}

export enum ProjectPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
}

export enum ProjectStageStatus {
  NOT_STARTED = 'NOT_STARTED',
  IN_PROGRESS = 'IN_PROGRESS',
  DONE = 'DONE',
}

export enum ProjectTaskStatus {
  TODO = 'TODO',
  DOING = 'DOING',
  DONE = 'DONE',
}

export enum ProjectFileType {
  PDF = 'PDF',
  CAD = 'CAD',
  IMAGE = 'IMAGE',
  LINK = 'LINK',
  OTHER = 'OTHER',
}
