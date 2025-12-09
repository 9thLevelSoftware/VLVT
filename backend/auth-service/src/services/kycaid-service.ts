/**
 * KYCAID Service
 *
 * Handles government ID verification via KYCAID API.
 * Used as a paywall gate - users must verify ID before creating profile.
 */

import crypto from 'crypto';
import logger from '../utils/logger';

// KYCAID API configuration
const KYCAID_API_URL = process.env.KYCAID_API_URL || 'https://api.kycaid.com';
const KYCAID_API_TOKEN = process.env.KYCAID_API_TOKEN;
const KYCAID_FORM_ID = process.env.KYCAID_FORM_ID;

// Verification result types
export interface KycaidApplicant {
  applicant_id: string;
  type: string;
  first_name?: string;
  last_name?: string;
  email?: string;
}

export interface KycaidVerification {
  verification_id: string;
  applicant_id: string;
  status: 'pending' | 'completed' | 'unused';
  verification_status?: 'pending' | 'approved' | 'declined';
  form_id: string;
}

export interface KycaidCallbackData {
  type: string;
  verification_id: string;
  applicant_id: string;
  status: string;
  verification_status?: string;
  verified: boolean;
  verifications?: {
    document?: {
      status: string;
      first_name?: string;
      last_name?: string;
      dob?: string;
      document_type?: string;
      document_number?: string;
      country?: string;
      expiry_date?: string;
    };
    facial?: {
      status: string;
      match: boolean;
    };
    liveness?: {
      status: string;
      passed: boolean;
    };
    aml?: {
      status: string;
      hits: number;
    };
  };
}

/**
 * Check if KYCAID is properly configured
 */
export function isKycaidConfigured(): boolean {
  return !!(KYCAID_API_TOKEN && KYCAID_FORM_ID);
}

/**
 * Make authenticated request to KYCAID API
 */
async function kycaidRequest<T>(
  method: 'GET' | 'POST' | 'PATCH',
  endpoint: string,
  body?: object
): Promise<T> {
  if (!KYCAID_API_TOKEN) {
    throw new Error('KYCAID_API_TOKEN not configured');
  }

  const url = `${KYCAID_API_URL}${endpoint}`;

  const response = await fetch(url, {
    method,
    headers: {
      'Authorization': `Token ${KYCAID_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error('KYCAID API error', {
      status: response.status,
      endpoint,
      error: errorText,
    });
    throw new Error(`KYCAID API error: ${response.status} - ${errorText}`);
  }

  return response.json() as Promise<T>;
}

/**
 * Create or retrieve a KYCAID applicant for a user
 */
export async function createOrGetApplicant(
  userId: string,
  email?: string
): Promise<KycaidApplicant> {
  const applicantData = {
    type: 'PERSON',
    external_applicant_id: userId,
    email: email || undefined,
  };

  try {
    const response = await kycaidRequest<{ applicant_id: string }>(
      'POST',
      '/applicants',
      applicantData
    );

    logger.info('KYCAID applicant created', {
      userId,
      applicantId: response.applicant_id,
    });

    return {
      applicant_id: response.applicant_id,
      type: 'PERSON',
      email,
    };
  } catch (error) {
    logger.error('Failed to create KYCAID applicant', { userId, error });
    throw error;
  }
}

/**
 * Create a verification request for an applicant
 */
export async function createVerification(
  applicantId: string,
  callbackUrl?: string
): Promise<KycaidVerification> {
  if (!KYCAID_FORM_ID) {
    throw new Error('KYCAID_FORM_ID not configured');
  }

  const verificationData: Record<string, unknown> = {
    applicant_id: applicantId,
    form_id: KYCAID_FORM_ID,
  };

  if (callbackUrl) {
    verificationData.callback_url = callbackUrl;
  }

  try {
    const response = await kycaidRequest<{
      verification_id: string;
      applicant_id: string;
      status: string;
      form_id: string;
    }>('POST', '/verifications', verificationData);

    logger.info('KYCAID verification created', {
      applicantId,
      verificationId: response.verification_id,
    });

    return {
      verification_id: response.verification_id,
      applicant_id: response.applicant_id,
      status: response.status as KycaidVerification['status'],
      form_id: response.form_id,
    };
  } catch (error) {
    logger.error('Failed to create KYCAID verification', { applicantId, error });
    throw error;
  }
}

/**
 * Get verification status from KYCAID
 */
export async function getVerificationStatus(
  verificationId: string
): Promise<KycaidVerification & { verifications?: object }> {
  try {
    const response = await kycaidRequest<KycaidVerification & { verifications?: object }>(
      'GET',
      `/verifications/${verificationId}`
    );

    logger.info('KYCAID verification status retrieved', {
      verificationId,
      status: response.status,
      verificationStatus: response.verification_status,
    });

    return response;
  } catch (error) {
    logger.error('Failed to get KYCAID verification status', { verificationId, error });
    throw error;
  }
}

/**
 * Verify callback signature from KYCAID
 * KYCAID uses HMAC-SHA512 with base64 encoding
 */
export function verifyCallbackSignature(
  rawBody: string | Buffer,
  signature: string
): boolean {
  if (!KYCAID_API_TOKEN) {
    logger.error('Cannot verify callback: KYCAID_API_TOKEN not configured');
    return false;
  }

  try {
    // Convert body to base64
    const bodyBase64 = Buffer.isBuffer(rawBody)
      ? rawBody.toString('base64')
      : Buffer.from(rawBody).toString('base64');

    // Create HMAC-SHA512 hash
    const expectedSignature = crypto
      .createHmac('sha512', KYCAID_API_TOKEN)
      .update(bodyBase64)
      .digest('hex');

    // Compare signatures (timing-safe comparison)
    const signatureBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);

    if (signatureBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(signatureBuffer, expectedBuffer);
  } catch (error) {
    logger.error('Error verifying KYCAID callback signature', { error });
    return false;
  }
}

/**
 * Parse and validate callback data from KYCAID
 */
export function parseCallbackData(body: unknown): KycaidCallbackData | null {
  if (!body || typeof body !== 'object') {
    return null;
  }

  const data = body as Record<string, unknown>;

  // Validate required fields
  if (!data.verification_id || !data.applicant_id) {
    logger.warn('Invalid KYCAID callback: missing required fields', { body });
    return null;
  }

  return {
    type: data.type as string || 'VERIFICATION_COMPLETED',
    verification_id: data.verification_id as string,
    applicant_id: data.applicant_id as string,
    status: data.status as string || 'unknown',
    verification_status: data.verification_status as string | undefined,
    verified: data.verified as boolean || false,
    verifications: data.verifications as KycaidCallbackData['verifications'],
  };
}

/**
 * Extract user data from completed verification
 */
export function extractVerifiedUserData(callback: KycaidCallbackData): {
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string;
  documentType?: string;
  documentNumber?: string;
  documentCountry?: string;
  documentExpiry?: string;
  documentVerified: boolean;
  faceMatchVerified: boolean;
  livenessVerified: boolean;
  amlCleared: boolean;
} {
  const doc = callback.verifications?.document;
  const facial = callback.verifications?.facial;
  const liveness = callback.verifications?.liveness;
  const aml = callback.verifications?.aml;

  return {
    firstName: doc?.first_name,
    lastName: doc?.last_name,
    dateOfBirth: doc?.dob,
    documentType: doc?.document_type,
    documentNumber: doc?.document_number,
    documentCountry: doc?.country,
    documentExpiry: doc?.expiry_date,
    documentVerified: doc?.status === 'approved',
    faceMatchVerified: facial?.status === 'approved' && facial?.match === true,
    livenessVerified: liveness?.status === 'approved' && liveness?.passed === true,
    amlCleared: !aml || (aml.status === 'approved' && aml.hits === 0),
  };
}
