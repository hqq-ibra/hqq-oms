import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface MonthlyCostRow {
  month: string;
  currency: string;
  totalCost: number;
  costCount: number;
}

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Monthly spend, grouped by currency.
   *
   * This was previously called "monthly profit" and summed every row in
   * order_costs. That was wrong in three ways: SELLING_PRICE is a CostType, so
   * revenue was added to the cost total; amounts in SAR, USD and CNY were added
   * together despite no exchange rate existing anywhere; and the result was
   * labelled profit when it is spend.
   */
  async getMonthlyCosts(): Promise<MonthlyCostRow[]> {
    return this.prisma.$queryRaw<MonthlyCostRow[]>`
      SELECT to_char(oc.created_at, 'YYYY-MM') AS "month",
             oc.currency                       AS "currency",
             SUM(oc.amount)::float8            AS "totalCost",
             COUNT(*)::int                     AS "costCount"
      FROM order_costs oc
      WHERE oc.cost_type <> 'SELLING_PRICE'
      GROUP BY 1, 2
      ORDER BY 1 ASC, 2 ASC
    `;
  }

  async getOrdersPerformance() {
    const orders = await this.prisma.order.findMany({
      select: { status: true },
    });

    const byStatus: Record<string, number> = {};
    for (const o of orders) {
      byStatus[o.status] = (byStatus[o.status] ?? 0) + 1;
    }

    return Object.entries(byStatus).map(([status, count]) => ({
      status,
      count,
    }));
  }

  async getFactoryPerformance() {
    const orders = await this.prisma.order.findMany({
      include: {
        factory: { select: { id: true, name: true } },
      },
    });

    const byFactory: Record<string, { name: string; count: number }> = {};
    for (const o of orders) {
      const fid = o.factoryId;
      if (!fid || !o.factory) continue;
      if (!byFactory[fid]) {
        byFactory[fid] = { name: o.factory.name, count: 0 };
      }
      byFactory[fid].count += 1;
    }

    return Object.entries(byFactory).map(([factoryId, { name, count }]) => ({
      factoryId,
      factoryName: name,
      orderCount: count,
    }));
  }

  async getInactiveCustomers() {
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const customers = await this.prisma.customer.findMany({
      where: { isActive: true },
      include: {
        orders: {
          where: { createdAt: { gte: ninetyDaysAgo } },
          select: { id: true },
        },
      },
    });

    const inactive = customers.filter(
      (c: { orders: unknown[] }) => c.orders.length === 0,
    );

    return inactive.map((c: { id: string; customerCode: string; name: string }) => ({
      id: c.id,
      customerCode: c.customerCode,
      name: c.name,
      lastOrderAt: null,
    }));
  }
}
