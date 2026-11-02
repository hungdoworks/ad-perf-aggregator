# AI Coding Assistant Usage (`PROMPTS.md`)

## How AI Coding Assistants Were Used

An AI coding assistant (Google Antigravity) was used to:
- Plan the project structure and CLI interface in Node.js / TypeScript.
- Design the DuckDB SQL aggregation queries (`read_csv` and `COPY ... TO`) via `@duckdb/node-api`.
- Scaffold the CLI argument parser (`src/cli.ts`), DuckDB aggregation module (`src/aggregator.ts`), `.gitignore`, standalone CLI build configuration (`bin`, `Dockerfile`, `.dockerignore`), and documentation (`README.md`).

## Prompts Used

### Prompt 1
```text
/plan
```
*(Accompanied by the screenshot of the FV-SECO01 — Software Engineer Challenge — Ad Performance Aggregator specification)*

Clarifying questions answered:
- **Which programming language and approach would you like to use for the Ad Performance Aggregator CLI?**: `Node.js / TypeScript (streams)`
- **Do you already have the ~1GB ad_data.csv dataset downloaded locally so we can run and benchmark the final output files (top10_ctr.csv and top10_cpa.csv)?**: `I already downloaded ad_data.csv (or ad_data.csv.zip) on my machine — I'll share the path`

### Prompt 2
Inline review comments on the implementation plan:
- On dataset path:
  ```text
  data/ad_data.csv
  ```
- On CSV parsing approach:
  ```text
  Use DuckDB for querying the CSV file directly
  ```
- On `.gitignore`:
  ```text
  Use gitignore from this template: https://github.com/github/gitignore/blob/main/Node.gitignore
  ```
- On `test/aggregator.test.ts` and `npm test`:
  ```text
  Drop this part
  ```
Message:
```text
Update the plan
```

### Prompt 3
Approval of the updated implementation plan, plus manual execution of `npm install`:
```text
I have ran it by myself
```

### Prompt 4
```text
Pack this into a standalone CLI application
```
Clarifying question answered:
- **How would you like the standalone CLI application to be packaged?**: `Executable Node CLI + Dockerized standalone CLI`

### Prompt 5
```text
update the name of the CLI to `agg` instead of `ad-perf-aggregator` for easier usage
```

### Prompt 6
```text
use DuckDB at version ^2.0.0-r.1
```

### Prompt 7
```text
docker: Error response from daemon: failed to create task for container: failed to create shim task: OCI runtime create failed: runc create failed: unable to start container process: error during container init: exec: "agg": executable file not found in $PATH
```

## What Was Modified or Verified Manually

- Directed the architecture change from custom Node.js Buffer stream parsing to querying the CSV file directly with **DuckDB** (`@duckdb/node-api`).
- Specified the dataset location (`data/ad_data.csv`), `.gitignore` template (`Node.gitignore`), and removal of unnecessary test scaffolding.
- Ran `npm install` manually in the local terminal environment.
- Verified that `ORDER BY campaign_metrics.ctr DESC` and `ORDER BY campaign_metrics.cpa ASC` sort by the exact numeric `DOUBLE` values before formatting `CTR` (`%.4f`) and `CPA` (`%.2f`) strings in the exported CSV files.
- Requested packaging as both an executable Node CLI (`bin` entry + `dist/cli.js`) and a Dockerized standalone CLI (`Dockerfile` + `.dockerignore`), with the CLI command named `agg`.
