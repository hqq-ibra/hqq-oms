export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  permissions: string[];
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface OrderFilters {
  status?: string;
  orderType?: string;
  assignedUserId?: string;
  factoryId?: string;
  customerId?: string;
  search?: string;
  delayed?: boolean;
  nearDeadline?: boolean;
  page?: number;
  pageSize?: number;
}

export interface WsEvent<T = unknown> {
  event: string;
  data: T;
  userId: string;
  timestamp: string;
}

export interface ProjectFilters {
  status?: string;
  priority?: string;
  ownerUserId?: string;
  search?: string;
  tags?: string[];
  page?: number;
  pageSize?: number;
}
