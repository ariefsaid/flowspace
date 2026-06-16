-- CreateEnum
CREATE TYPE "CafeCategory" AS ENUM ('COFFEE', 'NON_COFFEE', 'FOOD', 'SNACK');

-- CreateEnum
CREATE TYPE "CafeOrderStatus" AS ENUM ('NEW', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DrinkTemperature" AS ENUM ('HOT', 'COLD', 'ICE_BLENDED');

-- CreateEnum
CREATE TYPE "SugarLevel" AS ENUM ('NORMAL', 'LESS', 'NONE');

-- CreateTable
CREATE TABLE "cafe_menu_items" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "category" "CafeCategory" NOT NULL,
    "price_rupiah" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "has_variants" BOOLEAN NOT NULL DEFAULT false,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cafe_menu_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cafe_orders" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "customer_user_id" TEXT,
    "guest_name" TEXT,
    "status" "CafeOrderStatus" NOT NULL DEFAULT 'NEW',
    "subtotal_rupiah" INTEGER NOT NULL,
    "discount_rupiah" INTEGER NOT NULL DEFAULT 0,
    "total_rupiah" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cafe_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cafe_order_items" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "menu_item_id" TEXT,
    "name_snapshot" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "unit_price_rupiah" INTEGER NOT NULL,
    "temperature" "DrinkTemperature",
    "sugar" "SugarLevel",

    CONSTRAINT "cafe_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cafe_menu_items_org_id_idx" ON "cafe_menu_items"("org_id");

-- CreateIndex
CREATE INDEX "cafe_menu_items_org_id_category_idx" ON "cafe_menu_items"("org_id", "category");

-- CreateIndex
CREATE INDEX "cafe_orders_org_id_idx" ON "cafe_orders"("org_id");

-- CreateIndex
CREATE INDEX "cafe_orders_org_id_status_idx" ON "cafe_orders"("org_id", "status");

-- CreateIndex
CREATE INDEX "cafe_orders_org_id_created_at_idx" ON "cafe_orders"("org_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "cafe_orders_org_id_code_key" ON "cafe_orders"("org_id", "code");

-- CreateIndex
CREATE INDEX "cafe_order_items_order_id_idx" ON "cafe_order_items"("order_id");

-- AddForeignKey
ALTER TABLE "cafe_menu_items" ADD CONSTRAINT "cafe_menu_items_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cafe_orders" ADD CONSTRAINT "cafe_orders_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cafe_orders" ADD CONSTRAINT "cafe_orders_customer_user_id_fkey" FOREIGN KEY ("customer_user_id") REFERENCES "app_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cafe_order_items" ADD CONSTRAINT "cafe_order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "cafe_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cafe_order_items" ADD CONSTRAINT "cafe_order_items_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "cafe_menu_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
