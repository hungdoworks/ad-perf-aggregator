import fs from 'node:fs';
import path from 'node:path';
import { DuckDBInstance } from '@duckdb/node-api';

export interface AggregationResult {
  uniqueCampaigns: number;
  durationMs: number;
  peakMemoryMb: number;
  ctrOutputPath: string;
  cpaOutputPath: string;
}

function escapeSqlString(val: string): string {
  return val.replace(/'/g, "''");
}

export async function aggregateAdPerformance(
  inputPath: string,
  outputDir: string
): Promise<AggregationResult> {
  const startTime = performance.now();
  let peakRssBytes = process.memoryUsage().rss;

  const memoryInterval = setInterval(() => {
    const currentRss = process.memoryUsage().rss;
    if (currentRss > peakRssBytes) {
      peakRssBytes = currentRss;
    }
  }, 50);

  try {
    const resolvedInput = path.resolve(inputPath);
    if (!fs.existsSync(resolvedInput)) {
      throw new Error(`Input file not found: ${resolvedInput}`);
    }

    const stat = fs.statSync(resolvedInput);
    if (!stat.isFile()) {
      throw new Error(`Input path is not a file: ${resolvedInput}`);
    }
    if (stat.size === 0) {
      throw new Error(`Input file is empty: ${resolvedInput}`);
    }

    const resolvedOutputDir = path.resolve(outputDir);
    fs.mkdirSync(resolvedOutputDir, { recursive: true });

    const ctrOutputPath = path.join(resolvedOutputDir, 'top10_ctr.csv');
    const cpaOutputPath = path.join(resolvedOutputDir, 'top10_cpa.csv');

    const instance = await DuckDBInstance.create(':memory:');
    const connection = await instance.connect();

    const escapedInput = escapeSqlString(resolvedInput);
    const escapedCtrOut = escapeSqlString(ctrOutputPath);
    const escapedCpaOut = escapeSqlString(cpaOutputPath);

    // 1. Aggregate CSV data by campaign_id in a single streaming pass
    // ignore_errors = true skips malformed rows (invalid types / column counts)
    await connection.run(`
      CREATE TEMP TABLE campaign_metrics AS
      SELECT
        campaign_id,
        SUM(impressions)::BIGINT AS total_impressions,
        SUM(clicks)::BIGINT AS total_clicks,
        SUM(spend)::DOUBLE AS total_spend,
        SUM(conversions)::BIGINT AS total_conversions,
        CASE
          WHEN SUM(impressions) > 0 THEN SUM(clicks)::DOUBLE / SUM(impressions)::DOUBLE
          ELSE 0.0
        END AS ctr,
        CASE
          WHEN SUM(conversions) > 0 THEN SUM(spend)::DOUBLE / SUM(conversions)::DOUBLE
          ELSE NULL
        END AS cpa
      FROM read_csv('${escapedInput}',
        header = true,
        ignore_errors = true,
        columns = {
          'campaign_id': 'VARCHAR',
          'date': 'VARCHAR',
          'impressions': 'BIGINT',
          'clicks': 'BIGINT',
          'spend': 'DOUBLE',
          'conversions': 'BIGINT'
        }
      )
      WHERE campaign_id IS NOT NULL
        AND TRIM(campaign_id) <> ''
        AND impressions IS NOT NULL AND impressions >= 0
        AND clicks IS NOT NULL AND clicks >= 0
        AND spend IS NOT NULL AND spend >= 0
        AND conversions IS NOT NULL AND conversions >= 0
      GROUP BY campaign_id;
    `);

    const countReader = await connection.runAndReadAll(
      `SELECT COUNT(*)::INTEGER AS cnt FROM campaign_metrics;`
    );
    const rows = countReader.getRows();
    const uniqueCampaigns = Number(rows[0]?.[0] ?? 0);

    // 2. Export Top 10 campaigns with highest CTR
    await connection.run(`
      COPY (
        SELECT
          campaign_id,
          total_impressions,
          total_clicks,
          printf('%.2f', total_spend) AS total_spend,
          total_conversions,
          printf('%.4f', ctr) AS CTR,
          CASE
            WHEN cpa IS NOT NULL THEN printf('%.2f', cpa)
            ELSE 'null'
          END AS CPA
        FROM campaign_metrics
        ORDER BY campaign_metrics.ctr DESC, campaign_metrics.campaign_id ASC
        LIMIT 10
      ) TO '${escapedCtrOut}' (HEADER, DELIMITER ',');
    `);

    // 3. Export Top 10 campaigns with lowest CPA (excluding zero conversions)
    await connection.run(`
      COPY (
        SELECT
          campaign_id,
          total_impressions,
          total_clicks,
          printf('%.2f', total_spend) AS total_spend,
          total_conversions,
          printf('%.4f', ctr) AS CTR,
          printf('%.2f', cpa) AS CPA
        FROM campaign_metrics
        WHERE total_conversions > 0 AND cpa IS NOT NULL
        ORDER BY campaign_metrics.cpa ASC, campaign_metrics.campaign_id ASC
        LIMIT 10
      ) TO '${escapedCpaOut}' (HEADER, DELIMITER ',');
    `);

    const finalRss = process.memoryUsage().rss;
    if (finalRss > peakRssBytes) {
      peakRssBytes = finalRss;
    }

    const durationMs = performance.now() - startTime;
    const peakMemoryMb = peakRssBytes / (1024 * 1024);

    return {
      uniqueCampaigns,
      durationMs,
      peakMemoryMb,
      ctrOutputPath,
      cpaOutputPath,
    };
  } finally {
    clearInterval(memoryInterval);
  }
}
