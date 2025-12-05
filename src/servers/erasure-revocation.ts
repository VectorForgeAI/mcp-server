/**
 * VectorForge Erasure & Revocation MCP Server
 * 
 * Purpose: Compliance on command. Revoke a DIVT or erase worldstate with
 * a cryptographically auditable trail—aligning with GDPR/CCPA-style expectations.
 * Tools: vf.erasure.request, vf.divt.revoke
 * 
 * Per Implementation Plan Section 10.2 - MCP Server #10
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { 
  ErasureResult, 
  DivtRevokeResult 
} from '../types/mcp-schemas.js';

const server = new Server(
  {
    name: 'vectorforge-erasure-revocation',
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
        name: 'vf.erasure.request',
        description:
          'Delete or anonymize worldstate blobs for compliance (GDPR/CCPA). Creates a cryptographically auditable erasure record in the immutable ledger. The data is replaced with a minimal tombstone.',
        inputSchema: {
          type: 'object',
          properties: {
            wsl_id: {
              type: 'string',
              description: 'Worldstate log ID to erase',
            },
            reason: {
              type: 'string',
              description: 'Reason for erasure (e.g., "GDPR right to erasure request", "data retention policy")',
            },
          },
          required: ['wsl_id'],
        },
      },
      {
        name: 'vf.divt.revoke',
        description:
          'Mark a DIVT as revoked. The DIVT will no longer verify as valid, but the revocation event is recorded in the immutable ledger for audit. Use this when the underlying data is no longer trustworthy or has been erased.',
        inputSchema: {
          type: 'object',
          properties: {
            divt_id: {
              type: 'string',
              description: 'The DIVT ID to revoke',
            },
            reason: {
              type: 'string',
              description: 'Reason for revocation (e.g., "source data erased", "data integrity compromise")',
            },
          },
          required: ['divt_id'],
        },
      },
    ],
  };
});

// Tool execution handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === 'vf.erasure.request') {
      const { wsl_id, reason } = args as {
        wsl_id: string;
        reason?: string;
      };

      if (!wsl_id) {
        throw new Error('wsl_id is required');
      }

      // Call DELETE /v1/worldstate/:wsl_id
      const url = new URL(`${baseUrl}/v1/worldstate/${wsl_id}`);
      if (reason) {
        url.searchParams.set('reason', reason);
      }

      const response = await fetch(url.toString(), {
        method: 'DELETE',
        headers: {
          'X-Api-Key': apiKey,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({})) as any;
        throw new Error(
          `Erasure API error (${response.status}): ${
            error.message || error.error || response.statusText
          }`
        );
      }

      const apiResult = await response.json() as any;
      
      const result: ErasureResult = {
        erased: apiResult.erased ?? true,
        wsl_id: apiResult.wsl_id || wsl_id,
        erased_at: apiResult.erased_at || new Date().toISOString(),
        ledger_tx_id: apiResult.ledger_tx_id,
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

    if (name === 'vf.divt.revoke') {
      const { divt_id, reason } = args as {
        divt_id: string;
        reason?: string;
      };

      if (!divt_id) {
        throw new Error('divt_id is required');
      }

      // Call POST /v1/divts/:divt_id/revoke
      const response = await fetch(`${baseUrl}/v1/divts/${divt_id}/revoke`, {
        method: 'POST',
        headers: {
          'X-Api-Key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reason }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({})) as any;
        throw new Error(
          `Revocation API error (${response.status}): ${
            error.message || error.error || response.statusText
          }`
        );
      }

      const apiResult = await response.json() as any;
      
      const result: DivtRevokeResult = {
        revoked: apiResult.revoked ?? true,
        divt_id: apiResult.divt_id || divt_id,
        revoked_at: apiResult.revoked_at || new Date().toISOString(),
        ledger_tx_id: apiResult.ledger_tx_id,
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
  console.error('VectorForge Erasure & Revocation MCP server running on stdio');
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});

