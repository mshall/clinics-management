-- PA-02 commercial configuration per market
ALTER TABLE "Market" ADD COLUMN "commercialConfig" JSONB NOT NULL DEFAULT '{}';