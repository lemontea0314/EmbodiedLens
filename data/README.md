# Data download and preparation

EmbodiedLens was evaluated with Room-to-Room (R2R) traces produced by the Dual-Scale Graph Transformer (DUET). The processed episode file and Matterport3D imagery are intentionally excluded from this repository because of size and upstream distribution terms.

## Official sources

1. **R2R annotations and download script**  
   <https://github.com/peteanderson80/Matterport3DSimulator/tree/master/tasks/R2R/data>

2. **Official VLN-DUET implementation**  
   <https://github.com/cshizhe/VLN-DUET>

3. **Matterport3D Simulator and asset-access instructions**  
   <https://github.com/peteanderson80/Matterport3DSimulator>

Follow the VLN-DUET README to download its processed R2R annotations, image features, and pretrained models. Matterport3D imagery requires compliance with the Matterport3D terms of use and is not redistributed here.

## Expected EmbodiedLens files

The manuscript analysis used:

- `duet_r2r_val_unseen.json`: 2,349 R2R unseen-validation episodes;
- `duet_r2r_all_splits.jsonl`: audit records for train-seen validation, seen validation, unseen validation, and test splits.

These are diagnostic trace exports, not the original R2R annotation files. A compatible episode stores the instruction, outcome fields, decision steps, selected global actions, raw exported candidate probabilities, complete movement segments, and graph topology. See [`../TRACE_SCHEMA.md`](../TRACE_SCHEMA.md) for the full semantics.

## Prepare data for the browser

After producing a compatible `duet_r2r_val_unseen.json`, run:

```bash
node tools/prepare-data.cjs /path/to/duet_r2r_val_unseen.json
```

The tool writes:

- `data/duet_r2r_val_unseen.compact.json`, a lossless shared-topology representation;
- `data/analysis-summary.json`, aggregate checks, hashes, cohorts, sensitivity results, and case identifiers.

Optionally pass the all-splits JSONL file as the second argument:

```bash
node tools/prepare-data.cjs \
  /path/to/duet_r2r_val_unseen.json \
  /path/to/duet_r2r_all_splits.jsonl
```

Start the local server and choose **Load local prepared data**, or import any supported JSON/JSONL file directly from the toolbar.

## Integrity

`tools/verify-source.cjs` compares the original and compact files and checks episode reconstruction, aggregate audits, and the deterministic analysis fingerprint:

```bash
node tools/verify-source.cjs /path/to/duet_r2r_val_unseen.json
```
