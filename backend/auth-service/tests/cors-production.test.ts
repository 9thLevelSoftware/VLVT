/**
 * CORS Production Configuration Tests
 *
 * Verifies that CORS_ORIGIN is required in production environments
 * to prevent unintended origins from accessing the API.
 */

describe('CORS Production Configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should throw error in production when CORS_ORIGIN is not set', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.CORS_ORIGIN;

    await expect(import('../src/index')).rejects.toThrow('CORS_ORIGIN');
  });

  it('should use localhost fallback in development', async () => {
    process.env.NODE_ENV = 'development';
    delete process.env.CORS_ORIGIN;

    // Should not throw
    const { default: app } = await import('../src/index');
    expect(app).toBeDefined();
  });
});
