/**
 * VectorForge Agent & Automation Ledger MCP Server
 * 
 * Purpose: Give every agent action a tamper-evident paper trail.
 * Tools: vf.agent_action.log
 * 
 * Per Implementation Plan Section 10.2 - MCP Server #4
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { createVectorForgeClient } from '@vectorforge/sdk';
import type { AgentActionResult } from '../types/mcp-schemas.js';

const server = new Server(
  {
    name: 'vectorforge-agent-ledger',
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
        name: 'vf.agent_action.log',
        description:
          'Give every agent action a tamper-evident paper trail. Perfect for approvals, audit, and "why did the bot do that?" post-mortems. Logs agent/automation actions to worldstate with optional DIVT registration.',
        inputSchema: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              description: 'Action name (e.g., "issue_refund", "approve_request", "send_email")',
            },
            actor: {
              type: 'string',
              description: 'Agent or automation identifier (e.g., "ai-agent-1", "n8n-workflow-xyz")',
            },
            params: {
              type: 'object',
              description: 'Action parameters (e.g., { user_id, amount, currency })',
            },
            context: {
              type: 'object',
              properties: {
                run_id: { type: 'string', description: 'Workflow/run identifier' },
                approval: { type: 'string', description: 'Human approval reference if any' },
                model: { type: 'string', description: 'Model used for decision' },
                reason: { type: 'string', description: 'Auto-generated rationale text' },
              },
              description: 'Execution context (run_id, approval, model, reason)',
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
              description: 'Action timestamp (ISO 8601, default: now)',
            },
            metadata: {
              type: 'object',
              description: 'Additional metadata (tags, source_type)',
            },
            register_divt: {
              type: 'boolean',
              default: false,
              description: 'Also create a DIVT for this action log entry',
            },
          },
          required: ['action', 'actor'],
        },
      },
    ],
  };
});

// Tool execution handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === 'vf.agent_action.log') {
      const {
        action,
        actor,
        params,
        context,
        timestamp,
        metadata,
      } = args as {
        action: string;
        actor: string;
        params?: Record<string, any>;
        context?: {
          run_id?: string;
          approval?: string;
          model?: string;
          reason?: string;
        };
        timestamp?: string;
        metadata?: Record<string, any>;
      };

      // Support both register_divt (new) and also_register_divt (deprecated)
      const register_divt = (args as any).register_divt ?? (args as any).also_register_divt ?? false;

      // Validate required fields
      if (!action) {
        throw new Error('action is required');
      }
      if (!actor) {
        throw new Error('actor is required');
      }

      const actionTimestamp = timestamp || new Date().toISOString();

      // Build agent action payload per Implementation Plan Section 8.3
      const actionData = {
        action,
        actor,
        params: params || {},
        context: context || {},
      };

      // Create worldstate entry with kind="agent_action"
      const worldstateResponse = await fetch(`${baseUrl}/v1/worldstate`, {
        method: 'POST',
        headers: {
          'X-Api-Key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          kind: 'agent_action',
          canon: { type: 'json', v: '1' },
          timestamp: actionTimestamp,
          data: actionData,
          metadata: {
            tags: ['agent', action],
            source_type: 'automation',
            ...metadata,
          },
        }),
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
      
      const result: AgentActionResult = {
        wsl_id: worldstateResult.wsl_id,
        stored: worldstateResult.stored !== undefined ? worldstateResult.stored : true,
        s3_ref: worldstateResult.s3_ref || '',
        ledger_status: worldstateResult.ledger_status || 'pending',
      };

      // Optionally register DIVT
      if (register_divt) {
        const divtResult = await vfClient.registerJson(
          `agent_action:${result.wsl_id}`,
          actionData,
          'agent_action_v1',
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
  console.error('VectorForge Agent Ledger MCP server running on stdio');
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});

