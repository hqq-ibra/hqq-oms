import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CatalogueHealth, ProductDemandRow } from './types';
import { flagStockGaps, RawDemandRow } from './lib/stock';

@Injectable()
export class StockService {
  constructor(private readonly prisma: PrismaService) {}

  async getDemand(): Promise<ProductDemandRow[]> {
    const rows = await this.prisma.$queryRaw<RawDemandRow[]>`
      SELECT p.id            AS "productId",
             p.sku           AS "sku",
             p.name_en       AS "nameEn",
             p.inventory     AS "inventory",
             COUNT(cp.customer_id)::int AS "customers"
      FROM products p
      LEFT JOIN customer_products cp ON cp.product_id = p.id
      WHERE p.is_active = true
      GROUP BY p.id, p.sku, p.name_en, p.inventory
      ORDER BY "customers" DESC, p.sku ASC
    `;
    return flagStockGaps(rows);
  }

  async getCatalogueHealth(): Promise<CatalogueHealth> {
    const [row] = await this.prisma.$queryRaw<CatalogueHealth[]>`
      SELECT
        (SELECT COUNT(*)::int FROM products) AS "totalProducts",
        (SELECT COUNT(*)::int FROM products p
           WHERE NOT EXISTS (SELECT 1 FROM customer_products cp WHERE cp.product_id = p.id)
        ) AS "productsWithoutCustomer",
        (SELECT COUNT(*)::int FROM products p
           WHERE NOT EXISTS (SELECT 1 FROM files f
                             WHERE f.entity_type = 'PRODUCT' AND f.entity_id = p.id)
        ) AS "productsWithoutDrawing",
        (SELECT COUNT(*)::int FROM customer_products) AS "totalLinks"
    `;
    return row;
  }
}
