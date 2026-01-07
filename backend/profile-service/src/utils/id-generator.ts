import { v4 as uuidv4 } from 'uuid';

/**
 * Generate a unique match ID using UUID v4
 * Format: match_<uuid>
 */
export function generateMatchId(): string {
  return `match_${uuidv4()}`;
}
