import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CustomerBreadthRow, CustomerSegmentRow } from './types';
import { segmentCustomers, RawCustomerRecency } from './lib/customers';

@Injectable()
export class CustomersAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getBreadth(): Promise<CustomerBreadthRow[]> {
    return this.prisma.$queryRaw<CustomerBreadthRow[]>`
      SELECT c.id            AS "customerId",
             c.customer_code AS "customerCode",
             c.name          AS "name",
             COUNT(cp.product_id)::int AS "products"
      FROM customers c
      LEFT JOIN customer_products cp ON cp.customer_id = c.id
      WHERE c.is_active = true
      GROUP BY c.id, c.customer_code, c.name
      ORDER BY "products" DESC, c.name ASC
    `;
  }

  async getSegments(): Promise<CustomerSegmentRow[]> {
    const rows = await this.prisma.$queryRaw<RawCustomerRecency[]>`
      SELECT c.id            AS "customerId",
             c.customer_code AS "customerCode",
             c.name          AS "name",
             MAX(o.created_at) AS "lastOrderAt"
      FROM customers c
      LEFT JOIN orders o ON o.customer_id = c.id
      WHERE c.is_active = true
      GROUP BY c.id, c.customer_code, c.name
      ORDER BY "lastOrderAt" DESC NULLS LAST
    `;
    return segmentCustomers(rows, new Date());
  }
}
