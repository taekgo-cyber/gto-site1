-- Session 14: stable machine-readable identity for managed advertisement products.
-- Nullable preserves legacy Product rows; managed products are validated by application policy.
ALTER TABLE "products" ADD COLUMN "code" TEXT;

CREATE UNIQUE INDEX "products_code_key" ON "products"("code");