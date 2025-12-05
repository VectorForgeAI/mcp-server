/**
 * VectorForge Keys & Plans Admin MCP Server
 * 
 * Purpose: Give platform teams a clean control surface: rotate keys,
 * segment environments, and keep usage aggregated at the tenant plan.
 * Tools: vf.keys.create, vf.keys.list, vf.keys.revoke
 * 
 * Per Implementation Plan Section 10.2 - MCP Server #9
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { 
  KeyCreateResult, 
  KeyListResult, 
  KeyRevokeResult 
} from '../types/mcp-schemas.js';

const server = new Server(
  {
    name: 'vectorforge-keys-admin',
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
        name: 'vf.keys.create',
        description:
          'Create a new API key for the authenticated tenant. Keys can be labeled by environment (production, staging) or application (web, mobile, CLI). All keys share the tenant\'s plan quotas.',
        inputSchema: {
          type: 'object',
          properties: {
            label: {
              type: 'string',
              description: 'Human-readable label (e.g., "Production Backend", "Staging App")',
            },
            expires_at: {
              type: 'string',
              format: 'date-time',
              description: 'Optional expiration timestamp (ISO 8601). Test tier keys default to 7 days.',
            },
          },
          required: [],
        },
      },
      {
        name: 'vf.keys.list',
        description:
          'List all API keys for the authenticated tenant. Returns metadata only (no secrets). Shows active and revoked keys with their labels, creation time, and last used timestamp.',
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
      {
        name: 'vf.keys.revoke',
        description:
          'Revoke an API key immediately. The key will no longer be usable for authentication. Self-revocation (revoking the current key) is prevented.',
        inputSchema: {
          type: 'object',
          properties: {
            api_key_id: {
              type: 'string',
              description: 'The UUID of the API key to revoke',
            },
          },
          required: ['api_key_id'],
        },
      },
    ],
  };
});

// Tool execution handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === 'vf.keys.create') {
      const { label, expires_at } = args as {
        label?: string;
        expires_at?: string;
      };

      // Call POST /v1/keys
      const response = await fetch(`${baseUrl}/v1/keys`, {
        method: 'POST',
        headers: {
          'X-Api-Key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          label,
          expires_at,
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({})) as any;
        throw new Error(
          `Keys API error (${response.status}): ${
            error.message || error.error || response.statusText
          }`
        );
      }

      const result = await response.json() as KeyCreateResult;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }

    if (name === 'vf.keys.list') {
      // Call GET /v1/keys
      const response = await fetch(`${baseUrl}/v1/keys`, {
        method: 'GET',
        headers: {
          'X-Api-Key': apiKey,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({})) as any;
        throw new Error(
          `Keys API error (${response.status}): ${
            error.message || error.error || response.statusText
          }`
        );
      }

      const result = await response.json() as KeyListResult;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }

    if (name === 'vf.keys.revoke') {
      const { api_key_id } = args as {
        api_key_id: string;
      };

      if (!api_key_id) {
        throw new Error('api_key_id is required');
      }

      // Call POST /v1/keys/:id/revoke
      const response = await fetch(`${baseUrl}/v1/keys/${api_key_id}/revoke`, {
        method: 'POST',
        headers: {
          'X-Api-Key': apiKey,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({})) as any;
        throw new Error(
          `Keys API error (${response.status}): ${
            error.message || error.error || response.statusText
          }`
        );
      }

      const result = await response.json() as KeyRevokeResult;

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
  console.error('VectorForge Keys Admin MCP server running on stdio');
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});

