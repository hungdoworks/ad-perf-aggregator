# Ad Performance Aggregator (FV-SECO01)

A high-performance standalone CLI application built with **Node.js**, **TypeScript**, and **DuckDB** (`@duckdb/node-api`) that processes a ~1GB advertising dataset (`ad_data.csv`), aggregates performance metrics by `campaign_id`, and generates the top 10 campaigns by highest CTR (`top10_ctr.csv`) and lowest CPA (`top10_cpa.csv`).

## Requirements

- **Node.js** `>= 22.6.0` (tested with Node.js `v24.18.0`) and **npm** `>= 10.0.0`, **OR**
- **Docker** (to run as a containerized standalone CLI without installing Node.js locally)

## Setup Instructions

1. Install dependencies and build the CLI executable:
   ```bash
   npm install
   npm run build
   ```

2. *(Optional)* Link the CLI binary globally on your machine so `agg` is available in your `PATH`:
   ```bash
   npm link
   ```

3. Place the extracted `ad_data.csv` file inside `data/ad_data.csv` (or pass any path via `--input`).

## How to Run the Program

### Option 1: Standalone Executable Node CLI

Run the compiled CLI executable using:

```bash
node ./dist/cli.js --input data/ad_data.csv --output results/
```

Or if linked via `npm link`:

```bash
agg --input data/ad_data.csv --output results/
```

Or via npm scripts:

```bash
npm start -- --input data/ad_data.csv --output results/
```

### Option 2: Dockerized Standalone CLI

1. Build the Docker image:
   ```bash
   docker build -t agg .
   ```

2. Run the container mounting your local `data/` and `results/` directories:
   ```bash
   docker run --rm \
     -v "$(pwd)/data:/data:ro" \
     -v "$(pwd)/results:/results" \
     agg --input /data/ad_data.csv --output /results
   ```

### CLI Options

| Flag | Short | Default | Description |
| :--- | :--- | :--- | :--- |
| `--input` | `-i` | `data/ad_data.csv` | Path to the input CSV file |
| `--output` | `-o` | `results/` | Output directory for `top10_ctr.csv` and `top10_cpa.csv` |
| `--help` | `-h` | `false` | Show CLI usage information |

## Libraries Used

- **[`@duckdb/node-api`](https://www.npmjs.com/package/@duckdb/node-api)**: Official Node.js bindings for DuckDB. Used to stream and aggregate the ~1GB CSV file directly via DuckDB's multi-threaded vectorized `read_csv` reader and export the aggregated rankings via `COPY (...) TO`.
- **Node.js Built-ins (`node:fs`, `node:path`, `node:util`, `node:perf_hooks`)**: CLI argument parsing (`parseArgs`), filesystem operations, and execution time / RSS memory tracking.

## Benchmark Results (1GB Dataset)

Measured on `data/ad_data.csv` (`995 MB`, 50 unique campaigns):

- **Processing Time**: `0.53s` (`529 ms` – `658 ms`)
- **Peak Memory Usage (RSS)**: `~548 MB` – `566 MB`

## Output Files

- [`results/top10_ctr.csv`](./results/top10_ctr.csv): Top 10 campaigns with the highest Click-Through Rate ($\text{CTR} = \frac{\text{total\_clicks}}{\text{total\_impressions}}$).
- [`results/top10_cpa.csv`](./results/top10_cpa.csv): Top 10 campaigns with the lowest Cost Per Acquisition ($\text{CPA} = \frac{\text{total\_spend}}{\text{total\_conversions}}$), excluding campaigns with zero conversions.

## Running Tests

Run the unit test suite (covering missing files, directory paths, empty files, header-only CSVs, malformed rows, zero conversions/impressions, and top-10 ranking):

```bash
npm test
```
