/**
 * VectorForge AI Prompt & Output Receipts MCP Server
 * 
 * Purpose: Get a receipt for every AI call.
 * Tools: vf.prompt_receipt.create
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
    name: 'vectorforge-prompt-receipts',
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

// Tool definitions
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'vf.prompt_receipt.create',
        description:
          'Get a receipt for every AI call. Stamp prompts and answers into worldstate (and optionally register a DIVT) so you can explain what was asked, what was answered, and when.',
        inputSchema: {
          type: 'object',
          properties: {
            prompt: {
              type: 'string',
              description: 'AI prompt text',
            },
            response: {
              type: 'string',
              description: 'AI response text',
            },
            model: {
              type: 'string',
              description: "Model used (e.g., 'gpt-4')",
            },
            metadata: {
              type: 'object',
              properties: {
                user_id: { type: 'string' },
                workflow: { type: 'string' },
                run_id: { type: 'string' },
                timestamp: { type: 'string', format: 'date-time' },
              },
              description: 'Additional context',
            },
            register_divt: {
              type: 'boolean',
              default: false,
              description: 'Also create a DIVT for this receipt',
            },
          },
          required: ['prompt', 'response'],
        },
      },
    ],
  };
});

// Tool execution handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === 'vf.prompt_receipt.create') {
      const {
        prompt,
        response,
        model,
        metadata,
      } = args as {
        prompt: string;
        response: string;
        model?: string;
        metadata?: Record<string, any>;
      };

      // Support both register_divt (new) and also_register_divt (deprecated)
      const register_divt = (args as any).register_divt ?? (args as any).also_register_divt ?? false;

      // Build prompt receipt payload
      const receiptData = {
        type: 'prompt_receipt_v1',
        prompt,
        response,
        model: model || 'unknown',
        metadata: metadata || {},
        timestamp: new Date().toISOString(),
      };

      // Create worldstate entry
      // Note: This requires a worldstate API endpoint which may not be implemented yet
      // For now, we'll structure the call assuming POST /v1/worldstate exists
      const worldstateResponse = await fetch(
        `${process.env.VF_API_BASE_URL}/v1/worldstate`,
        {
          method: 'POST',
          headers: {
            'X-Api-Key': process.env.VF_API_KEY || '',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            kind: 'prompt_receipt',
            canon: { type: 'json', v: '1' },
            timestamp: receiptData.timestamp,
            data: receiptData,
            metadata: {
              tags: ['prompt_receipt'],
              source_type: 'ai_generated',
              lsm_ingest_ok: true,
            },
          }),
        }
      );

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
          `prompt_receipt:${result.wsl_id}`,
          receiptData,
          'prompt_receipt_v1',
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
  console.error('VectorForge Prompt Receipts MCP server running on stdio');
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});

