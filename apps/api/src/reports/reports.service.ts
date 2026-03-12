import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async getMonthlyProfit() {
    const costs = await this.prisma.orderCost.findMany();

    const byMonth: Record<string, { total: number; count: number }> = {};
    for (const cost of costs) {
      const month = new Date(cost.createdAt).toISOString().slice(0, 7);
      if (!byMonth[month]) byMonth[month] = { total: 0, count: 0 };
      byMonth[month].total += cost.amount;
      byMonth[month].count += 1;
    }

    return Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, { total, count }]) => ({
        month,
        totalCost: total,
        costCount: count,
      }));
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
