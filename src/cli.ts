#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { aggregateAdPerformance } from './aggregator.ts';

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      input: {
        type: 'string',
        short: 'i',
        default: 'data/ad_data.csv',
      },
      output: {
        type: 'string',
        short: 'o',
        default: 'results/',
      },
      help: {
        type: 'boolean',
        short: 'h',
        default: false,
      },
    },
    strict: true,
  });

  if (values.help) {
    console.log(`Usage: agg --input <csv_path> --output <output_dir>

Options:
  -i, --input   Path to input CSV file (default: data/ad_data.csv)
  -o, --output  Directory for output CSV files (default: results/)
  -h, --help    Show this help message`);
    return;
  }

  const inputPath = values.input ?? 'data/ad_data.csv';
  const outputDir = values.output ?? 'results/';

  console.log(`Processing input CSV: ${inputPath}`);
  const result = await aggregateAdPerformance(inputPath, outputDir);

  console.log(`Aggregated ${result.uniqueCampaigns} unique campaigns.`);
  console.log(`Processing time: ${(result.durationMs / 1000).toFixed(2)}s (${Math.round(result.durationMs)} ms)`);
  console.log(`Peak memory usage (RSS): ${result.peakMemoryMb.toFixed(2)} MB`);
  console.log(`Generated files:`);
  console.log(`  - ${result.ctrOutputPath}`);
  console.log(`  - ${result.cpaOutputPath}`);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Error: ${message}`);
  process.exit(1);
});
