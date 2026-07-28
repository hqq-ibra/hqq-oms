import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CycleTimeRow, FactoryLeadTimeRow, OverdueOrderRow, StatusDwellRow } from './types';
import { averageStatusDwell, RawStatusEntry } from './lib/operations';

// Prisma's $queryRaw returns a native Date for the `expected_delivery_date`
// timestamp column in production. Type the raw result honestly here and
// normalize it to the `string` wire contract OverdueOrderRow declares in
// getOverdue() below, matching the RawCustomerRecency / RawStatusEntry
// pattern used elsewhere in this module.
interface RawOverdueOrderRow extends Omit<OverdueOrderRow, 'expectedDeliveryDate'> {
  expectedDeliveryDate: string | Date;
}

@Injectable()
export class OperationsService {
  constructor(private readonly prisma: PrismaService) {}

  async getCycleTimes(): Promise<CycleTimeRow[]> {
    return this.prisma.$queryRaw<CycleTimeRow[]>`
      SELECT o.id           AS "orderId",
             o.order_number AS "orderNumber",
             ROUND((EXTRACT(EPOCH FROM (o.completed_at - o.created_at)) / 86400)::numeric, 2)::float8 AS "days"
      FROM orders o
      WHERE o.completed_at IS NOT NULL
      ORDER BY "days" DESC
    `;
  }

  async getStatusDwell(): Promise<StatusDwellRow[]> {
    const entries = await this.prisma.$queryRaw<RawStatusEntry[]>`
      SELECT h.order_id   AS "orderId",
             h.new_status AS "newStatus",
             h.changed_at AS "changedAt"
      FROM order_status_history h
      ORDER BY h.order_id ASC, h.changed_at ASC
    `;
    return averageStatusDwell(
      entries.map((e) => ({ ...e, changedAt: new Date(e.changedAt).toISOString() })),
    );
  }

  /**
   * "Overdue" means a committed order that has passed its promised date.
   * QUOTATION and REJECTED are excluded: the new-order wizard sets
   * expected_delivery_date on step 3, so every quotation carries one, and
   * without the predicate a quote the customer *declined* would sit in this
   * report forever, counted as late business. A rejected quote is dead by
   * definition; an unconfirmed quotation is not late, it is unanswered —
   * which is what the Quotations tab's "Waiting" column is for. The
   * delayed / nearDeadline list filters in orders.service.ts exclude the same
   * set for the same reason.
   */
  async getOverdue(): Promise<OverdueOrderRow[]> {
    const rows = await this.prisma.$queryRaw<RawOverdueOrderRow[]>`
      SELECT o.id            AS "orderId",
             o.order_number  AS "orderNumber",
             o.quote_number  AS "quoteNumber",
             c.name          AS "customerName",
             o.expected_delivery_date AS "expectedDeliveryDate",
             FLOOR(EXTRACT(EPOCH FROM (NOW() - o.expected_delivery_date)) / 86400)::int AS "daysOverdue"
      FROM orders o
      JOIN customers c ON c.id = o.customer_id
      WHERE o.completed_at IS NULL
        AND o.status NOT IN ('QUOTATION', 'REJECTED')
        AND o.expected_delivery_date IS NOT NULL
        AND o.expected_delivery_date < NOW()
      ORDER BY "daysOverdue" DESC
    `;
    return rows.map((row) => ({
      ...row,
      expectedDeliveryDate: new Date(row.expectedDeliveryDate).toISOString(),
    }));
  }

  async getFactoryLeadTimes(): Promise<FactoryLeadTimeRow[]> {
    return this.prisma.$queryRaw<FactoryLeadTimeRow[]>`
      SELECT f.id   AS "factoryId",
             f.name AS "factoryName",
             COUNT(o.id)::int AS "orderCount",
             COUNT(o.completed_at)::int AS "completedCount",
             ROUND(AVG(EXTRACT(EPOCH FROM (o.completed_at - o.created_at)) / 86400)::numeric, 2)::float8 AS "averageLeadDays"
      FROM factories f
      LEFT JOIN orders o ON o.factory_id = f.id
      GROUP BY f.id, f.name
      ORDER BY "orderCount" DESC
    `;
  }
}
