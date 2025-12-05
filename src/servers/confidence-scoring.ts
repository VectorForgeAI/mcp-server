/**
 * VectorForge Confidence Scoring MCP Server
 * 
 * Purpose: Add confidence meters to LLM answers.
 * Tools: vf.score.privacy, vf.score.full
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type {
  PrivacyScoreResult,
  FullScoreResult,
  PrivacyEvidence,
  FullEvidence,
} from '../types/mcp-schemas.js';

const server = new Server(
  {
    name: 'vectorforge-confidence-scoring',
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
        name: 'vf.score.privacy',
        description:
          'Add a confidence meter to any LLM answer. Choose privacy-preserving scoring to get structural and cryptographic integrity signals without sharing content.',
        inputSchema: {
          type: 'object',
          properties: {
            query_id: {
              type: 'string',
              description: 'Query identifier (optional)',
            },
            answer_id: {
              type: 'string',
              description: 'Answer identifier (optional)',
            },
            evidence: {
              type: 'array',
              description: 'Evidence items used to generate answer',
              items: {
                type: 'object',
                properties: {
                  object_id: { type: 'string' },
                  divt_id: { type: 'string' },
                  hash_b64: { type: 'string' },
                  hash_mode: { type: 'string' },
                  hash_version: { type: 'string' },
                  data_type: { type: 'string' },
                  similarity: { type: 'number' },
                  chunk_confidence: { type: 'number' },
                },
                required: ['similarity', 'chunk_confidence'],
              },
            },
            model_signals: {
              type: 'object',
              description:
                'Optional model signals (answer_length, model_uncertainty)',
            },
          },
          required: ['evidence'],
        },
      },
      {
        name: 'vf.score.full',
        description:
          'Add a confidence meter to any LLM answer. Full scoring combines semantic support, faithfulness, and crypto integrity using Groq judges, so you can gate high-risk actions on strong signals.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'User query',
            },
            answer: {
              type: 'string',
              description: 'LLM answer',
            },
            evidence: {
              type: 'array',
              description: 'Evidence items with full text',
              items: {
                type: 'object',
                properties: {
                  object_id: { type: 'string' },
                  divt_id: { type: 'string' },
                  text: { type: 'string' },
                  similarity: { type: 'number' },
                  data_type: { type: 'string' },
                },
                required: ['text', 'similarity'],
              },
            },
            log_worldstate: {
              type: 'string',
              enum: ['none', 'minimal', 'full'],
              default: 'none',
              description: 'Whether to log scoring event to worldstate',
            },
          },
          required: ['query', 'answer', 'evidence'],
        },
      },
    ],
  };
});

// Tool execution handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === 'vf.score.privacy') {
      const { query_id, answer_id, evidence, model_signals } = args as {
        query_id?: string;
        answer_id?: string;
        evidence: PrivacyEvidence[];
        model_signals?: Record<string, any>;
      };

      // Call privacy score API
      const response = await fetch(`${baseUrl}/v1/score/privacy`, {
        method: 'POST',
        headers: {
          'X-Api-Key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query_id,
          answer_id,
          evidence,
          model_signals,
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({})) as any;
        throw new Error(
          `Score Privacy API error (${response.status}): ${
            error.message || response.statusText
          }`
        );
      }

      const result = await response.json() as PrivacyScoreResult;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }

    if (name === 'vf.score.full') {
      const { query, answer, evidence, log_worldstate = 'none' } = args as {
        query: string;
        answer: string;
        evidence: FullEvidence[];
        log_worldstate?: 'none' | 'minimal' | 'full';
      };

      // Call full score API
      const response = await fetch(`${baseUrl}/v1/score/full`, {
        method: 'POST',
        headers: {
          'X-Api-Key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          answer,
          evidence,
          options: {
            log_worldstate,
          },
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({})) as any;
        throw new Error(
          `Score Full API error (${response.status}): ${
            error.message || response.statusText
          }`
        );
      }

      const result = await response.json() as FullScoreResult;

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
  console.error('VectorForge Confidence Scoring MCP server running on stdio');
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});

