# EmbodiedLens

EmbodiedLens is an evidence-aware visual analytics system for diagnosing vision-and-language navigation (VLN) traces. It links behavioral cohorts, decision sequences, complete traversals, candidate actions, and alternative-action references while preserving the provenance and availability of each field.

The current release contains the English interface used in the accompanying manuscript. View titles do not contain manuscript panel letters; panel labels are added only when preparing publication figures.

## Features

- Behavioral cohort fingerprints with representative, severe-failure, and boundary case retrieval.
- Reproducible default-step selection based on the first geometric decision conflict, with the largest negative progress change as fallback.
- Coordinated episode, decision-ribbon, trajectory, candidate, and alternative-action views.
- Explicit probability-coverage, unlogged-choice, revisit, and stopping-position audits.
- Local JSON/JSONL processing in a Web Worker; uploaded traces are not sent to a server.
- Exportable SVG views and analysis records.

## Quick start

Python 3 is sufficient; the application has no package installation step.

```bash
python -m http.server 8008 --bind 127.0.0.1
```

Open <http://127.0.0.1:8008/>. On Windows, `run_windows.bat` starts the same server. On Linux or macOS, use `./run_linux.sh`.

Download or generate a compatible trace file as described in [`data/README.md`](data/README.md), then either:

1. choose **Import JSON / JSONL** and select the file; or
2. place `duet_r2r_val_unseen.compact.json` in `data/` and choose **Load local prepared data**.

## Data

The 35 MB processed trace collection and Matterport3D imagery are not committed to this repository. Official download locations, license notes, and preparation commands are provided in [`data/README.md`](data/README.md).

The repository retains `data/analysis-summary.json`, which contains aggregate audit results, hashes, and sensitivity summaries but no episode-level trace data.

## Prepare a compact trace

The application accepts the original EmbodiedLens JSON/JSONL schema and the shared-topology compact schema. To compact an exported DUET validation file:

```bash
node tools/prepare-data.cjs /path/to/duet_r2r_val_unseen.json
```

To include aggregate checks for all splits:

```bash
node tools/prepare-data.cjs \
  /path/to/duet_r2r_val_unseen.json \
  /path/to/duet_r2r_all_splits.jsonl
```

The generated compact file is written to `data/duet_r2r_val_unseen.compact.json`.

## Validation

Run the deterministic analytical-core tests with:

```bash
node tests/core.test.cjs
```

See [`VALIDATION.md`](VALIDATION.md) for the validation scope and [`TRACE_SCHEMA.md`](TRACE_SCHEMA.md) for field-level semantics.

## Repository structure

- `index.html`, `styles.css`, `app.js`: browser interface and linked-view interactions.
- `core.js`: parsing, auditing, clustering, case selection, and trajectory diagnostics.
- `worker.js`: background trace processing.
- `tools/prepare-data.cjs`: lossless shared-topology compaction and audit generation.
- `tests/core.test.cjs`: deterministic regression checks.
- `USER_GUIDE.md`: complete usage guide.
- `RESEARCH_REPORT.md`: data audit and design rationale.

## Citation

If you use EmbodiedLens in academic work, please cite the software metadata in [`CITATION.cff`](CITATION.cff). The manuscript citation can be added after publication.

## Third-party data

R2R annotations, Matterport3D assets, and VLN-DUET code remain subject to their respective licenses and terms. This repository does not redistribute those assets.

