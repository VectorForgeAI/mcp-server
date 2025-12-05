## MCP Testing Guide

### 1. Overview

The `@vectorforge/mcp-servers` package includes **end-to-end tests** that exercise all Phase 1 MCP servers against a real VectorForge API sandbox.

These tests:

- Start each MCP server via **stdio** (e.g., `node dist/servers/divt-registry.js`).
- Use the official MCP client (`@modelcontextprotocol/sdk`) to:
  - List tools.
  - Call tools such as `vf.register`, `vf.verify`, `vf.prompt_receipt.create`, etc.
- Call the **live VectorForge HTTP API** via `VF_API_BASE_URL` and `VF_API_KEY`.

The goal is to prove that:

- MCP servers correctly implement the MCP protocol (ListTools / CallTool over stdio).
- MCP tools are wired to the VectorForge Node SDK and HTTP APIs correctly.
- Crypto integrity (DIVTs) and scoring are actually exercised end-to-end.

---

### 2. Prerequisites

**Node.js**

- Node.js **>= 18** (per `mcp/package.json` `engines.node`).

**Environment variables**

The MCP tests require a **live VectorForge sandbox**. Before running tests, set:

- `VF_API_BASE_URL` – Base URL of the VectorForge API sandbox.
  - Example: `https://api.vectorforge.ai`
- `VF_API_KEY` – A valid API key for that sandbox environment.

If these are **not** set, the test suite will **fail fast** with:

> MCP E2E tests require VF_API_BASE_URL and VF_API_KEY to be set to a live VectorForge API sandbox.

This check is implemented in `mcp/test/mcp-servers.e2e.test.ts` via `ensureVectorForgeEnv()`.

---

### 3. How to Run

From the repository root:

```bash
cd mcp
npm install           # first time only

# Run MCP tests against a live sandbox
export VF_API_BASE_URL="https://your-sandbox-endpoint"
export VF_API_KEY="vf_sandbox_..."

npm run test:mcp
```

On Windows PowerShell:

```powershell
cd mcp
npm install

$env:VF_API_BASE_URL = "https://your-sandbox-endpoint"
$env:VF_API_KEY = "vf_sandbox_..."

npm run test:mcp
```

Under the hood, `npm run test:mcp` will:

1. Build the TypeScript sources (`npm run build` → `tsc` → `dist/servers/*.js`).
2. Run Vitest with `mcp/test/mcp-servers.e2e.test.ts`.

If `VF_API_BASE_URL` or `VF_API_KEY` are missing, the first environment test will fail immediately with the error string above, and no MCP servers will be started.

---

### 4. What the Tests Do

The single test file `mcp/test/mcp-servers.e2e.test.ts` covers all Phase 1 MCP servers:

#### DIVT Registry MCP (`dist/servers/divt-registry.js`)

- **Tools:** `vf.register`, `vf.verify`

Tests:

- **Happy path – registration**
  - Calls `vf.register` with:
    - `mode: "text"`
    - `data_type: "prompt_receipt_v1"`
    - Simple content like `"Hello, World!"`
  - Asserts:
    - Response JSON has `divt_id` (non-empty string).
    - Response JSON has `hash_b64` (non-empty string).

- **Happy path – verification**
  - Immediately calls `vf.verify` with:
    - The returned `divt_id`.
    - Same content and `mode: "text"`.
  - Asserts:
    - `valid === true`
    - `hash_match === true`
    - `classical_sig_ok === true`
    - `pqc_sig_ok === true`
    - `revoked === false`

- **Negative – invalid mode**
  - Calls `vf.register` with `mode: "potato"`.
  - Asserts:
    - `isError === true`
    - Parsed error message contains `"Unknown mode"`.

#### Prompt Receipts MCP (`dist/servers/prompt-receipts.js`)

- **Tool:** `vf.prompt_receipt.create`

Tests:

- **Happy path**
  - Calls `vf.prompt_receipt.create` with:
    - `prompt`, `response`, `model`, `metadata`, `also_register_divt: true`.
  - Asserts:
    - Response JSON has `wsl_id`.
    - If `divt_id` is present, it is a non-empty string.

- **Negative – missing prompt**
  - Omits `prompt` and calls `vf.prompt_receipt.create`.
  - Asserts:
    - `isError === true`
    - Error message mentions `prompt`.

#### RAG Snapshots MCP (`dist/servers/rag-snapshots.js`)

- **Tool:** `vf.rag_snapshot.create`

Tests:

- **Happy path**
  - Calls `vf.rag_snapshot.create` with:
    - `index_hash`
    - `doc_hashes` (1–2 dummy hashes)
    - optional metadata
    - `also_register_divt: true`
  - Asserts:
    - Response JSON has `wsl_id`.
    - If `divt_id` is present, it is a non-empty string.

- **Negative – missing index_hash**
  - Omits `index_hash`.
  - Asserts:
    - `isError === true`
    - Error message mentions `index_hash`.

#### Worldstate Logger MCP (`dist/servers/worldstate-logger.js`)

- **Tool:** `vf.worldstate.create`

Tests:

- **Happy path**
  - Calls `vf.worldstate.create` with:
    - `kind: "custom"`
    - `data: { foo: "bar", source: "mcp-e2e" }`
  - Asserts:
    - Response JSON has `wsl_id` (non-empty string).

- **Negative – missing kind**
  - Omits `kind`.
  - Asserts:
    - `isError === true`
    - Error message mentions `kind`.

#### Confidence Scoring MCP (`dist/servers/confidence-scoring.js`)

- **Tools:** `vf.score.privacy`, `vf.score.full`

Tests:

- **Privacy scoring – basic happy path**
  - Calls `vf.score.privacy` with:
    - 2 evidence items (each has `similarity` and `chunk_confidence`).
    - Optional `model_signals`.
  - Asserts:
    - `overall_confidence`, `semantic_confidence`, `integrity_score` are numbers.
    - `vector_count`, `verified_count` are numbers.
    - `explanation` is a non-empty string.

- **Privacy scoring – with real DIVT (integrity-focused)**
  - Registers a DIVT via `vf.register` on `divt-registry` for a small text payload.
  - Calls `vf.score.privacy` with:
    - `evidence` that includes the returned `divt_id` and `object_id`.
  - Asserts:
    - `isError === false`
    - `vector_count >= 1`
    - `verified_count >= 1`
    - `integrity_score > 0`
    - `explanation` is non-empty.

- **Full scoring – basic happy path**
  - Calls `vf.score.full` with:
    - `query`, `answer`
    - 1–2 evidence items with full `text` and `similarity`.
    - `log_worldstate: "minimal"`
  - Asserts:
    - `overall_confidence`, `semantic_confidence`, `integrity_score`,
      `support_score`, `faithfulness_score` are numbers.
    - `vector_count`, `verified_count` are numbers.
    - If `worldstate_ref` is present, it is a non-empty string.

- **Full scoring – with real DIVT (integrity-focused)**
  - Registers a DIVT via `vf.register` on `divt-registry` for a short evidence text.
  - Calls `vf.score.full` with:
    - Evidence that includes that `divt_id` and matching `text`.
    - `log_worldstate: "minimal"`.
  - Asserts:
    - `isError === false`
    - `verified_count >= 1`
    - `integrity_score > 0`
    - All score fields are numbers.
    - Optional `worldstate_ref`, if present, is a non-empty string.

- **Negative cases**
  - `vf.score.privacy` without `evidence` → `isError === true`, error mentions `evidence`.
  - `vf.score.full` without `query`/`answer` → `isError === true`, error mentions `query`.

**Data hygiene**

- Tests use object IDs and metadata prefixed with `mcp-` (e.g., `mcp-test-object-1`, `mcp-scoring-divt-object-1`, `mcp-e2e`).
- In a shared sandbox environment, it is safe to periodically delete data with these prefixes if needed.

---

### 5. Notes for CI

If you wire these MCP tests into CI:

- **Use a dedicated sandbox**, never production.
  - Configure a separate `VF_API_BASE_URL` and `VF_API_KEY` for CI.
- Ensure CI secrets provide:
  - `VF_API_BASE_URL`
  - `VF_API_KEY`
- CI should run:

```bash
cd mcp
npm ci
npm run test:mcp
```

Because these are end-to-end tests that talk to external services, expect:

- Network latency.
- Occasional transient failures if the sandbox is unstable (treat as infra, not code, issues).

If CI runs without the required env vars, the suite will fail immediately with the explicit error:

> MCP E2E tests require VF_API_BASE_URL and VF_API_KEY to be set to a live VectorForge API sandbox.

This behavior is by design, so misconfigured pipelines fail loudly instead of silently skipping coverage.


