import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CostBreakdownRow, MonthlyMoneyRow } from './types';
import { buildMonthlyMoney } from './lib/sales';

@Injectable()
export class SalesService {
  constructor(private readonly prisma: PrismaService) {}

  async getCostBreakdown(): Promise<CostBreakdownRow[]> {
    return this.prisma.$queryRaw<CostBreakdownRow[]>`
      SELECT to_char(oc.created_at, 'YYYY-MM') AS "month",
             oc.cost_type                      AS "costType",
             oc.currency                       AS "currency",
             SUM(oc.amount)::float8            AS "total",
             COUNT(*)::int                     AS "count"
      FROM order_costs oc
      GROUP BY 1, 2, 3
      ORDER BY 1 ASC, 2 ASC, 3 ASC
    `;
  }

  async getMonthlyMoney(): Promise<MonthlyMoneyRow[]> {
    return buildMonthlyMoney(await this.getCostBreakdown());
  }
}
