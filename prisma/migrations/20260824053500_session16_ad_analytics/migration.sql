CREATE TYPE "AdAnalyticsEventType" AS ENUM ('IMPRESSION', 'CLICK', 'CONVERSION');

CREATE TABLE "ad_analytics_events" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "companyId" TEXT,
    "placementId" TEXT NOT NULL,
    "eventType" "AdAnalyticsEventType" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dedupeKey" TEXT,
    "attributionToken" TEXT,
    "sourceEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ad_analytics_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ad_analytics_events_dedupeKey_key" ON "ad_analytics_events"("dedupeKey");
CREATE UNIQUE INDEX "ad_analytics_events_attributionToken_key" ON "ad_analytics_events"("attributionToken");
CREATE UNIQUE INDEX "ad_analytics_events_sourceEventId_key" ON "ad_analytics_events"("sourceEventId");
CREATE INDEX "ad_analytics_events_campaignId_eventType_occurredAt_idx" ON "ad_analytics_events"("campaignId", "eventType", "occurredAt");
CREATE INDEX "ad_analytics_events_companyId_eventType_occurredAt_idx" ON "ad_analytics_events"("companyId", "eventType", "occurredAt");
CREATE INDEX "ad_analytics_events_placementId_eventType_occurredAt_idx" ON "ad_analytics_events"("placementId", "eventType", "occurredAt");
CREATE INDEX "ad_analytics_events_eventType_occurredAt_idx" ON "ad_analytics_events"("eventType", "occurredAt");

ALTER TABLE "ad_analytics_events"
ADD CONSTRAINT "ad_analytics_events_campaignId_fkey"
FOREIGN KEY ("campaignId") REFERENCES "ad_campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
