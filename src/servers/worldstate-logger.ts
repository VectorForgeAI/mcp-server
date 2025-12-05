/**
 * VectorForge Worldstate Logger MCP Server
 * 
 * Purpose: Generic worldstate event logger.
 * Tools: vf.worldstate.create
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { WorldstateCreateResult } from '../types/mcp-schemas.js';

const server = new Server(
  {
    name: 'vectorforge-worldstate-logger',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

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
        name: 'vf.worldstate.create',
        description:
          'One call to capture the moments that matter. Keep a provable history of key events (typed, encrypted, tenant-scoped) that future LSM/DeepDecision jobs can ingest directly.',
        inputSchema: {
          type: 'object',
          properties: {
            kind: {
              type: 'string',
              description:
                'Event kind (prompt_receipt, rag_snapshot, agent_action, rf_snapshot, pcap_chunk, weather_feed, custom)',
            },
            data: {
              type: 'object',
              description: 'Event data (structure depends on kind)',
            },
            metadata: {
              type: 'object',
              description:
                'Optional metadata (tags, source_type, lsm_ingest_ok)',
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
              description: 'Event timestamp (default: now)',
            },
          },
          required: ['kind', 'data'],
        },
      },
    ],
  };
});

// Tool execution handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === 'vf.worldstate.create') {
      const { kind, data, metadata, timestamp } = args as {
        kind: string;
        data: Record<string, any>;
        metadata?: Record<string, any>;
        timestamp?: string;
      };

      // Build worldstate payload
      const payload = {
        kind,
        canon: { type: 'json', v: '1' },
        timestamp: timestamp || new Date().toISOString(),
        data,
        metadata: metadata || {},
      };

      // Create worldstate entry
      const worldstateResponse = await fetch(`${baseUrl}/v1/worldstate`, {
        method: 'POST',
        headers: {
          'X-Api-Key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!worldstateResponse.ok) {
        const error = await worldstateResponse.json().catch(() => ({})) as any;
        throw new Error(
          `Worldstate API error (${worldstateResponse.status}): ${
            error.message || worldstateResponse.statusText
          }`
        );
      }

      const worldstateResult = await worldstateResponse.json() as any;
      
      const result: WorldstateCreateResult = {
        wsl_id: worldstateResult.wsl_id,
        stored: worldstateResult.stored !== undefined ? worldstateResult.stored : true,
        s3_ref: worldstateResult.s3_ref || '',
        ledger_status: worldstateResult.ledger_status || 'pending',
      };

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
  console.error('VectorForge Worldstate Logger MCP server running on stdio');
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});

