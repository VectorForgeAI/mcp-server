# VectorForge MCP Servers

Model Context Protocol (MCP) servers for VectorForge APIs, providing drop-in tools for LangChain, n8n, and agent frameworks.

## Installation

```bash
git clone https://github.com/VectorForgeAI/mcp-server
cd mcp-server
npm install
npm run build
```

## Overview

VectorForge MCP servers expose VectorForge's trust and confidence APIs as MCP tools, enabling:
- **DIVT Registration & Verification** - Cryptographic "birth certificates" for data
- **AI Prompt Receipts** - Immutable audit trail for AI interactions
- **RAG Snapshots** - Version control for knowledge bases
- **Confidence Scoring** - Privacy-preserving and full semantic scoring
- **Worldstate Logging** - Typed event capture for future analysis

## Quick Start

### Configuration

Set environment variables:

```bash
export VF_API_BASE_URL="https://api.vectorforge.ai"
export VF_API_KEY="vf_prod_YourApiKeyHere"
```

### Running a Server

```bash
# DIVT Registry MCP
node dist/servers/divt-registry.js

# Prompt Receipts MCP
node dist/servers/prompt-receipts.js
```

## Available MCP Servers

### 1. DIVT Registry MCP

**Tools:** `vf.register`, `vf.verify`

**Purpose:** Issue and verify cryptographic "birth certificates" for any object.

**Example:**
```json
{
  "tool": "vf.register",
  "arguments": {
    "object_id": "prompt:123",
    "data_type": "prompt_receipt_v1",
    "mode": "text",
    "content": "What is the capital of France?"
  }
}
```

**Response:**
```json
{
  "divt_id": "019abc12-3456-7890-abcd-ef0123456789",
  "hash_b64": "OOBcM9ewZxJ/IX2MhW5VT8/wnJM...",
  "ecdsa_sig_b64": "MIGIAkIB5ib9xCa0b9bGQ0d0qu...",
  "ml_dsa_sig_b64": "tzOxKAUf84D/me6eKmz6e436pUq...",
  "ledger_status": "pending",
  "created_at": "2025-11-21T10:00:00Z"
}
```

---

### 2. Prompt Receipts MCP

**Tools:** `vf.prompt_receipt.create`

**Purpose:** Get a receipt for every AI call.

**Example:**
```json
{
  "tool": "vf.prompt_receipt.create",
  "arguments": {
    "prompt": "What is the capital of France?",
    "response": "Paris",
    "model": "gpt-4",
    "metadata": {
      "user_id": "user-123",
      "workflow": "customer_support"
    },
    "also_register_divt": true
  }
}
```

**Response:**
```json
{
  "wsl_id": "01J6ABC123...",
  "divt_id": "019abc12-3456..."
}
```

---

### 3. RAG Snapshots MCP

**Tools:** `vf.rag_snapshot.create`

**Purpose:** Freeze your knowledge base in time.

**Status:** Coming soon

---

### 4. Worldstate Logger MCP

**Tools:** `vf.worldstate.create`

**Purpose:** Generic worldstate event logger.

**Status:** Coming soon

---

### 5. Confidence Scoring MCP

**Tools:** `vf.score.privacy`, `vf.score.full`

**Purpose:** Add confidence meters to LLM answers.

**Status:** Coming soon

---

## Integration Examples

### LangChain

```typescript
import { MCPTool } from '@langchain/community/tools/mcp';

const divtTool = new MCPTool({
  serverCommand: 'node',
  serverArgs: ['mcp/dist/servers/divt-registry.js'],
  toolName: 'vf.register',
});

const result = await divtTool.call({
  object_id: 'doc-123',
  data_type: 'prompt_receipt_v1',
  mode: 'text',
  content: 'Hello, World!',
});
```

### n8n

1. Install MCP plugin
2. Add VectorForge MCP server
3. Use "Call MCP Tool" node
4. Select tool (e.g., `vf.register`)
5. Provide arguments

### Direct MCP Client

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({
  command: 'node',
  args: ['mcp/dist/servers/divt-registry.js'],
});

const client = new Client(
  { name: 'my-app', version: '1.0.0' },
  { capabilities: {} }
);

await client.connect(transport);

const result = await client.callTool('vf.register', {
  object_id: 'test-123',
  data_type: 'prompt_receipt_v1',
  mode: 'text',
  content: 'Hello, World!',
});
```

---

## Development

### Project Structure

```
mcp/
├── package.json
├── tsconfig.json
├── src/
│   ├── servers/
│   │   ├── divt-registry.ts      ✅ Implemented
│   │   ├── prompt-receipts.ts    ✅ Implemented
│   │   ├── rag-snapshots.ts      🚧 TODO
│   │   ├── worldstate.ts         🚧 TODO
│   │   └── scoring.ts            🚧 TODO
│   └── types/
│       └── mcp-schemas.ts        ✅ Implemented
├── README.md
├── MCP_IMPLEMENTATION_GUIDE.md   📖 Full specs
└── IMPLEMENTATION_STATUS.md      📊 Progress tracker
```

### Building

```bash
npm run build
```

### Testing

```bash
# Test DIVT Registry
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node dist/servers/divt-registry.js
```

---

## Documentation

- **[Implementation Guide](./MCP_IMPLEMENTATION_GUIDE.md)** - Complete tool specifications
- **[Implementation Status](./IMPLEMENTATION_STATUS.md)** - Progress tracker
- **[VectorForge API Docs](../docs/VectorForge%20API%20V2%20Implementation%20Plan.md)** - API reference
- **[Node SDK](../sdk/node/README.md)** - SDK documentation

---

## Claude Desktop Integration

Add to your Claude Desktop configuration file:

**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`  
**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "vectorforge-divt": {
      "command": "node",
      "args": ["/path/to/mcp-server/dist/servers/divt-registry.js"],
      "env": {
        "VF_API_KEY": "vf_prod_YourApiKeyHere",
        "VF_API_BASE_URL": "https://api.vectorforge.ai"
      }
    }
  }
}
```

---

## Support

- **Issues:** [GitHub Issues](https://github.com/VectorForgeAI/mcp-server/issues)
- **Website:** [https://vectorforge.ai](https://vectorforge.ai)

---

## License

MIT © VectorForge

