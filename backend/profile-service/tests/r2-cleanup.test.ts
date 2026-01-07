/**
 * Tests for R2 photo cleanup functionality
 * Used during profile deletion for GDPR compliance
 */

// Mock the AWS SDK before importing the module
const mockSend = jest.fn();

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({
    send: mockSend,
  })),
  PutObjectCommand: jest.fn(),
  DeleteObjectCommand: jest.fn().mockImplementation((params) => params),
  HeadObjectCommand: jest.fn(),
  GetObjectCommand: jest.fn(),
}));

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(),
}));

// Set environment variables before importing
process.env.R2_ACCOUNT_ID = 'test-account-id';
process.env.R2_ACCESS_KEY_ID = 'test-access-key';
process.env.R2_SECRET_ACCESS_KEY = 'test-secret-key';
process.env.R2_BUCKET_NAME = 'test-bucket';

import { deleteUserPhotos } from '../src/utils/r2-client';

describe('R2 Photo Cleanup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSend.mockResolvedValue({});
  });

  describe('deleteUserPhotos', () => {
    it('should delete all photos for a user', async () => {
      const photos = [
        'photos/user123/photo1.jpg',
        'photos/user123/photo2.jpg',
      ];

      const result = await deleteUserPhotos('user123', photos);

      expect(result.deleted).toBe(2);
      expect(result.failed).toBe(0);
      expect(mockSend).toHaveBeenCalledTimes(2);
    });

    it('should handle empty photo array gracefully', async () => {
      const result = await deleteUserPhotos('user123', []);

      expect(result.deleted).toBe(0);
      expect(result.failed).toBe(0);
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('should handle null/undefined photo array', async () => {
      const result = await deleteUserPhotos('user123', null as any);

      expect(result.deleted).toBe(0);
      expect(result.failed).toBe(0);
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('should extract R2 key from full URLs', async () => {
      const photos = [
        'https://test-account-id.r2.cloudflarestorage.com/photos/user123/photo1.jpg',
      ];

      const result = await deleteUserPhotos('user123', photos);

      expect(result.deleted).toBe(1);
      expect(result.failed).toBe(0);
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          Bucket: 'test-bucket',
          Key: 'photos/user123/photo1.jpg',
        })
      );
    });

    it('should skip legacy local paths (/uploads/)', async () => {
      const photos = [
        '/uploads/user123/photo1.jpg',
        'photos/user123/photo2.jpg', // This one should be deleted
      ];

      const result = await deleteUserPhotos('user123', photos);

      // Only the R2 key should be deleted, legacy path should be skipped
      expect(result.deleted).toBe(1);
      expect(result.failed).toBe(0);
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('should count failed deletions', async () => {
      mockSend
        .mockResolvedValueOnce({}) // First photo succeeds
        .mockRejectedValueOnce(new Error('R2 error')); // Second photo fails

      const photos = [
        'photos/user123/photo1.jpg',
        'photos/user123/photo2.jpg',
      ];

      const result = await deleteUserPhotos('user123', photos);

      expect(result.deleted).toBe(1);
      expect(result.failed).toBe(1);
    });

    it('should handle mixed R2 keys and URLs', async () => {
      const photos = [
        'photos/user123/photo1.jpg', // Direct R2 key
        'https://example.r2.cloudflarestorage.com/photos/user123/photo2.jpg', // Full URL
        '/uploads/legacy/photo3.jpg', // Legacy path (should skip)
      ];

      const result = await deleteUserPhotos('user123', photos);

      expect(result.deleted).toBe(2);
      expect(result.failed).toBe(0);
      expect(mockSend).toHaveBeenCalledTimes(2);
    });
  });

  describe('R2 credentials not configured', () => {
    beforeEach(() => {
      // Reset module cache to reload with different env vars
      jest.resetModules();
    });

    it('should return early when R2 credentials are missing', async () => {
      // Temporarily remove env vars
      const originalAccountId = process.env.R2_ACCOUNT_ID;
      delete process.env.R2_ACCOUNT_ID;

      // Re-import with missing credentials
      jest.isolateModules(async () => {
        const { deleteUserPhotos: deleteUserPhotosNoConfig } = require('../src/utils/r2-client');

        const photos = ['photos/user123/photo1.jpg'];
        const result = await deleteUserPhotosNoConfig('user123', photos);

        expect(result.deleted).toBe(0);
        expect(result.failed).toBe(0);
      });

      // Restore env var
      process.env.R2_ACCOUNT_ID = originalAccountId;
    });
  });
});
