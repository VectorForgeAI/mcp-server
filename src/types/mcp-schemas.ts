/**
 * Shared type definitions for VectorForge MCP servers
 * 
 * Updated: 2025-11-28
 * - Added AgentActionResult for Agent Ledger MCP
 * - Added Key management types for Keys Admin MCP
 * - Added Erasure and Revocation types for compliance MCPs
 */

// VectorForge SDK types re-export
export type {
  RegisterResult,
  VerifyResult,
} from '@vectorforge-ai/sdk';

// Worldstate response types
export interface WorldstateCreateResult {
  wsl_id: string;
  stored: boolean;
  s3_ref: string;
  ledger_status: 'pending' | 'anchored';
}

// Scoring response types
export interface PrivacyScoreResult {
  overall_confidence: number;
  semantic_confidence: number;
  integrity_score: number;
  vector_count: number;
  verified_count: number;
  explanation: string;
}

export interface FullScoreResult extends PrivacyScoreResult {
  support_score: number;
  faithfulness_score: number;
  worldstate_ref?: {
    wsl_id: string;
    s3_ref?: string;
  };
}

// Combined result types for receipt operations
export interface ReceiptResult {
  wsl_id: string;
  divt_id?: string;
  stored: boolean;
  s3_ref: string;
  ledger_status: 'pending' | 'anchored';
}

// Agent action result (extends receipt result with same fields)
export interface AgentActionResult {
  wsl_id: string;
  divt_id?: string;
  stored: boolean;
  s3_ref: string;
  ledger_status: 'pending' | 'anchored';
}

// Evidence types for scoring
export interface PrivacyEvidence {
  object_id: string;
  divt_id?: string;
  hash_b64?: string;
  hash_mode?: string;
  hash_version?: string;
  data_type?: string;
  similarity: number;
  chunk_confidence?: number;
}

export interface FullEvidence {
  object_id: string;
  divt_id?: string;
  text: string;
  similarity: number;
  data_type?: string;
}

// ============================================================================
// Keys Admin MCP Types (vf.keys.*)
// Per Implementation Plan Section 10.2 - MCP Server #9
// ============================================================================

export interface KeyMetadata {
  api_key_id: string;
  key_prefix: string;
  label?: string;
  status: 'active' | 'revoked';
  created_at: string;
  last_used_at?: string;
  expires_at?: string;
}

export interface KeyCreateResult {
  api_key_id: string;
  api_key: string; // Raw key, only shown once at creation
  key_prefix: string;
  label?: string;
  status: 'active';
  created_at: string;
  expires_at?: string;
}

export interface KeyListResult {
  keys: KeyMetadata[];
}

export interface KeyRevokeResult {
  revoked: boolean;
  api_key_id: string;
  revoked_at: string;
}

// ============================================================================
// Erasure & Revocation MCP Types (vf.erasure.*, vf.divt.revoke)
// Per Implementation Plan Section 10.2 - MCP Server #10
// ============================================================================

export interface ErasureResult {
  erased: boolean;
  wsl_id: string;
  erased_at: string;
  ledger_tx_id?: string;
}

export interface DivtRevokeResult {
  revoked: boolean;
  divt_id: string;
  revoked_at: string;
  ledger_tx_id?: string;
}

