/**
 * VectorForge DIVT Registry MCP Server
 * 
 * Purpose: Issue and verify cryptographic "birth certificates" for any object.
 * Tools: vf.register, vf.verify
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { createVectorForgeClient } from '@vectorforge/sdk';
import type { RegisterResult, VerifyResult } from '../types/mcp-schemas.js';

const server = new Server(
  {
    name: 'vectorforge-divt-registry',
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
        name: 'vf.register',
        description:
          'Issue and verify cryptographic birth certificates for any object—then prove integrity anywhere it travels. PQC signatures and deterministic hashing make authenticity portable and audit-ready.',
        inputSchema: {
          type: 'object',
          properties: {
            object_id: {
              type: 'string',
              description: 'Unique identifier for the object',
            },
            data_type: {
              type: 'string',
              description: "Logical data type (e.g., 'prompt_receipt_v1')",
            },
            hash_mode: {
              type: 'string',
              enum: ['content', 'json', 'embedding', 'image', 'custom'],
              description: 'Canonicalization mode (content for text, custom for pre-computed hash)',
            },
            hash_version: {
              type: 'string',
              description: 'Hash version (e.g., content_v1, json_canon_v1) - optional, inferred if not provided',
            },
            content: {
              description:
                'Content to register (string for text, object for JSON, array for embedding, base64 for image)',
            },
            hash_b64: {
              type: 'string',
              description: 'Pre-computed SHA3-512 hash (advanced mode)',
            },
            metadata: {
              type: 'object',
              description: 'Optional metadata',
            },
          },
          required: ['object_id', 'data_type', 'hash_mode'],
        },
      },
      {
        name: 'vf.verify',
        description:
          'Verify content against a registered DIVT with full cryptographic validation',
        inputSchema: {
          type: 'object',
          properties: {
            divt_id: {
              type: 'string',
              description: 'DIVT identifier to verify against',
            },
            hash_mode: {
              type: 'string',
              enum: ['content', 'json', 'embedding', 'image', 'custom'],
              description: 'Canonicalization mode (optional if just checking DIVT)',
            },
            content: {
              description: 'Content to verify (optional, for hash matching)',
            },
            hash_b64: {
              type: 'string',
              description: 'Hash to verify (advanced mode)',
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
    if (name === 'vf.register') {
      const { object_id, data_type, content, hash_b64, hash_version, metadata } = args as {
        object_id: string;
        data_type: string;
        content?: any;
        hash_b64?: string;
        hash_version?: string;
        metadata?: Record<string, any>;
      };

      // Support both hash_mode (new) and mode (deprecated) parameters
      let hash_mode = (args as any).hash_mode || (args as any).mode;
      
      // Map deprecated 'text' to 'content' and 'hash' to 'custom'
      if (hash_mode === 'text') hash_mode = 'content';
      if (hash_mode === 'hash') hash_mode = 'custom';

      let result: RegisterResult;

      switch (hash_mode) {
        case 'content':
          if (typeof content !== 'string') {
            throw new Error('Content must be a string for content mode');
          }
          result = await vfClient.registerContent(object_id, content, data_type, metadata);
          break;

        case 'json':
          if (typeof content !== 'object') {
            throw new Error('Content must be an object for JSON mode');
          }
          result = await vfClient.registerJson(object_id, content, data_type, metadata);
          break;

        case 'embedding':
          if (!Array.isArray(content)) {
            throw new Error('Content must be an array for embedding mode');
          }
          result = await vfClient.registerEmbedding(object_id, content, data_type, metadata);
          break;

        case 'image':
          if (typeof content !== 'string') {
            throw new Error('Content must be base64 string for image mode');
          }
          const imageBuffer = Buffer.from(content, 'base64');
          result = await vfClient.registerImage(object_id, imageBuffer, data_type, metadata);
          break;

        case 'custom':
          if (!hash_b64) {
            throw new Error('hash_b64 required for custom mode');
          }
          // Use low-level register for advanced hash mode
          result = await vfClient.register({
            object_id,
            hash_mode: 'custom',
            hash_version: hash_version || 'custom_v1',
            hash_b64,
            data_type,
            metadata,
          });
          break;

        default:
          throw new Error(`Unknown hash_mode: ${hash_mode}`);
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

    if (name === 'vf.verify') {
      const { divt_id, content, hash_b64 } = args as {
        divt_id: string;
        content?: any;
        hash_b64?: string;
      };

      // Support both hash_mode (new) and mode (deprecated) parameters
      let hash_mode = (args as any).hash_mode || (args as any).mode;
      
      // Map deprecated 'text' to 'content' and 'hash' to 'custom'
      if (hash_mode === 'text') hash_mode = 'content';
      if (hash_mode === 'hash') hash_mode = 'custom';

      // If hash_b64 provided directly, use it
      if (hash_b64) {
        const result: VerifyResult = await vfClient.verify({
          divt_id,
          hash_b64,
        });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      // If content provided with hash_mode, recompute hash
      if (content && hash_mode) {
        const { canon } = await import('@vectorforge/sdk');
        let computedHash: string;

        switch (hash_mode) {
          case 'content':
            computedHash = canon.hashContentV1(content as string);
            break;
          case 'json':
            computedHash = canon.hashJsonV1(content);
            break;
          case 'embedding':
            computedHash = canon.hashEmbeddingV1(content as number[]);
            break;
          case 'image':
            const imageBuffer = Buffer.from(content as string, 'base64');
            computedHash = await canon.hashImageV1(imageBuffer);
            break;
          default:
            throw new Error(`Unknown hash_mode: ${hash_mode}`);
        }

        const result: VerifyResult = await vfClient.verify({
          divt_id,
          hash_b64: computedHash,
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      // Just verify DIVT without content
      const result: VerifyResult = await vfClient.verify({ divt_id });

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
  console.error('VectorForge DIVT Registry MCP server running on stdio');
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});

