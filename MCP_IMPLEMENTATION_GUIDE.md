# VectorForge MCP Servers - Implementation Guide

**Status:** Specification Complete - Implementation In Progress  
**Version:** 0.1.0  
**Last Updated:** 2025-11-21

---

## Overview

This document specifies the Model Context Protocol (MCP) servers for VectorForge APIs. Each MCP server exposes tools that wrap VectorForge HTTP APIs and SDK helpers, making them "drop-in" compatible with LangChain, n8n, and agent frameworks.

### Architecture

```
mcp/
├── package.json           # MCP servers package
├── tsconfig.json          # TypeScript config
├── src/
│   ├── servers/
│   │   ├── divt-registry.ts      # MCP #1: DIVT Registry
│   │   ├── prompt-receipts.ts    # MCP #2: AI Prompt Receipts
│   │   ├── rag-snapshots.ts      # MCP #3: RAG Snapshots
│   │   ├── agent-ledger.ts       # MCP #4: Agent Actions
│   │   ├── scoring.ts            # MCP #5: Confidence Scoring
│   │   ├── worldstate.ts         # MCP #6: Worldstate Logger
│   │   ├── graph-explorer.ts     # MCP #7: Graph (Phase 4+)
│   │   ├── streaming.ts          # MCP #8: Streaming Ingest
│   │   ├── keys-admin.ts         # MCP #9: Keys & Plans
│   │   └── erasure.ts            # MCP #10: Erasure (Phase 2)
│   ├── types/
│   │   └── mcp-schemas.ts        # Shared type definitions
│   └── index.ts                  # Main entry point
└── README.md                     # Usage documentation
```

---

## MCP Server Specifications

### 1. DIVT Registry MCP

**Purpose:** Issue and verify cryptographic "birth certificates" for any object.

**Tools:**
- `vf.register` - Register content with DIVT
- `vf.verify` - Verify content against DIVT

**Implementation Status:** ⏳ Pending

**Tool: `vf.register`**

```typescript
{
  name: "vf.register",
  description: "Issue and verify cryptographic birth certificates for any object—then prove integrity anywhere it travels. PQC signatures and deterministic hashing make authenticity portable and audit-ready.",
  inputSchema: {
    type: "object",
    properties: {
      object_id: {
        type: "string",
        description: "Unique identifier for the object"
      },
      data_type: {
        type: "string",
        description: "Logical data type (e.g., 'prompt_receipt_v1')"
      },
      mode: {
        type: "string",
        enum: ["text", "json", "embedding", "image", "hash"],
        description: "Canonicalization mode"
      },
      content: {
        description: "Content to register (string for text, object for JSON, array for embedding, base64 for image)"
      },
      hash_b64: {
        type: "string",
        description: "Pre-computed SHA3-512 hash (advanced mode)"
      },
      metadata: {
        type: "object",
        description: "Optional metadata"
      }
    },
    required: ["object_id", "data_type", "mode"]
  }
}
```

**Implementation:**
- Use SDK helpers: `registerContent()`, `registerJson()`, `registerEmbedding()`, `registerImage()`
- For `mode: "hash"`: use low-level `register()` with `hash_b64`

**Tool: `vf.verify`**

```typescript
{
  name: "vf.verify",
  description: "Verify content against a registered DIVT with full cryptographic validation",
  inputSchema: {
    type: "object",
    properties: {
      divt_id: {
        type: "string",
        description: "DIVT identifier to verify against"
      },
      mode: {
        type: "string",
        enum: ["text", "json", "embedding", "image", "hash"],
        description: "Canonicalization mode (optional if just checking DIVT)"
      },
      content: {
        description: "Content to verify (optional, for hash matching)"
      },
      hash_b64: {
        type: "string",
        description: "Hash to verify (advanced mode)"
      }
    },
    required: ["divt_id"]
  }
}
```

**Returns:** `VerifyResult` from Implementation Plan

---

### 2. AI Prompt & Output Receipts MCP

**Purpose:** Get a receipt for every AI call.

**Tools:**
- `vf.prompt_receipt.create` - Create prompt receipt in worldstate

**Implementation Status:** ⏳ Pending

**Tool: `vf.prompt_receipt.create`**

```typescript
{
  name: "vf.prompt_receipt.create",
  description: "Get a receipt for every AI call. Stamp prompts and answers into worldstate (and optionally register a DIVT) so you can explain what was asked, what was answered, and when.",
  inputSchema: {
    type: "object",
    properties: {
      prompt: {
        type: "string",
        description: "AI prompt text"
      },
      response: {
        type: "string",
        description: "AI response text"
      },
      model: {
        type: "string",
        description: "Model used (e.g., 'gpt-4')"
      },
      metadata: {
        type: "object",
        properties: {
          user_id: { type: "string" },
          workflow: { type: "string" },
          run_id: { type: "string" },
          timestamp: { type: "string", format: "date-time" }
        },
        description: "Additional context"
      },
      also_register_divt: {
        type: "boolean",
        default: false,
        description: "Also create a DIVT for this receipt"
      }
    },
    required: ["prompt", "response"]
  }
}
```

**Implementation:**
1. Build JSON payload: `{ type: "prompt_receipt_v1", prompt, response, model, metadata }`
2. Call `POST /v1/worldstate` with `kind="prompt_receipt"`
3. If `also_register_divt=true`: call `registerJson()` on the same payload
4. Return `{ wsl_id, divt_id? }`

---

### 3. RAG Snapshot MCP

**Purpose:** Freeze your knowledge base in time.

**Tools:**
- `vf.rag_snapshot.create` - Create versioned RAG snapshot

**Implementation Status:** ⏳ Pending

**Tool: `vf.rag_snapshot.create`**

```typescript
{
  name: "vf.rag_snapshot.create",
  description: "Freeze your knowledge base in time. Version and seal each corpus/index so every answer you ship is traceable to the exact content and build that produced it.",
  inputSchema: {
    type: "object",
    properties: {
      snapshot_type: {
        type: "string",
        default: "rag-corpus",
        description: "Type of snapshot"
      },
      source_paths: {
        type: "array",
        items: { type: "string" },
        description: "Source paths for documents"
      },
      doc_hashes: {
        type: "array",
        items: { type: "string" },
        description: "Hashes of documents in corpus"
      },
      index_hash: {
        type: "string",
        description: "Hash of the index manifest"
      },
      metadata: {
        type: "object",
        properties: {
          env: { type: "string" },
          project: { type: "string" },
          git_sha: { type: "string" }
        },
        description: "Build and environment metadata"
      },
      also_register_divt: {
        type: "boolean",
        default: false
      }
    },
    required: ["index_hash"]
  }
}
```

**Implementation:**
1. Build JSON: `{ snapshot_type, source_paths, doc_hashes, index_hash, metadata }`
2. Call `POST /v1/worldstate` with `kind="rag_snapshot"`
3. Optionally register DIVT
4. Return `{ wsl_id, divt_id? }`

---

### 4. Agent & Automation Ledger MCP

**Purpose:** Give every agent action a tamper-evident paper trail.

**Tools:**
- `vf.agent_action.log` - Log agent/automation action

**Implementation Status:** ⏳ Pending

**Tool: `vf.agent_action.log`**

```typescript
{
  name: "vf.agent_action.log",
  description: "Give every agent action a tamper-evident paper trail. Perfect for approvals, audit, and 'why did the bot do that?' post-mortems.",
  inputSchema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        description: "Action performed (e.g., 'issue_refund')"
      },
      actor: {
        type: "string",
        description: "Actor that performed action (e.g., 'ai-agent-1')"
      },
      params: {
        type: "object",
        description: "Action parameters"
      },
      context: {
        type: "object",
        properties: {
          run_id: { type: "string" },
          approval: { type: "string" },
          model: { type: "string" },
          reason: { type: "string" }
        },
        description: "Execution context"
      },
      timestamp: {
        type: "string",
        format: "date-time",
        description: "Action timestamp (default: now)"
      },
      also_register_divt: {
        type: "boolean",
        default: false
      }
    },
    required: ["action", "actor"]
  }
}
```

**Implementation:**
1. Build JSON: `{ action, actor, params, context, timestamp }`
2. Call `POST /v1/worldstate` with `kind="agent_action"`
3. Optionally register DIVT
4. Return `{ wsl_id, divt_id? }`

---

### 5. Confidence Scoring MCP

**Purpose:** Add a confidence meter to any LLM answer.

**Tools:**
- `vf.score.privacy` - Privacy-preserving scoring
- `vf.score.full` - Full semantic/faithfulness scoring

**Implementation Status:** ⏳ Pending

**Tool: `vf.score.privacy`**

```typescript
{
  name: "vf.score.privacy",
  description: "Add a confidence meter to any LLM answer. Privacy-preserving scoring uses only IDs, hashes, and similarity scores—no raw content leaves your environment.",
  inputSchema: {
    type: "object",
    properties: {
      query_id: { type: "string" },
      answer_id: { type: "string" },
      evidence: {
        type: "array",
        items: {
          type: "object",
          properties: {
            object_id: { type: "string" },
            divt_id: { type: "string" },
            hash_b64: { type: "string" },
            hash_mode: { type: "string" },
            hash_version: { type: "string" },
            data_type: { type: "string" },
            similarity: { type: "number" },
            chunk_confidence: { type: "number" }
          },
          required: ["object_id", "similarity"]
        }
      },
      model_signals: {
        type: "object",
        description: "Optional model uncertainty signals"
      }
    },
    required: ["evidence"]
  }
}
```

**Tool: `vf.score.full`**

```typescript
{
  name: "vf.score.full",
  description: "Add a confidence meter with full semantic and faithfulness scoring. Uses Groq as judge model to validate answer quality against evidence.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "User query"
      },
      answer: {
        type: "string",
        description: "LLM answer"
      },
      evidence: {
        type: "array",
        items: {
          type: "object",
          properties: {
            object_id: { type: "string" },
            divt_id: { type: "string" },
            text: { type: "string" },
            similarity: { type: "number" },
            data_type: { type: "string" }
          },
          required: ["object_id", "text", "similarity"]
        }
      },
      log_worldstate: {
        type: "string",
        enum: ["none", "minimal", "full"],
        default: "none",
        description: "Whether to log scoring event to worldstate"
      }
    },
    required: ["query", "answer", "evidence"]
  }
}
```

**Implementation:**
- Call `POST /v1/score/privacy` or `POST /v1/score/full`
- Return canonical scoring result

---

### 6. Worldstate Logger MCP

**Purpose:** Capture the moments that matter.

**Tools:**
- `vf.worldstate.create` - Generic worldstate writer

**Implementation Status:** ⏳ Pending

**Tool: `vf.worldstate.create`**

```typescript
{
  name: "vf.worldstate.create",
  description: "One call to capture the moments that matter. Keep a provable history of key events (typed, encrypted, tenant-scoped) that future LSM/DeepDecision jobs can ingest directly.",
  inputSchema: {
    type: "object",
    properties: {
      kind: {
        type: "string",
        description: "Event kind (prompt_receipt, rag_snapshot, agent_action, rf_snapshot, pcap_chunk, weather_feed, custom)"
      },
      data: {
        type: "object",
        description: "Event data (structure depends on kind)"
      },
      metadata: {
        type: "object",
        description: "Optional metadata (tags, source_type, lsm_ingest_ok)"
      },
      timestamp: {
        type: "string",
        format: "date-time",
        description: "Event timestamp (default: now)"
      }
    },
    required: ["kind", "data"]
  }
}
```

**Implementation:**
- Call `POST /v1/worldstate` with provided parameters
- Return `{ wsl_id, stored: true, s3_ref, ledger_status }`

---

### 7. Worldstate Graph Explorer MCP

**Purpose:** Traverse receipts, scores, DIVTs as a graph.

**Tools:**
- `vf.graph.object_neighbors`
- `vf.graph.divt_related`
- `vf.graph.events`

**Implementation Status:** 🚧 Phase 4+ (Stub Only)

**Note:** Requires graph API implementation. For now, define schemas only.

---

### 8. Streaming Ingest MCP

**Purpose:** Ship big artifacts without big headaches.

**Tools:**
- `vf.stream.init`
- `vf.stream.chunk`
- `vf.stream.complete`

**Implementation Status:** ⏳ Pending

**Tool: `vf.stream.init`**

```typescript
{
  name: "vf.stream.init",
  description: "Initialize streaming upload session for large worldstate or register payloads",
  inputSchema: {
    type: "object",
    properties: {
      stream_kind: {
        type: "string",
        enum: ["worldstate", "register_blob"]
      },
      worldstate_kind: {
        type: "string",
        description: "Required if stream_kind=worldstate"
      },
      metadata: {
        type: "object"
      }
    },
    required: ["stream_kind"]
  }
}
```

**Implementation:**
- Opens WebSocket connection to `/v1/ws/upload`
- Returns `{ stream_id, ws_url }`

---

### 9. Keys & Plans Admin MCP

**Purpose:** Rotate keys, segment environments.

**Tools:**
- `vf.keys.create`
- `vf.keys.list`
- `vf.keys.revoke`

**Implementation Status:** ⏳ Pending

**Tool: `vf.keys.create`**

```typescript
{
  name: "vf.keys.create",
  description: "Create a new API key for the tenant. Multiple keys allow environment isolation (production, staging) without separate accounts.",
  inputSchema: {
    type: "object",
    properties: {
      label: {
        type: "string",
        description: "Human-readable label (e.g., 'Production Backend')"
      },
      expires_at: {
        type: "string",
        format: "date-time",
        description: "Optional expiration (Test tier defaults to 7 days)"
      }
    }
  }
}
```

**Implementation:**
- Call `POST /v1/keys`
- Return `{ api_key_id, api_key, key_prefix, label, created_at, status }`

---

### 10. Erasure & Revocation MCP

**Purpose:** Compliance on command.

**Tools:**
- `vf.erasure.request`
- `vf.divt.revoke`

**Implementation Status:** 🚧 Phase 2 (Stub Only)

**Note:** Requires erasure API implementation. Define schemas now, implement later.

---

## Implementation Priority

### Phase 1 (MVP)
1. ✅ **DIVT Registry MCP** - Core functionality
2. ✅ **Prompt Receipts MCP** - High-demand use case
3. ✅ **RAG Snapshots MCP** - High-demand use case
4. ✅ **Worldstate Logger MCP** - Foundation for others
5. ✅ **Confidence Scoring MCP** - Differentiator

### Phase 2 (Completeness)
6. **Agent Ledger MCP** - Compliance feature
7. **Keys Admin MCP** - Developer productivity
8. **Streaming MCP** - Large payload support
9. **Erasure & Revocation MCP** - GDPR/CCPA compliance

### Phase 3+ (Advanced)
10. **Graph Explorer MCP** - Advanced querying

---

## Testing Strategy

Each MCP tool must have:

1. **Input Schema Validation Test**
   - Valid inputs pass
   - Invalid inputs reject with clear errors

2. **API Call Test**
   - Correct VectorForge API/SDK method called
   - Correct parameters passed

3. **Output Validation Test**
   - Response matches expected schema
   - Error handling works correctly

4. **Integration Test**
   - End-to-end with real VectorForge API (test environment)

---

## Usage Examples

### Example 1: Register a Prompt Receipt

```typescript
// Using MCP tool
const result = await mcpClient.callTool("vf.prompt_receipt.create", {
  prompt: "What is the capital of France?",
  response: "Paris",
  model: "gpt-4",
  metadata: {
    user_id: "user-123",
    workflow: "customer_support"
  },
  also_register_divt: true
});

// Returns:
// {
//   wsl_id: "01J6ABC...",
//   divt_id: "01J5YMF..."  // if also_register_divt=true
// }
```

### Example 2: Verify Content

```typescript
// Using MCP tool
const result = await mcpClient.callTool("vf.verify", {
  divt_id: "01J5YMFABC123...",
  mode: "json",
  content: { /* original JSON */ }
});

// Returns:
// {
//   verified: true,
//   hash_match: true,
//   classical_sig_ok: true,
//   pqc_sig_ok: true,
//   revoked: false,
//   ledger_status: "anchored",
//   ...
// }
```

### Example 3: Score Answer

```typescript
// Using MCP tool
const result = await mcpClient.callTool("vf.score.full", {
  query: "What is the capital of France?",
  answer: "Paris",
  evidence: [
    {
      object_id: "doc-123:chunk-5",
      divt_id: "01J5...",
      text: "Paris is the capital and largest city of France.",
      similarity: 0.95,
      data_type: "rag_chunk_v1"
    }
  ],
  log_worldstate: "minimal"
});

// Returns:
// {
//   overall_confidence: 0.92,
//   semantic_confidence: 0.95,
//   integrity_score: 1.0,
//   support_score: 0.98,
//   faithfulness_score: 0.89,
//   worldstate_ref: "01J7..."
// }
```

---

## Next Steps

1. **Implement Phase 1 MCP servers** (DIVT Registry, Prompt Receipts, RAG Snapshots, Worldstate Logger, Scoring)
2. **Write comprehensive tests** for each tool
3. **Create integration examples** for LangChain, n8n
4. **Document deployment** (standalone vs embedded)
5. **Add Phase 2 servers** once erasure APIs exist

---

## Related Documentation

- **[Implementation Plan](../docs/VectorForge%20API%20V2%20Implementation%20Plan.md)** - API specifications
- **[Node SDK](../sdk/node/README.md)** - SDK helper methods
- **[Python SDK](../sdk/python/README.md)** - Python SDK reference

