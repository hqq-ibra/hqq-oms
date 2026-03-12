import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { CustomersModule } from './customers/customers.module';
import { CapabilitiesModule } from './capabilities/capabilities.module';
import { FactoriesModule } from './factories/factories.module';
import { ProductsModule } from './products/products.module';
import { OrdersModule } from './orders/orders.module';
import { FilesModule } from './files/files.module';
import { ReportsModule } from './reports/reports.module';
import { ProjectsModule } from './projects/projects.module';
import { WsModule } from './ws/ws.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    UsersModule,
    CustomersModule,
    CapabilitiesModule,
    FactoriesModule,
    ProductsModule,
    OrdersModule,
    FilesModule,
    ReportsModule,
    ProjectsModule,
    WsModule,
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
  ],
})
export class AppModule {}
