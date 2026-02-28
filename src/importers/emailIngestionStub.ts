import { logInfo } from '../utils/logger';

/**
 * Email ingestion interface stub.
 *
 * MVP note:
 * - This module intentionally does not connect to a real mailbox.
 * - Wire this into IMAP/POP3/email provider webhook in a later iteration.
 */
export interface EmailIngestionInput {
  rawEmail: string;
}

export interface EmailIngestionResult {
  accepted: boolean;
  reason?: string;
}

export async function ingestEmailSnapshot(_input: EmailIngestionInput): Promise<EmailIngestionResult> {
  logInfo('Email ingestion stub called. No-op in local MVP mode.');

  return {
    accepted: false,
    reason: 'Email ingestion is a stub. See docs/email-ingestion-stub.md for TODO steps.'
  };
}