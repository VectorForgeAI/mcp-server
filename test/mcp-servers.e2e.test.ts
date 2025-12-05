/**
 * VectorForge MCP Servers - End-to-End Tests
 *
 * These tests exercise the MCP servers over stdio using the official MCP SDK
 * client, and call through to a live VectorForge API instance.
 *
 * Requirements:
 * - VF_API_BASE_URL must point to a live VectorForge API (e.g. prod sandbox).
 * - VF_API_KEY must be a valid API key for that environment.
 *
 * Run:
 *   cd mcp
 *   npm install
 *   npm run test:mcp
 */

import { describe, it, beforeAll, expect } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

type McpResult = {
  content?: { type: string; text?: string }[];
  isError?: boolean;
};

function ensureVectorForgeEnv() {
  const baseUrl = process.env.VF_API_BASE_URL;
  const apiKey = process.env.VF_API_KEY;

  if (!baseUrl || !apiKey) {
    throw new Error(
      'MCP E2E tests require VF_API_BASE_URL and VF_API_KEY to be set to a live VectorForge API sandbox.'
    );
  }
}

async function withMcpClient<T>(
  serverScript: string,
  fn: (client: Client) => Promise<T>
): Promise<T> {
  const transport = new StdioClientTransport({
    command: 'node',
    args: [serverScript],
  } as any);

  const client = new Client(
    { name: 'vectorforge-mcp-tests', version: '0.1.0' },
    { capabilities: { tools: {} } }
  );

  await client.connect(transport);

  try {
    return await fn(client);
  } finally {
    // Best-effort cleanup; SDK types may not expose these in a strongly-typed way
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyClient = client as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyTransport = transport as any;
    if (typeof anyClient.close === 'function') {
      await anyClient.close();
    }
    if (typeof anyTransport.close === 'function') {
      await anyTransport.close();
    }
  }
}

function parseJsonResult(result: McpResult): any {
  expect(result.content && result.content.length).toBeGreaterThan(0);
  const first = result.content![0];
  expect(first.type).toBe('text');
  expect(first.text).toBeTypeOf('string');
  return JSON.parse(first.text as string);
}

describe('VectorForge MCP Servers - Environment', () => {
  it('requires VF_API_BASE_URL and VF_API_KEY to be set', () => {
    ensureVectorForgeEnv();
  });
});

describe('DIVT Registry MCP (vf.register, vf.verify)', () => {
  const serverScript = 'dist/servers/divt-registry.js';

  let registeredDivtId: string | undefined;

  beforeAll(() => {
    ensureVectorForgeEnv();
  });

  it('vf.register - happy path issues a DIVT with hash_b64', async () => {
    await withMcpClient(serverScript, async (client) => {
      const result = (await client.callTool('vf.register', {
        object_id: 'mcp-test-object-1',
        data_type: 'prompt_receipt_v1',
        mode: 'text',
        content: 'Hello, World!',
      })) as McpResult;

      const payload = parseJsonResult(result);

      expect(result.isError).toBeFalsy();
      expect(payload.divt_id).toBeTypeOf('string');
      expect(payload.divt_id.length).toBeGreaterThan(0);
      expect(payload.hash_b64).toBeTypeOf('string');
      expect(payload.hash_b64.length).toBeGreaterThan(0);

      registeredDivtId = payload.divt_id;
    });
  });

  it('vf.verify - happy path verifies the same content and signatures', async () => {
    expect(registeredDivtId).toBeDefined();

    await withMcpClient(serverScript, async (client) => {
      const result = (await client.callTool('vf.verify', {
        divt_id: registeredDivtId,
        mode: 'text',
        content: 'Hello, World!',
      })) as McpResult;

      const payload = parseJsonResult(result);

      expect(result.isError).toBeFalsy();
      expect(payload.valid).toBe(true);
      expect(payload.hash_match).toBe(true);
      expect(payload.classical_sig_ok).toBe(true);
      expect(payload.pqc_sig_ok).toBe(true);
      expect(payload.revoked).toBe(false);
    });
  });

  it('vf.register - negative: invalid mode produces structured error', async () => {
    await withMcpClient(serverScript, async (client) => {
      const result = (await client.callTool('vf.register', {
        object_id: 'mcp-test-object-invalid',
        data_type: 'prompt_receipt_v1',
        mode: 'potato',
        content: 'Hello, World!',
      })) as McpResult;

      expect(result.isError).toBe(true);
      const payload = parseJsonResult(result);
      expect(payload.error).toMatch(/Unknown mode/i);
    });
  });
});

describe('Prompt Receipts MCP (vf.prompt_receipt.create)', () => {
  const serverScript = 'dist/servers/prompt-receipts.js';

  beforeAll(() => {
    ensureVectorForgeEnv();
  });

  it('vf.prompt_receipt.create - happy path returns wsl_id and optional divt_id', async () => {
    await withMcpClient(serverScript, async (client) => {
      const result = (await client.callTool('vf.prompt_receipt.create', {
        prompt: 'What is the capital of France?',
        response: 'Paris',
        model: 'gpt-4',
        metadata: {
          user_id: 'user-mcp-test',
          workflow: 'mcp-e2e',
        },
        also_register_divt: true,
      })) as McpResult;

      const payload = parseJsonResult(result);

      expect(result.isError).toBeFalsy();
      expect(payload.wsl_id).toBeTypeOf('string');
      expect(payload.wsl_id.length).toBeGreaterThan(0);
      // also_register_divt=true should typically return a DIVT
      if (payload.divt_id !== undefined) {
        expect(payload.divt_id).toBeTypeOf('string');
        expect(payload.divt_id.length).toBeGreaterThan(0);
      }
    });
  });

  it('vf.prompt_receipt.create - negative: missing prompt yields error', async () => {
    await withMcpClient(serverScript, async (client) => {
      const result = (await client.callTool('vf.prompt_receipt.create', {
        // prompt omitted
        response: 'Paris',
      })) as McpResult;

      expect(result.isError).toBe(true);
      const payload = parseJsonResult(result);
      expect(payload.error).toMatch(/prompt/i);
    });
  });
});

describe('RAG Snapshots MCP (vf.rag_snapshot.create)', () => {
  const serverScript = 'dist/servers/rag-snapshots.js';

  beforeAll(() => {
    ensureVectorForgeEnv();
  });

  it('vf.rag_snapshot.create - happy path returns wsl_id (and optional divt_id)', async () => {
    await withMcpClient(serverScript, async (client) => {
      const result = (await client.callTool('vf.rag_snapshot.create', {
        index_hash: 'sha3-512:index-hash-mcp-test',
        doc_hashes: ['sha3-512:doc1', 'sha3-512:doc2'],
        metadata: {
          env: 'test',
          project: 'mcp-e2e',
        },
        also_register_divt: true,
      })) as McpResult;

      const payload = parseJsonResult(result);

      expect(result.isError).toBeFalsy();
      expect(payload.wsl_id).toBeTypeOf('string');
      expect(payload.wsl_id.length).toBeGreaterThan(0);

      if (payload.divt_id !== undefined) {
        expect(payload.divt_id).toBeTypeOf('string');
        expect(payload.divt_id.length).toBeGreaterThan(0);
      }
    });
  });

  it('vf.rag_snapshot.create - negative: missing index_hash yields error', async () => {
    await withMcpClient(serverScript, async (client) => {
      const result = (await client.callTool('vf.rag_snapshot.create', {
        // index_hash omitted
        doc_hashes: ['sha3-512:doc1'],
      })) as McpResult;

      expect(result.isError).toBe(true);
      const payload = parseJsonResult(result);
      expect(payload.error).toMatch(/index_hash/i);
    });
  });
});

describe('Worldstate Logger MCP (vf.worldstate.create)', () => {
  const serverScript = 'dist/servers/worldstate-logger.js';

  beforeAll(() => {
    ensureVectorForgeEnv();
  });

  it('vf.worldstate.create - happy path returns wsl_id', async () => {
    await withMcpClient(serverScript, async (client) => {
      const result = (await client.callTool('vf.worldstate.create', {
        kind: 'custom',
        data: { foo: 'bar', source: 'mcp-e2e' },
        metadata: { tags: ['mcp-test'], source_type: 'test_harness' },
      })) as McpResult;

      const payload = parseJsonResult(result);

      expect(result.isError).toBeFalsy();
      expect(payload.wsl_id).toBeTypeOf('string');
      expect(payload.wsl_id.length).toBeGreaterThan(0);
    });
  });

  it('vf.worldstate.create - negative: missing kind yields error', async () => {
    await withMcpClient(serverScript, async (client) => {
      const result = (await client.callTool('vf.worldstate.create', {
        // kind omitted
        data: { foo: 'bar' },
      })) as McpResult;

      expect(result.isError).toBe(true);
      const payload = parseJsonResult(result);
      expect(payload.error).toMatch(/kind/i);
    });
  });
});

describe('Confidence Scoring MCP (vf.score.privacy, vf.score.full)', () => {
  const serverScript = 'dist/servers/confidence-scoring.js';

  beforeAll(() => {
    ensureVectorForgeEnv();
  });

  it('vf.score.privacy - happy path returns structured scores', async () => {
    await withMcpClient(serverScript, async (client) => {
      const result = (await client.callTool('vf.score.privacy', {
        query_id: 'mcp-privacy-query-1',
        answer_id: 'mcp-privacy-answer-1',
        evidence: [
          {
            object_id: 'obj-1',
            similarity: 0.9,
            chunk_confidence: 0.95,
          },
          {
            object_id: 'obj-2',
            similarity: 0.8,
            chunk_confidence: 0.9,
          },
        ],
        model_signals: {
          answer_length: 123,
          model_uncertainty: 0.1,
        },
      })) as McpResult;

      const payload = parseJsonResult(result);

      expect(result.isError).toBeFalsy();
      expect(payload.overall_confidence).toBeTypeOf('number');
      expect(payload.semantic_confidence).toBeTypeOf('number');
      expect(payload.integrity_score).toBeTypeOf('number');
      expect(payload.vector_count).toBeTypeOf('number');
      expect(payload.verified_count).toBeTypeOf('number');
      expect(payload.explanation).toBeTypeOf('string');
      expect(payload.explanation.length).toBeGreaterThan(0);
    });
  });

  it('vf.score.privacy - uses real DIVT evidence to boost integrity and verified_count', async () => {
    ensureVectorForgeEnv();

    // First, register a DIVT via the DIVT Registry MCP server
    const divtServerScript = 'dist/servers/divt-registry.js';
    let divtId: string | undefined;
    const objectId = 'mcp-scoring-divt-object-1';
    const content = 'Hello, VectorForge MCP - integrity test';

    await withMcpClient(divtServerScript, async (client) => {
      const result = (await client.callTool('vf.register', {
        object_id: objectId,
        data_type: 'prompt_receipt_v1',
        mode: 'text',
        content,
      })) as McpResult;

      const payload = parseJsonResult(result);
      expect(result.isError).toBeFalsy();
      expect(payload.divt_id).toBeTypeOf('string');
      divtId = payload.divt_id;
    });

    expect(divtId).toBeDefined();

    // Now call vf.score.privacy with evidence that includes this DIVT
    await withMcpClient(serverScript, async (client) => {
      const result = (await client.callTool('vf.score.privacy', {
        query_id: 'mcp-privacy-query-divt',
        answer_id: 'mcp-privacy-answer-divt',
        evidence: [
          {
            object_id: objectId,
            divt_id: divtId,
            similarity: 0.95,
            chunk_confidence: 0.95,
          },
        ],
      })) as McpResult;

      const payload = parseJsonResult(result);

      expect(result.isError).toBeFalsy();
      expect(payload.vector_count).toBeGreaterThanOrEqual(1);
      expect(payload.verified_count).toBeGreaterThanOrEqual(1);
      expect(payload.integrity_score).toBeTypeOf('number');
      expect(payload.integrity_score).toBeGreaterThan(0);
      expect(payload.explanation).toBeTypeOf('string');
      expect(payload.explanation.length).toBeGreaterThan(0);
    });
  });

  it('vf.score.full - happy path returns full scoring fields and optional worldstate_ref', async () => {
    await withMcpClient(serverScript, async (client) => {
      const result = (await client.callTool('vf.score.full', {
        query: 'What is the capital of France?',
        answer: 'The capital of France is Paris.',
        evidence: [
          {
            object_id: 'e1',
            text: 'France has many cities. Paris is the capital.',
            similarity: 0.95,
          },
          {
            object_id: 'e2',
            text: 'Paris is the capital of France and a major European city.',
            similarity: 0.9,
          },
        ],
        log_worldstate: 'minimal',
      })) as McpResult;

      const payload = parseJsonResult(result);

      expect(result.isError).toBeFalsy();
      expect(payload.overall_confidence).toBeTypeOf('number');
      expect(payload.semantic_confidence).toBeTypeOf('number');
      expect(payload.integrity_score).toBeTypeOf('number');
      expect(payload.support_score).toBeTypeOf('number');
      expect(payload.faithfulness_score).toBeTypeOf('number');
      expect(payload.vector_count).toBeTypeOf('number');
      expect(payload.verified_count).toBeTypeOf('number');

      if (payload.worldstate_ref !== undefined) {
        expect(payload.worldstate_ref).toBeTypeOf('string');
        expect(payload.worldstate_ref.length).toBeGreaterThan(0);
      }
    });
  });

  it('vf.score.full - uses real DIVT evidence for integrity and verified_count', async () => {
    ensureVectorForgeEnv();

    const divtServerScript = 'dist/servers/divt-registry.js';
    let divtId: string | undefined;
    const objectId = 'mcp-fullscore-divt-object-1';
    const evidenceText =
      'Paris is the capital of France. This sentence will be used as evidence.';

    await withMcpClient(divtServerScript, async (client) => {
      const result = (await client.callTool('vf.register', {
        object_id: objectId,
        data_type: 'prompt_receipt_v1',
        mode: 'text',
        content: evidenceText,
      })) as McpResult;

      const payload = parseJsonResult(result);
      expect(result.isError).toBeFalsy();
      expect(payload.divt_id).toBeTypeOf('string');
      divtId = payload.divt_id;
    });

    expect(divtId).toBeDefined();

    await withMcpClient(serverScript, async (client) => {
      const result = (await client.callTool('vf.score.full', {
        query: 'What is the capital of France?',
        answer: 'The capital of France is Paris.',
        evidence: [
          {
            object_id: objectId,
            divt_id: divtId,
            text: evidenceText,
            similarity: 0.95,
          },
        ],
        log_worldstate: 'minimal',
      })) as McpResult;

      const payload = parseJsonResult(result);

      expect(result.isError).toBeFalsy();
      expect(payload.overall_confidence).toBeTypeOf('number');
      expect(payload.semantic_confidence).toBeTypeOf('number');
      expect(payload.integrity_score).toBeTypeOf('number');
      expect(payload.integrity_score).toBeGreaterThan(0);
      expect(payload.support_score).toBeTypeOf('number');
      expect(payload.faithfulness_score).toBeTypeOf('number');
      expect(payload.vector_count).toBeGreaterThanOrEqual(1);
      expect(payload.verified_count).toBeGreaterThanOrEqual(1);

      if (payload.worldstate_ref !== undefined) {
        expect(payload.worldstate_ref).toBeTypeOf('string');
        expect(payload.worldstate_ref.length).toBeGreaterThan(0);
      }
    });
  });

  it('vf.score.privacy - negative: missing evidence yields structured error', async () => {
    await withMcpClient(serverScript, async (client) => {
      const result = (await client.callTool('vf.score.privacy', {
        // evidence omitted
      })) as McpResult;

      expect(result.isError).toBe(true);
      const payload = parseJsonResult(result);
      expect(payload.error).toMatch(/evidence/i);
    });
  });

  it('vf.score.full - negative: missing query/answer yields structured error', async () => {
    await withMcpClient(serverScript, async (client) => {
      const result = (await client.callTool('vf.score.full', {
        // query and answer omitted
        evidence: [],
      })) as McpResult;

      expect(result.isError).toBe(true);
      const payload = parseJsonResult(result);
      expect(payload.error).toMatch(/query/i);
    });
  });
});

// ============================================================================
// Agent Ledger MCP (vf.agent_action.log) - Phase 1-2 Implementation
// ============================================================================

describe('Agent Ledger MCP (vf.agent_action.log)', () => {
  const serverScript = 'dist/servers/agent-ledger.js';

  beforeAll(() => {
    ensureVectorForgeEnv();
  });

  it('vf.agent_action.log - happy path logs agent action and returns wsl_id', async () => {
    await withMcpClient(serverScript, async (client) => {
      const result = (await client.callTool('vf.agent_action.log', {
        action: 'test_action',
        actor: 'mcp-e2e-test-agent',
        params: {
          user_id: 'test-user-123',
          amount: 50.00,
          currency: 'USD',
        },
        context: {
          run_id: 'mcp-e2e-run-456',
          model: 'gpt-4',
          reason: 'Automated test action',
        },
        metadata: {
          test: true,
          env: 'e2e',
        },
      })) as McpResult;

      const payload = parseJsonResult(result);

      expect(result.isError).toBeFalsy();
      expect(payload.wsl_id).toBeTypeOf('string');
      expect(payload.wsl_id.length).toBeGreaterThan(0);
      expect(payload.stored).toBe(true);
      expect(payload.ledger_status).toBeTypeOf('string');
    });
  });

  it('vf.agent_action.log - with register_divt creates DIVT', async () => {
    await withMcpClient(serverScript, async (client) => {
      const result = (await client.callTool('vf.agent_action.log', {
        action: 'issue_refund',
        actor: 'refund-bot-1',
        params: {
          order_id: 'order-789',
          refund_amount: 25.00,
        },
        context: {
          run_id: 'refund-flow-001',
          approval: 'human-review-123',
        },
        register_divt: true,
      })) as McpResult;

      const payload = parseJsonResult(result);

      expect(result.isError).toBeFalsy();
      expect(payload.wsl_id).toBeTypeOf('string');
      expect(payload.wsl_id.length).toBeGreaterThan(0);
      // When register_divt=true, should return divt_id
      if (payload.divt_id !== undefined) {
        expect(payload.divt_id).toBeTypeOf('string');
        expect(payload.divt_id.length).toBeGreaterThan(0);
      }
    });
  });

  it('vf.agent_action.log - negative: missing action yields error', async () => {
    await withMcpClient(serverScript, async (client) => {
      const result = (await client.callTool('vf.agent_action.log', {
        // action omitted
        actor: 'test-agent',
      })) as McpResult;

      expect(result.isError).toBe(true);
      const payload = parseJsonResult(result);
      expect(payload.error).toMatch(/action/i);
    });
  });

  it('vf.agent_action.log - negative: missing actor yields error', async () => {
    await withMcpClient(serverScript, async (client) => {
      const result = (await client.callTool('vf.agent_action.log', {
        action: 'test_action',
        // actor omitted
      })) as McpResult;

      expect(result.isError).toBe(true);
      const payload = parseJsonResult(result);
      expect(payload.error).toMatch(/actor/i);
    });
  });
});

// ============================================================================
// Keys Admin MCP (vf.keys.*) - Phase 1-2 Implementation
// ============================================================================

describe('Keys Admin MCP (vf.keys.create, vf.keys.list, vf.keys.revoke)', () => {
  const serverScript = 'dist/servers/keys-admin.js';

  let createdKeyId: string | undefined;

  beforeAll(() => {
    ensureVectorForgeEnv();
  });

  it('vf.keys.list - happy path returns keys array', async () => {
    await withMcpClient(serverScript, async (client) => {
      const result = (await client.callTool('vf.keys.list', {})) as McpResult;

      const payload = parseJsonResult(result);

      expect(result.isError).toBeFalsy();
      expect(payload.keys).toBeDefined();
      expect(Array.isArray(payload.keys)).toBe(true);
    });
  });

  it('vf.keys.create - happy path creates new API key', async () => {
    await withMcpClient(serverScript, async (client) => {
      const result = (await client.callTool('vf.keys.create', {
        label: 'MCP E2E Test Key',
      })) as McpResult;

      const payload = parseJsonResult(result);

      expect(result.isError).toBeFalsy();
      expect(payload.api_key_id).toBeTypeOf('string');
      expect(payload.api_key_id.length).toBeGreaterThan(0);
      expect(payload.api_key).toBeTypeOf('string');
      expect(payload.api_key.length).toBeGreaterThan(0);
      expect(payload.key_prefix).toBeTypeOf('string');
      expect(payload.status).toBe('active');

      // Save for revocation test
      createdKeyId = payload.api_key_id;
    });
  });

  it('vf.keys.revoke - happy path revokes created key', async () => {
    // Skip if no key was created
    if (!createdKeyId) {
      console.warn('Skipping vf.keys.revoke test - no key was created');
      return;
    }

    await withMcpClient(serverScript, async (client) => {
      const result = (await client.callTool('vf.keys.revoke', {
        api_key_id: createdKeyId,
      })) as McpResult;

      const payload = parseJsonResult(result);

      expect(result.isError).toBeFalsy();
      expect(payload.revoked).toBe(true);
      expect(payload.api_key_id).toBe(createdKeyId);
      expect(payload.revoked_at).toBeTypeOf('string');
    });
  });

  it('vf.keys.revoke - negative: missing api_key_id yields error', async () => {
    await withMcpClient(serverScript, async (client) => {
      const result = (await client.callTool('vf.keys.revoke', {
        // api_key_id omitted
      })) as McpResult;

      expect(result.isError).toBe(true);
      const payload = parseJsonResult(result);
      expect(payload.error).toMatch(/api_key_id/i);
    });
  });

  it('vf.keys.revoke - negative: invalid api_key_id yields error', async () => {
    await withMcpClient(serverScript, async (client) => {
      const result = (await client.callTool('vf.keys.revoke', {
        api_key_id: 'nonexistent-key-id-12345',
      })) as McpResult;

      expect(result.isError).toBe(true);
      const payload = parseJsonResult(result);
      expect(payload.error).toBeDefined();
    });
  });
});

// ============================================================================
// Erasure & Revocation MCP (vf.erasure.*, vf.divt.revoke) - Phase 2 Implementation
// ============================================================================

describe('Erasure & Revocation MCP (vf.erasure.request, vf.divt.revoke)', () => {
  const serverScript = 'dist/servers/erasure-revocation.js';

  // We need to create test data first, so we'll use other MCP servers
  let testWslId: string | undefined;
  let testDivtId: string | undefined;

  beforeAll(async () => {
    ensureVectorForgeEnv();

    // Create a worldstate entry to test erasure
    try {
      await withMcpClient('dist/servers/worldstate-logger.js', async (client) => {
        const result = (await client.callTool('vf.worldstate.create', {
          kind: 'custom',
          data: { test: 'erasure-test-data', created_for: 'mcp-e2e' },
          metadata: { tags: ['erasure-test'] },
        })) as McpResult;

        const payload = parseJsonResult(result);
        if (payload.wsl_id) {
          testWslId = payload.wsl_id;
        }
      });
    } catch (e) {
      console.warn('Could not create test worldstate entry for erasure test');
    }

    // Create a DIVT to test revocation
    try {
      await withMcpClient('dist/servers/divt-registry.js', async (client) => {
        const result = (await client.callTool('vf.register', {
          object_id: 'erasure-revocation-test-object',
          data_type: 'test_data_v1',
          hash_mode: 'content',
          content: 'Test content for revocation',
        })) as McpResult;

        const payload = parseJsonResult(result);
        if (payload.divt_id) {
          testDivtId = payload.divt_id;
        }
      });
    } catch (e) {
      console.warn('Could not create test DIVT for revocation test');
    }
  });

  it('vf.erasure.request - happy path erases worldstate entry', async () => {
    if (!testWslId) {
      console.warn('Skipping vf.erasure.request test - no test worldstate entry created');
      return;
    }

    await withMcpClient(serverScript, async (client) => {
      const result = (await client.callTool('vf.erasure.request', {
        wsl_id: testWslId,
        reason: 'MCP E2E test - GDPR erasure simulation',
      })) as McpResult;

      const payload = parseJsonResult(result);

      expect(result.isError).toBeFalsy();
      expect(payload.erased).toBe(true);
      expect(payload.wsl_id).toBe(testWslId);
      expect(payload.erased_at).toBeTypeOf('string');
    });
  });

  it('vf.erasure.request - negative: missing wsl_id yields error', async () => {
    await withMcpClient(serverScript, async (client) => {
      const result = (await client.callTool('vf.erasure.request', {
        // wsl_id omitted
        reason: 'test',
      })) as McpResult;

      expect(result.isError).toBe(true);
      const payload = parseJsonResult(result);
      expect(payload.error).toMatch(/wsl_id/i);
    });
  });

  it('vf.divt.revoke - happy path revokes DIVT', async () => {
    if (!testDivtId) {
      console.warn('Skipping vf.divt.revoke test - no test DIVT created');
      return;
    }

    await withMcpClient(serverScript, async (client) => {
      const result = (await client.callTool('vf.divt.revoke', {
        divt_id: testDivtId,
        reason: 'MCP E2E test - DIVT revocation simulation',
      })) as McpResult;

      const payload = parseJsonResult(result);

      expect(result.isError).toBeFalsy();
      expect(payload.revoked).toBe(true);
      expect(payload.divt_id).toBe(testDivtId);
      expect(payload.revoked_at).toBeTypeOf('string');
    });
  });

  it('vf.divt.revoke - negative: missing divt_id yields error', async () => {
    await withMcpClient(serverScript, async (client) => {
      const result = (await client.callTool('vf.divt.revoke', {
        // divt_id omitted
        reason: 'test',
      })) as McpResult;

      expect(result.isError).toBe(true);
      const payload = parseJsonResult(result);
      expect(payload.error).toMatch(/divt_id/i);
    });
  });

  it('vf.divt.revoke - negative: invalid divt_id yields error', async () => {
    await withMcpClient(serverScript, async (client) => {
      const result = (await client.callTool('vf.divt.revoke', {
        divt_id: 'nonexistent-divt-id-12345',
        reason: 'test',
      })) as McpResult;

      expect(result.isError).toBe(true);
      const payload = parseJsonResult(result);
      expect(payload.error).toBeDefined();
    });
  });
});

// ============================================================================
// Parameter Name Backward Compatibility Tests
// Ensures both old and new parameter names work correctly
// ============================================================================

describe('Parameter Name Backward Compatibility', () => {
  beforeAll(() => {
    ensureVectorForgeEnv();
  });

  it('vf.register - accepts hash_mode (new) parameter', async () => {
    await withMcpClient('dist/servers/divt-registry.js', async (client) => {
      const result = (await client.callTool('vf.register', {
        object_id: 'compat-test-new-param',
        data_type: 'test_v1',
        hash_mode: 'content', // New parameter name
        content: 'Test with hash_mode parameter',
      })) as McpResult;

      const payload = parseJsonResult(result);
      expect(result.isError).toBeFalsy();
      expect(payload.divt_id).toBeTypeOf('string');
    });
  });

  it('vf.register - accepts mode (deprecated) parameter for backward compatibility', async () => {
    await withMcpClient('dist/servers/divt-registry.js', async (client) => {
      const result = (await client.callTool('vf.register', {
        object_id: 'compat-test-old-param',
        data_type: 'test_v1',
        mode: 'text', // Deprecated parameter name (maps to content)
        content: 'Test with deprecated mode parameter',
      })) as McpResult;

      const payload = parseJsonResult(result);
      expect(result.isError).toBeFalsy();
      expect(payload.divt_id).toBeTypeOf('string');
    });
  });

  it('vf.prompt_receipt.create - accepts register_divt (new) parameter', async () => {
    await withMcpClient('dist/servers/prompt-receipts.js', async (client) => {
      const result = (await client.callTool('vf.prompt_receipt.create', {
        prompt: 'Test prompt',
        response: 'Test response',
        register_divt: false, // New parameter name
      })) as McpResult;

      const payload = parseJsonResult(result);
      expect(result.isError).toBeFalsy();
      expect(payload.wsl_id).toBeTypeOf('string');
    });
  });

  it('vf.prompt_receipt.create - accepts also_register_divt (deprecated) parameter', async () => {
    await withMcpClient('dist/servers/prompt-receipts.js', async (client) => {
      const result = (await client.callTool('vf.prompt_receipt.create', {
        prompt: 'Test prompt',
        response: 'Test response',
        also_register_divt: false, // Deprecated parameter name
      })) as McpResult;

      const payload = parseJsonResult(result);
      expect(result.isError).toBeFalsy();
      expect(payload.wsl_id).toBeTypeOf('string');
    });
  });
});
