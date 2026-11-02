import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { aggregateAdPerformance } from '../src/aggregator.ts';

describe('aggregateAdPerformance', () => {
  let tmpDir: string;
  let outputDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agg-test-'));
    outputDir = path.join(tmpDir, 'results');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('throws an error when the input file does not exist', async () => {
    const missingFile = path.join(tmpDir, 'non_existent.csv');
    await assert.rejects(
      () => aggregateAdPerformance(missingFile, outputDir),
      /Input file not found/
    );
  });

  it('throws an error when the input path is a directory', async () => {
    await assert.rejects(
      () => aggregateAdPerformance(tmpDir, outputDir),
      /Input path is not a file/
    );
  });

  it('throws an error when the input file is 0 bytes (empty)', async () => {
    const emptyFile = path.join(tmpDir, 'empty.csv');
    fs.writeFileSync(emptyFile, '');
    await assert.rejects(
      () => aggregateAdPerformance(emptyFile, outputDir),
      /Input file is empty/
    );
  });

  it('handles a CSV with only the header row and no data rows', async () => {
    const headerOnlyFile = path.join(tmpDir, 'header_only.csv');
    fs.writeFileSync(
      headerOnlyFile,
      'campaign_id,date,impressions,clicks,spend,conversions\n'
    );

    const result = await aggregateAdPerformance(headerOnlyFile, outputDir);
    assert.equal(result.uniqueCampaigns, 0);

    const ctrLines = fs
      .readFileSync(result.ctrOutputPath, 'utf8')
      .trim()
      .split('\n');
    const cpaLines = fs
      .readFileSync(result.cpaOutputPath, 'utf8')
      .trim()
      .split('\n');

    assert.equal(ctrLines.length, 1);
    assert.equal(
      ctrLines[0],
      'campaign_id,total_impressions,total_clicks,total_spend,total_conversions,CTR,CPA'
    );
    assert.equal(cpaLines.length, 1);
  });

  it('skips malformed rows (invalid numbers, missing columns, blank campaign_id, negative values) and aggregates valid rows', async () => {
    const malformedCsv = path.join(tmpDir, 'malformed.csv');
    fs.writeFileSync(
      malformedCsv,
      [
        'campaign_id,date,impressions,clicks,spend,conversions',
        'CMP001,2025-01-01,1000,50,25.00,5',
        'CMP001,2025-01-02,not_a_number,50,25.00,5', // invalid integer
        'CMP001,2025-01-03,1000,50,bad_float,5', // invalid float
        'CMP001,2025-01-04,1000,50', // missing columns
        ',2025-01-05,1000,50,25.00,5', // empty campaign_id
        '   ,2025-01-06,1000,50,25.00,5', // whitespace-only campaign_id
        'CMP001,2025-01-07,-500,50,25.00,5', // negative impressions
        'CMP001,2025-01-08,1000,-10,25.00,5', // negative clicks
        'CMP001,2025-01-09,1000,50,-25.00,5', // negative spend
        'CMP001,2025-01-10,1000,50,25.00,-1', // negative conversions
        'CMP001,2025-01-11,2000,100,50.00,10', // valid second row for CMP001
      ].join('\n')
    );

    const result = await aggregateAdPerformance(malformedCsv, outputDir);
    assert.equal(result.uniqueCampaigns, 1);

    const ctrLines = fs
      .readFileSync(result.ctrOutputPath, 'utf8')
      .trim()
      .split('\n');
    assert.equal(ctrLines.length, 2);
    assert.equal(ctrLines[1], 'CMP001,3000,150,75.00,15,0.0500,5.00');
  });

  it('handles zero conversions (CPA = null and excluded from top10_cpa.csv) and zero impressions (CTR = 0.0000)', async () => {
    const edgeCaseCsv = path.join(tmpDir, 'edge_cases.csv');
    fs.writeFileSync(
      edgeCaseCsv,
      [
        'campaign_id,date,impressions,clicks,spend,conversions',
        'CMP_ZERO_CONV,2025-01-01,1000,100,50.00,0',
        'CMP_ZERO_IMP,2025-01-01,0,0,10.00,2',
        'CMP_NORMAL,2025-01-01,2000,100,40.00,8',
      ].join('\n')
    );

    const result = await aggregateAdPerformance(edgeCaseCsv, outputDir);
    assert.equal(result.uniqueCampaigns, 3);

    const ctrLines = fs
      .readFileSync(result.ctrOutputPath, 'utf8')
      .trim()
      .split('\n');
    // CTR ranking: CMP_ZERO_CONV (0.1000), CMP_NORMAL (0.0500), CMP_ZERO_IMP (0.0000)
    assert.equal(ctrLines.length, 4);
    assert.equal(ctrLines[1], 'CMP_ZERO_CONV,1000,100,50.00,0,0.1000,null');
    assert.equal(ctrLines[2], 'CMP_NORMAL,2000,100,40.00,8,0.0500,5.00');
    assert.equal(ctrLines[3], 'CMP_ZERO_IMP,0,0,10.00,2,0.0000,5.00');

    const cpaLines = fs
      .readFileSync(result.cpaOutputPath, 'utf8')
      .trim()
      .split('\n');
    // CMP_ZERO_CONV must be excluded from top10_cpa.csv
    assert.equal(cpaLines.length, 3);
    assert.ok(!cpaLines.some((line) => line.startsWith('CMP_ZERO_CONV,')));
  });

  it('limits output to top 10 campaigns sorted by highest CTR and lowest CPA', async () => {
    const rows = ['campaign_id,date,impressions,clicks,spend,conversions'];
    for (let i = 1; i <= 15; i++) {
      const id = `CMP${String(i).padStart(3, '0')}`;
      const impressions = 10000;
      const clicks = i * 100; // CTR increases with i
      const spend = i * 10; // CPA increases with i (since conversions = 10)
      const conversions = 10;
      rows.push(`${id},2025-01-01,${impressions},${clicks},${spend},${conversions}`);
    }

    const rankingCsv = path.join(tmpDir, 'ranking.csv');
    fs.writeFileSync(rankingCsv, rows.join('\n'));

    const result = await aggregateAdPerformance(rankingCsv, outputDir);
    assert.equal(result.uniqueCampaigns, 15);

    const ctrLines = fs
      .readFileSync(result.ctrOutputPath, 'utf8')
      .trim()
      .split('\n');
    const cpaLines = fs
      .readFileSync(result.cpaOutputPath, 'utf8')
      .trim()
      .split('\n');

    // Header + 10 data rows = 11 lines
    assert.equal(ctrLines.length, 11);
    assert.equal(cpaLines.length, 11);

    // Highest CTR first: CMP015 (1500/10000 = 0.1500) down to CMP006
    assert.ok(ctrLines[1]?.startsWith('CMP015,'));
    assert.ok(ctrLines[10]?.startsWith('CMP006,'));

    // Lowest CPA first: CMP001 (10/10 = 1.00) up to CMP010
    assert.ok(cpaLines[1]?.startsWith('CMP001,'));
    assert.ok(cpaLines[10]?.startsWith('CMP010,'));
  });
});
