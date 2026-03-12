import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const createCustomerSchema = z.object({
  type: z.string(),
  name: z.string().min(1),
  city: z.string().optional(),
  googleMapsUrl: z.string().url().optional().or(z.literal('')),
  managerName: z.string().optional(),
  managerPhone: z.string().optional(),
  contactName: z.string().optional(),
  contactPhone: z.string().optional(),
  accountingName: z.string().optional(),
  accountingPhone: z.string().optional(),
  notes: z.string().optional(),
});

export const createFactorySchema = z.object({
  name: z.string().min(1),
  country: z.string().min(1),
  capabilityId: z.string().min(1),
  phone: z.string().optional(),
  notes: z.string().optional(),
});

export const createVendorContactSchema = z.object({
  name: z.string().min(1),
  role: z.string().min(1),
  wechatId: z.string().min(1),
});

export const createProductSchema = z.object({
  sku: z.string().min(1),
  nameAr: z.string().optional(),
  nameEn: z.string().min(1),
  type: z.enum(['SILICONE', 'KNIFE']),
  factoryId: z.string().min(1),
  notes: z.string().optional(),
});

export const createOrderSchema = z.object({
  orderType: z.enum(['NEW_MOLD', 'REPEAT']),
  customerId: z.string().min(1),
  productId: z.string().min(1),
  factoryId: z.string().min(1),
  expectedDeliveryDate: z.string().optional(),
  assignedUserId: z.string().optional().nullable(),
  internalNotes: z.string().optional(),
});

export const updateOrderSchema = z.object({
  expectedDeliveryDate: z.string().optional(),
  assignedUserId: z.string().optional().nullable(),
  internalNotes: z.string().optional(),
  shippingCompany: z.string().optional().nullable(),
  trackingNumber: z.string().optional().nullable(),
  trackingUrl: z.string().optional().nullable(),
});

export const changeStatusSchema = z.object({
  newStatus: z.string(),
  note: z.string().optional(),
});

export const createCostSchema = z.object({
  costType: z.enum(['FACTORY', 'SHIPPING', 'EXTRA', 'SELLING_PRICE', 'MOLD_COST']),
  amount: z.number().min(0),
  currency: z.enum(['SAR', 'USD', 'CNY']),
});

export const createFileSchema = z.object({
  entityType: z.enum(['ORDER', 'CUSTOMER', 'PRODUCT']),
  entityId: z.string().min(1),
  fileType: z.enum(['IMAGE', 'CAD', 'PDF', 'LINK']),
  fileName: z.string().min(1),
  fileUrl: z.string().min(1),
});

export const createUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(['ADMIN', 'SALES']),
  permissions: z.array(z.string()).optional(),
});

// ─── Project Schemas ───

export const createProjectSchema = z.object({
  name: z.string().min(1),
  summary: z.string().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(),
  startDate: z.string().optional(),
  targetDate: z.string().optional(),
  tags: z.array(z.string()).optional(),
  successCriteria: z.string().optional(),
});

export const updateProjectSchema = z.object({
  name: z.string().min(1).optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'ON_HOLD', 'DONE', 'CANCELLED']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(),
  summary: z.string().optional(),
  successCriteria: z.string().nullable().optional(),
  startDate: z.string().nullable().optional(),
  targetDate: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  currentStageId: z.string().nullable().optional(),
});

export const createProjectStageSchema = z.object({
  name: z.string().min(1),
  orderIndex: z.number().int().min(0).optional(),
  notes: z.string().optional(),
});

export const updateProjectStageSchema = z.object({
  name: z.string().min(1).optional(),
  status: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'DONE']).optional(),
  orderIndex: z.number().int().min(0).optional(),
  notes: z.string().nullable().optional(),
});

export const createProjectTaskSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  stageId: z.string().nullable().optional(),
  assigneeUserId: z.string().nullable().optional(),
  status: z.enum(['TODO', 'DOING', 'DONE']).optional(),
  dueDate: z.string().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(),
});

export const updateProjectTaskSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  stageId: z.string().nullable().optional(),
  assigneeUserId: z.string().nullable().optional(),
  status: z.enum(['TODO', 'DOING', 'DONE']).optional(),
  dueDate: z.string().nullable().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(),
});

export const createProjectContactSchema = z.object({
  name: z.string().min(1),
  company: z.string().optional(),
  country: z.string().optional(),
  capability: z.string().optional(),
  wechatId: z.string().optional(),
  contactPerson: z.string().optional(),
  contactPosition: z.string().optional(),
  whatsapp: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  website: z.string().optional(),
  location: z.string().optional(),
  notes: z.string().optional(),
});

export const updateProjectContactSchema = z.object({
  name: z.string().min(1).optional(),
  company: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  capability: z.string().nullable().optional(),
  wechatId: z.string().nullable().optional(),
  contactPerson: z.string().nullable().optional(),
  contactPosition: z.string().nullable().optional(),
  whatsapp: z.string().nullable().optional(),
  email: z.string().email().optional().or(z.literal('')).nullable(),
  website: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  lastContactAt: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export const createProjectFileSchema = z.object({
  type: z.enum(['PDF', 'CAD', 'IMAGE', 'LINK', 'OTHER']),
  title: z.string().min(1),
  url: z.string().min(1),
  stageId: z.string().nullable().optional(),
  taskId: z.string().nullable().optional(),
  notes: z.string().optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type CreateFactoryInput = z.infer<typeof createFactorySchema>;
export type CreateProductInput = z.infer<typeof createProductSchema>;
export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type UpdateOrderInput = z.infer<typeof updateOrderSchema>;
export type ChangeStatusInput = z.infer<typeof changeStatusSchema>;
export type CreateCostInput = z.infer<typeof createCostSchema>;
export type CreateFileInput = z.infer<typeof createFileSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type CreateProjectStageInput = z.infer<typeof createProjectStageSchema>;
export type UpdateProjectStageInput = z.infer<typeof updateProjectStageSchema>;
export type CreateProjectTaskInput = z.infer<typeof createProjectTaskSchema>;
export type UpdateProjectTaskInput = z.infer<typeof updateProjectTaskSchema>;
export type CreateProjectContactInput = z.infer<typeof createProjectContactSchema>;
export type UpdateProjectContactInput = z.infer<typeof updateProjectContactSchema>;
export type CreateProjectFileInput = z.infer<typeof createProjectFileSchema>;

// ─── Stage Workspace Schemas ───

export const createStickyNoteSchema = z.object({
  title: z.string().min(1),
  content: z.string().optional(),
  color: z.enum(['yellow', 'blue', 'green', 'pink']).optional(),
  positionX: z.number().int().optional(),
  positionY: z.number().int().optional(),
});

export const updateStickyNoteSchema = z.object({
  title: z.string().min(1).optional(),
  content: z.string().optional(),
  color: z.enum(['yellow', 'blue', 'green', 'pink']).optional(),
  positionX: z.number().int().optional(),
  positionY: z.number().int().optional(),
});

export const updateStageDocumentSchema = z.object({
  content: z.any(),
});

export const createStageTaskSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  assigneeUserId: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
});

export const updateStageTaskSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  status: z.enum(['TODO', 'DOING', 'DONE']).optional(),
  assigneeUserId: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
});

export const createPinnedItemSchema = z.object({
  itemType: z.enum(['FILE', 'NOTE', 'DOCUMENT']),
  itemId: z.string().min(1),
  pinnedLocation: z.enum(['FILES', 'OVERVIEW']),
});

export type CreateStickyNoteInput = z.infer<typeof createStickyNoteSchema>;
export type UpdateStickyNoteInput = z.infer<typeof updateStickyNoteSchema>;
export type UpdateStageDocumentInput = z.infer<typeof updateStageDocumentSchema>;
export type CreateStageTaskInput = z.infer<typeof createStageTaskSchema>;
export type UpdateStageTaskInput = z.infer<typeof updateStageTaskSchema>;
export type CreatePinnedItemInput = z.infer<typeof createPinnedItemSchema>;
