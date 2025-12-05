/**
 * VectorForge RAG Snapshots MCP Server
 * 
 * Purpose: Freeze your knowledge base in time.
 * Tools: vf.rag_snapshot.create
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { createVectorForgeClient } from '@vectorforge/sdk';
import type { ReceiptResult } from '../types/mcp-schemas.js';

const server = new Server(
  {
    name: 'vectorforge-rag-snapshots',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Initialize VectorForge client
const vfClient = createVectorForgeClient();

// Validate environment
const baseUrl = process.env.VF_API_BASE_URL;
const apiKey = process.env.VF_API_KEY;

if (!baseUrl || !apiKey) {
  console.error(
    'Error: VF_API_BASE_URL and VF_API_KEY environment variables are required'
  );
  process.exit(1);
}

// Tool definitions
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'vf.rag_snapshot.create',
        description:
          'Freeze your knowledge base in time. Version and seal each corpus/index so every answer you ship is traceable to the exact content and build that produced it.',
        inputSchema: {
          type: 'object',
          properties: {
            snapshot_type: {
              type: 'string',
              default: 'rag-corpus',
              description: 'Type of snapshot',
            },
            source_paths: {
              type: 'array',
              items: { type: 'string' },
              description: 'Source paths for documents',
            },
            doc_hashes: {
              type: 'array',
              items: { type: 'string' },
              description: 'Hashes of documents in corpus',
            },
            index_hash: {
              type: 'string',
              description: 'Hash of the index manifest (required)',
            },
            metadata: {
              type: 'object',
              properties: {
                env: { type: 'string' },
                project: { type: 'string' },
                git_sha: { type: 'string' },
              },
              description: 'Build and environment metadata',
            },
            register_divt: {
              type: 'boolean',
              default: false,
              description: 'Also create a DIVT for this snapshot',
            },
          },
          required: ['index_hash'],
        },
      },
    ],
  };
});

// Tool execution handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === 'vf.rag_snapshot.create') {
      const {
        snapshot_type = 'rag-corpus',
        source_paths,
        doc_hashes,
        index_hash,
        metadata,
      } = args as {
        snapshot_type?: string;
        source_paths?: string[];
        doc_hashes?: string[];
        index_hash: string;
        metadata?: Record<string, any>;
      };

      // Support both register_divt (new) and also_register_divt (deprecated)
      const register_divt = (args as any).register_divt ?? (args as any).also_register_divt ?? false;

      // Build RAG snapshot payload
      const snapshotData = {
        snapshot_type,
        source_paths: source_paths || [],
        doc_hashes: doc_hashes || [],
        index_hash,
        metadata: metadata || {},
      };

      const timestamp = new Date().toISOString();

      // Create worldstate entry
      const worldstateResponse = await fetch(`${baseUrl}/v1/worldstate`, {
        method: 'POST',
        headers: {
          'X-Api-Key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          kind: 'rag_snapshot',
          canon: { type: 'json', v: '1' },
          timestamp,
          data: snapshotData,
          metadata: {
            tags: ['rag', 'snapshot'],
            source_type: 'rag_system',
            lsm_ingest_ok: true,
          },
        }),
      });

      if (!worldstateResponse.ok) {
        const error = await worldstateResponse.json().catch(() => ({})) as any;
        throw new Error(
          `Worldstate API error: ${error.message || worldstateResponse.statusText}`
        );
      }

      const worldstateResult = await worldstateResponse.json() as any;
      const result: ReceiptResult = {
        wsl_id: worldstateResult.wsl_id,
        stored: worldstateResult.stored !== undefined ? worldstateResult.stored : true,
        s3_ref: worldstateResult.s3_ref || '',
        ledger_status: worldstateResult.ledger_status || 'pending',
      };

      // Optionally register DIVT
      if (register_divt) {
        const divtResult = await vfClient.registerJson(
          `rag_snapshot:${result.wsl_id}`,
          snapshotData,
          'rag_snapshot_v1',
          metadata
        );
        result.divt_id = divtResult.divt_id;
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }

    throw new Error(`Unknown tool: ${name}`);
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              error: error instanceof Error ? error.message : String(error),
            },
            null,
            2
          ),
        },
      ],
      isError: true,
    };
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('VectorForge RAG Snapshots MCP server running on stdio');
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});

