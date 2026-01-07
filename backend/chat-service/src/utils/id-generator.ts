import { v4 as uuidv4 } from 'uuid';

/**
 * Generate a unique match ID using UUID v4
 * Format: match_<uuid>
 */
export function generateMatchId(): string {
  return `match_${uuidv4()}`;
}

/**
 * Generate a unique message ID using UUID v4
 * Format: msg_<uuid>
 */
export function generateMessageId(): string {
  return `msg_${uuidv4()}`;
}

/**
 * Generate a unique block ID using UUID v4
 * Format: block_<uuid>
 */
export function generateBlockId(): string {
  return `block_${uuidv4()}`;
}

/**
 * Generate a unique report ID using UUID v4
 * Format: report_<uuid>
 */
export function generateReportId(): string {
  return `report_${uuidv4()}`;
}
