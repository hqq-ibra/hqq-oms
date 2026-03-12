import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  const adminHash = await argon2.hash('admin123');
  const salesHash = await argon2.hash('sales123');

  const admin = await prisma.user.upsert({
    where: { email: 'admin@hqq.com' },
    update: {},
    create: {
      name: 'Admin User',
      email: 'admin@hqq.com',
      passwordHash: adminHash,
      role: 'ADMIN',
      permissions: {
        create: [
          { permissionKey: 'VIEW_REPORTS' },
          { permissionKey: 'VIEW_COSTS' },
          { permissionKey: 'EDIT_COSTS' },
          { permissionKey: 'MANAGE_USERS' },
          { permissionKey: 'EDIT_ORDERS' },
          { permissionKey: 'CHANGE_STATUS' },
          { permissionKey: 'UPLOAD_FILES' },
        ],
      },
    },
  });

  const sales = await prisma.user.upsert({
    where: { email: 'sales@hqq.com' },
    update: {},
    create: {
      name: 'Sales User',
      email: 'sales@hqq.com',
      passwordHash: salesHash,
      role: 'SALES',
      permissions: {
        create: [
          { permissionKey: 'EDIT_ORDERS' },
          { permissionKey: 'CHANGE_STATUS' },
          { permissionKey: 'UPLOAD_FILES' },
        ],
      },
    },
  });

  const c1 = await prisma.customer.upsert({
    where: { customerCode: 'C001' },
    update: {},
    create: {
      customerCode: 'C001',
      type: 'FACTORY',
      name: 'Al-Safa Bakery',
      city: 'الرياض',
      contacts: {
        create: [{ name: 'Mohammed', role: 'Manager', phone: '+966501234567' }],
      },
    },
  });

  const c2 = await prisma.customer.upsert({
    where: { customerCode: 'C002' },
    update: {},
    create: {
      customerCode: 'C002',
      type: 'RETAILER',
      name: 'The Kitchen Restaurant',
      city: 'جدة',
      contacts: {
        create: [{ name: 'Sara', role: 'Contact', phone: '+966507654321' }],
      },
    },
  });

  const c3 = await prisma.customer.upsert({
    where: { customerCode: 'C003' },
    update: {},
    create: {
      customerCode: 'C003',
      type: 'FREELANCER',
      name: 'Grand Palace Hotel',
      city: 'الدمام',
      contacts: {
        create: [{ name: 'Ahmed', role: 'Manager', phone: '+966509876543' }],
      },
    },
  });

  const f1 = await prisma.factory.upsert({
    where: { id: 'factory-1' },
    update: {},
    create: {
      id: 'factory-1',
      name: 'Shenzhen Mold Co.',
      country: 'China',
      capabilityId: 'cap_both',
      wechatId: 'shenzhen_mold_wx',
    },
  });

  const f2 = await prisma.factory.upsert({
    where: { id: 'factory-2' },
    update: {},
    create: {
      id: 'factory-2',
      name: 'Guangzhou Silicone Ltd.',
      country: 'China',
      capabilityId: 'cap_silicone',
      wechatId: 'gz_silicone_wx',
    },
  });

  const products = [];
  const productData = [
    { sku: 'SIL-THF-001', nameEn: 'Rose Mold 15cm', nameAr: 'قالب ورد 15سم', categoryId: 'cat_sil', subcategoryId: 'sub_sil_thf', factoryId: f1.id },
    { sku: 'SIL-GSK-001', nameEn: 'Star Mold 10cm', nameAr: 'قالب نجمة 10سم', categoryId: 'cat_sil', subcategoryId: 'sub_sil_gsk', factoryId: f2.id },
    { sku: 'SIL-SHT-001', nameEn: 'Heart Mold 12cm', nameAr: 'قالب قلب 12سم', categoryId: 'cat_sil', subcategoryId: 'sub_sil_sht', factoryId: f1.id },
    { sku: 'KNF-CIR-001', nameEn: 'Cookie Cutter Set A', nameAr: 'طقم قطاعات بسكويت A', categoryId: 'cat_knf', subcategoryId: 'sub_knf_cir', factoryId: f1.id },
    { sku: 'KNF-STR-001', nameEn: 'Fondant Cutter Round', nameAr: 'قطاعة فوندان دائرية', categoryId: 'cat_knf', subcategoryId: 'sub_knf_str', factoryId: f1.id },
  ];

  for (const p of productData) {
    const prod = await prisma.product.upsert({
      where: { sku: p.sku },
      update: {},
      create: p,
    });
    products.push(prod);
  }

  const year = new Date().getFullYear();
  const orderData = [
    { type: 'NEW_MOLD', customer: c1, product: products[0], factory: f1, status: 'SENT_TO_FACTORY' },
    { type: 'REPEAT', customer: c2, product: products[1], factory: f2, status: 'SILICONE_CASTING' },
    { type: 'NEW_MOLD', customer: c3, product: products[2], factory: f1, status: 'NEW' },
    { type: 'REPEAT', customer: c1, product: products[3], factory: f1, status: 'SHIPPED_FROM_FACTORY' },
    { type: 'NEW_MOLD', customer: c2, product: products[4], factory: f1, status: 'CAD_DRAWING_READY' },
  ];

  for (let i = 0; i < orderData.length; i++) {
    const d = orderData[i];
    const orderNum = `ORD-${year}-${String(i + 1).padStart(4, '0')}`;
    const foNum = `FO-${year}-${d.customer.customerCode}-${String(i + 1).padStart(4, '0')}`;

    const order = await prisma.order.upsert({
      where: { orderNumber: orderNum },
      update: {},
      create: {
        orderNumber: orderNum,
        factoryOrderNumber: foNum,
        orderType: d.type,
        customerId: d.customer.id,
        productId: d.product.id,
        factoryId: d.factory.id,
        status: d.status,
        assignedUserId: i % 2 === 0 ? admin.id : sales.id,
        expectedDeliveryDate: new Date(Date.now() + (14 + i * 7) * 86400000),
        internalNotes: `Sample order ${i + 1}`,
      },
    });

    await prisma.orderCost.createMany({
      data: [
        { orderId: order.id, costType: 'FACTORY', amount: 150 + i * 30, currency: 'CNY', createdBy: admin.id },
        { orderId: order.id, costType: 'SELLING_PRICE', amount: 85 + i * 15, currency: 'SAR', createdBy: admin.id },
      ],
      skipDuplicates: true,
    });
  }

  // ─── Projects seed ───

  const DEFAULT_STAGES = [
    'Idea & Scope',
    'Research & Requirements',
    'Supplier Shortlist',
    'Quotation & Samples',
    'Execution Plan',
    'Execution / Build',
    'QA & Acceptance',
    'Close & Learn',
  ];

  const projectYear = new Date().getFullYear();

  // Project 1: Active project
  const prj1 = await prisma.project.upsert({
    where: { code: `PRJ-${projectYear}-0001` },
    update: {},
    create: {
      code: `PRJ-${projectYear}-0001`,
      name: 'Custom Silicone Baking Molds Line',
      ownerUserId: admin.id,
      status: 'ACTIVE',
      priority: 'HIGH',
      summary: 'Launch a new line of custom silicone baking molds for Saudi market. Target 8 SKUs with unique Arabic-inspired designs.',
      successCriteria: '1) 8 SKUs designed and approved\n2) Factory quotes below 15 CNY/unit\n3) First batch shipped within 90 days',
      tags: ['silicone', 'baking', 'new-line'],
      startDate: new Date(Date.now() - 30 * 86400000),
      targetDate: new Date(Date.now() + 60 * 86400000),
    },
  });

  const prj1Stages = [];
  for (let i = 0; i < DEFAULT_STAGES.length; i++) {
    const stage = await prisma.projectStage.upsert({
      where: { projectId_orderIndex: { projectId: prj1.id, orderIndex: i } },
      update: {},
      create: {
        projectId: prj1.id,
        name: DEFAULT_STAGES[i],
        orderIndex: i,
        status: i < 2 ? 'DONE' : i === 2 ? 'IN_PROGRESS' : 'NOT_STARTED',
        ...(i < 2 ? { startedAt: new Date(Date.now() - (30 - i * 10) * 86400000), completedAt: new Date(Date.now() - (20 - i * 10) * 86400000) } : {}),
        ...(i === 2 ? { startedAt: new Date(Date.now() - 5 * 86400000) } : {}),
      },
    });
    prj1Stages.push(stage);
  }

  await prisma.project.update({
    where: { id: prj1.id },
    data: { currentStageId: prj1Stages[2].id },
  });

  // Project 1 tasks
  await prisma.projectTask.createMany({
    data: [
      { projectId: prj1.id, stageId: prj1Stages[2].id, title: 'Contact Shenzhen Mold Co. for silicone quotes', status: 'DOING', priority: 'HIGH', assigneeUserId: sales.id },
      { projectId: prj1.id, stageId: prj1Stages[2].id, title: 'Contact Guangzhou Silicone Ltd. for pricing', status: 'TODO', priority: 'HIGH', assigneeUserId: sales.id },
      { projectId: prj1.id, stageId: prj1Stages[3].id, title: 'Request sample molds (rose, star, crescent)', status: 'TODO', priority: 'MEDIUM' },
      { projectId: prj1.id, stageId: prj1Stages[0].id, title: 'Define target SKU list', status: 'DONE', priority: 'HIGH', assigneeUserId: admin.id, completedAt: new Date(Date.now() - 20 * 86400000) },
      { projectId: prj1.id, stageId: prj1Stages[1].id, title: 'Research competitor pricing on Alibaba', status: 'DONE', priority: 'MEDIUM', assigneeUserId: sales.id, completedAt: new Date(Date.now() - 12 * 86400000) },
    ],
    skipDuplicates: true,
  });

  // Project 1 contacts
  await prisma.projectContact.createMany({
    data: [
      { projectId: prj1.id, name: 'Wang Wei', company: 'Shenzhen Mold Co.', country: 'China', capability: 'silicone', wechatId: 'wang_wei_sz', whatsapp: '+8613800138001' },
      { projectId: prj1.id, name: 'Li Na', company: 'Guangzhou Silicone Ltd.', country: 'China', capability: 'silicone', wechatId: 'lina_gz_sil', email: 'lina@gzsilicone.cn' },
    ],
    skipDuplicates: true,
  });

  // Project 1 files
  await prisma.projectFile.createMany({
    data: [
      { projectId: prj1.id, stageId: prj1Stages[0].id, type: 'LINK', title: 'Market Research Doc', url: 'https://docs.google.com/document/d/example1', uploadedByUserId: admin.id },
      { projectId: prj1.id, stageId: prj1Stages[1].id, type: 'PDF', title: 'Competitor Analysis Report', url: 'https://drive.google.com/file/d/example2', uploadedByUserId: sales.id },
      { projectId: prj1.id, type: 'LINK', title: 'Alibaba Supplier List', url: 'https://alibaba.com/search/silicone-mold', uploadedByUserId: sales.id },
    ],
    skipDuplicates: true,
  });

  // Project 1 activities
  await prisma.projectActivity.createMany({
    data: [
      { projectId: prj1.id, eventType: 'PROJECT_CREATED', message: 'Project "Custom Silicone Baking Molds Line" created', createdByUserId: admin.id, createdAt: new Date(Date.now() - 30 * 86400000) },
      { projectId: prj1.id, eventType: 'STAGE_STATUS_CHANGED', message: 'Stage "Idea & Scope" changed to DONE', createdByUserId: admin.id, createdAt: new Date(Date.now() - 20 * 86400000) },
      { projectId: prj1.id, eventType: 'STAGE_STATUS_CHANGED', message: 'Stage "Research & Requirements" changed to IN_PROGRESS', createdByUserId: sales.id, createdAt: new Date(Date.now() - 18 * 86400000) },
      { projectId: prj1.id, eventType: 'TASK_STATUS_CHANGED', message: 'Task "Research competitor pricing on Alibaba" changed to DONE', createdByUserId: sales.id, createdAt: new Date(Date.now() - 12 * 86400000) },
      { projectId: prj1.id, eventType: 'STAGE_STATUS_CHANGED', message: 'Stage "Research & Requirements" changed to DONE', createdByUserId: admin.id, createdAt: new Date(Date.now() - 10 * 86400000) },
      { projectId: prj1.id, eventType: 'CONTACT_ADDED', message: 'Contact "Wang Wei" added', createdByUserId: sales.id, createdAt: new Date(Date.now() - 8 * 86400000) },
      { projectId: prj1.id, eventType: 'STAGE_STATUS_CHANGED', message: 'Stage "Supplier Shortlist" changed to IN_PROGRESS', createdByUserId: admin.id, createdAt: new Date(Date.now() - 5 * 86400000) },
      { projectId: prj1.id, eventType: 'TASK_CREATED', message: 'Task "Contact Shenzhen Mold Co. for silicone quotes" created', createdByUserId: sales.id, createdAt: new Date(Date.now() - 3 * 86400000) },
    ],
    skipDuplicates: true,
  });

  // Project 2: Draft project
  const prj2 = await prisma.project.upsert({
    where: { code: `PRJ-${projectYear}-0002` },
    update: {},
    create: {
      code: `PRJ-${projectYear}-0002`,
      name: 'Cookie Cutter Expansion Set',
      ownerUserId: sales.id,
      status: 'DRAFT',
      priority: 'MEDIUM',
      summary: 'Expand our cookie cutter line with 12 new seasonal shapes for Ramadan and Eid.',
      tags: ['knife', 'cookie-cutter', 'seasonal'],
    },
  });

  for (let i = 0; i < DEFAULT_STAGES.length; i++) {
    await prisma.projectStage.upsert({
      where: { projectId_orderIndex: { projectId: prj2.id, orderIndex: i } },
      update: {},
      create: {
        projectId: prj2.id,
        name: DEFAULT_STAGES[i],
        orderIndex: i,
        status: 'NOT_STARTED',
      },
    });
  }

  await prisma.projectActivity.createMany({
    data: [
      { projectId: prj2.id, eventType: 'PROJECT_CREATED', message: 'Project "Cookie Cutter Expansion Set" created', createdByUserId: sales.id, createdAt: new Date(Date.now() - 2 * 86400000) },
    ],
    skipDuplicates: true,
  });

  // Project 3: Completed project
  const prj3 = await prisma.project.upsert({
    where: { code: `PRJ-${projectYear}-0003` },
    update: {},
    create: {
      code: `PRJ-${projectYear}-0003`,
      name: 'Packaging Redesign Q1',
      ownerUserId: admin.id,
      status: 'DONE',
      priority: 'LOW',
      summary: 'Redesigned product packaging for all silicone mold SKUs to include bilingual labels.',
      tags: ['packaging', 'design'],
      startDate: new Date(Date.now() - 90 * 86400000),
      targetDate: new Date(Date.now() - 15 * 86400000),
      closedAt: new Date(Date.now() - 10 * 86400000),
    },
  });

  for (let i = 0; i < DEFAULT_STAGES.length; i++) {
    await prisma.projectStage.upsert({
      where: { projectId_orderIndex: { projectId: prj3.id, orderIndex: i } },
      update: {},
      create: {
        projectId: prj3.id,
        name: DEFAULT_STAGES[i],
        orderIndex: i,
        status: 'DONE',
        startedAt: new Date(Date.now() - (90 - i * 10) * 86400000),
        completedAt: new Date(Date.now() - (80 - i * 10) * 86400000),
      },
    });
  }

  await prisma.projectActivity.createMany({
    data: [
      { projectId: prj3.id, eventType: 'PROJECT_CREATED', message: 'Project "Packaging Redesign Q1" created', createdByUserId: admin.id, createdAt: new Date(Date.now() - 90 * 86400000) },
      { projectId: prj3.id, eventType: 'PROJECT_UPDATED', message: 'Project marked as DONE', createdByUserId: admin.id, createdAt: new Date(Date.now() - 10 * 86400000) },
    ],
    skipDuplicates: true,
  });

  // Add project permissions to existing users
  const projectPermissions = ['MANAGE_PROJECTS', 'EDIT_PROJECTS', 'VIEW_PROJECTS'];
  for (const perm of projectPermissions) {
    await prisma.userPermission.upsert({
      where: { userId_permissionKey: { userId: admin.id, permissionKey: perm } },
      update: {},
      create: { userId: admin.id, permissionKey: perm },
    });
  }
  for (const perm of ['EDIT_PROJECTS', 'VIEW_PROJECTS']) {
    await prisma.userPermission.upsert({
      where: { userId_permissionKey: { userId: sales.id, permissionKey: perm } },
      update: {},
      create: { userId: sales.id, permissionKey: perm },
    });
  }

  console.log('Seed complete!');
  console.log('Admin login: admin@hqq.com / admin123');
  console.log('Sales login: sales@hqq.com / sales123');
  console.log(`Projects seeded: ${prj1.code}, ${prj2.code}, ${prj3.code}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
