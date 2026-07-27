export enum Role {
  ADMIN = 'ADMIN',
  SALES = 'SALES',
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

export const DEFAULT_PERMISSIONS: Record<Role, Permission[]> = {
  [Role.ADMIN]: Object.values(Permission),
  [Role.SALES]: [
    Permission.EDIT_ORDERS,
    Permission.CHANGE_STATUS,
    Permission.UPLOAD_FILES,
    Permission.EDIT_PROJECTS,
    Permission.VIEW_PROJECTS,
  ],
};

export enum OrderType {
  NEW_MOLD = 'NEW_MOLD',
  REPEAT = 'REPEAT',
}

export enum OrderStatus {
  QUOTATION = 'QUOTATION',
  CONFIRMED = 'CONFIRMED',
  REJECTED = 'REJECTED',
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

export enum ProductType {
  SILICONE = 'SILICONE',
  KNIFE = 'KNIFE',
}

export enum FactoryCapability {
  SILICONE = 'SILICONE',
  KNIFE = 'KNIFE',
  BOTH = 'BOTH',
}

export enum CustomerType {
  FACTORY = 'FACTORY',
  RETAILER = 'RETAILER',
  FREELANCER = 'FREELANCER',
}

export enum FileType {
  IMAGE = 'IMAGE',
  CAD = 'CAD',
  PDF = 'PDF',
  LINK = 'LINK',
}

export enum EntityType {
  ORDER = 'ORDER',
  CUSTOMER = 'CUSTOMER',
  PRODUCT = 'PRODUCT',
  PROJECT = 'PROJECT',
  PROJECT_STAGE = 'PROJECT_STAGE',
  PROJECT_TASK = 'PROJECT_TASK',
  PROJECT_CONTACT = 'PROJECT_CONTACT',
  PROJECT_FILE = 'PROJECT_FILE',
}

export enum AuditAction {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  STATUS_CHANGE = 'STATUS_CHANGE',
}

// ─── Project Enums ───

export enum ProjectStatus {
  DRAFT = 'DRAFT',
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

export enum StickyNoteColor {
  YELLOW = 'yellow',
  BLUE = 'blue',
  GREEN = 'green',
  PINK = 'pink',
}

export enum PinnedItemType {
  FILE = 'FILE',
  NOTE = 'NOTE',
  DOCUMENT = 'DOCUMENT',
}

export enum PinnedLocation {
  FILES = 'FILES',
  OVERVIEW = 'OVERVIEW',
}

export enum ProjectActivityType {
  PROJECT_CREATED = 'PROJECT_CREATED',
  PROJECT_UPDATED = 'PROJECT_UPDATED',
  STAGE_CREATED = 'STAGE_CREATED',
  STAGE_STARTED = 'STAGE_STARTED',
  STAGE_COMPLETED = 'STAGE_COMPLETED',
  STAGE_STATUS_CHANGED = 'STAGE_STATUS_CHANGED',
  TASK_CREATED = 'TASK_CREATED',
  TASK_STATUS_CHANGED = 'TASK_STATUS_CHANGED',
  FILE_ADDED = 'FILE_ADDED',
  FILE_REMOVED = 'FILE_REMOVED',
  CONTACT_ADDED = 'CONTACT_ADDED',
  CONTACT_LOGGED = 'CONTACT_LOGGED',
  NOTE_ADDED = 'NOTE_ADDED',
  TASK_DELETED = 'TASK_DELETED',
  CONTACT_REMOVED = 'CONTACT_REMOVED',
  STICKY_NOTE_CREATED = 'STICKY_NOTE_CREATED',
  DOCUMENT_UPDATED = 'DOCUMENT_UPDATED',
  STAGE_FILE_UPLOADED = 'STAGE_FILE_UPLOADED',
  STAGE_TASK_CREATED = 'STAGE_TASK_CREATED',
  ITEM_PINNED = 'ITEM_PINNED',
}

export const DEFAULT_PROJECT_STAGES = [
  'Idea & Scope',
  'Research & Requirements',
  'Supplier Shortlist',
  'Quotation & Samples',
  'Execution Plan',
  'Execution / Build',
  'QA & Acceptance',
  'Close & Learn',
] as const;
