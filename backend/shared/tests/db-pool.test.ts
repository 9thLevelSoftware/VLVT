/**
 * Tests for createPool factory function
 * Validates resilient PostgreSQL pool configuration (RESIL-01, RESIL-02, RESIL-03)
 */

const mockOn = jest.fn();
const mockPool = { query: jest.fn(), on: mockOn, connect: jest.fn(), end: jest.fn() };
const MockPool = jest.fn(() => mockPool);

jest.mock('pg', () => ({
  Pool: MockPool,
}));

// Must import after jest.mock
import { createPool, CreatePoolOptions } from '../src/utils/db-pool';

describe('createPool', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset env to a clean copy each test
    process.env = { ...originalEnv };
    // Ensure DATABASE_URL is unset unless test sets it
    delete process.env.DATABASE_URL;
    delete process.env.DATABASE_POOL_MAX;
    delete process.env.DATABASE_IDLE_TIMEOUT_MS;
    delete process.env.DATABASE_CONNECTION_TIMEOUT_MS;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('returns a Pool instance', () => {
    const pool = createPool();
    expect(MockPool).toHaveBeenCalledTimes(1);
    expect(pool).toBe(mockPool);
  });

  it('uses DATABASE_URL from environment', () => {
    process.env.DATABASE_URL = 'postgresql://test';
    createPool();
    expect(MockPool).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionString: 'postgresql://test',
      })
    );
  });

  it('default connectionTimeoutMillis is 5000 (RESIL-02)', () => {
    createPool();
    expect(MockPool).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionTimeoutMillis: 5000,
      })
    );
  });

  it('default max is 20', () => {
    createPool();
    expect(MockPool).toHaveBeenCalledWith(
      expect.objectContaining({
        max: 20,
      })
    );
  });

  it('default idleTimeoutMillis is 30000', () => {
    createPool();
    expect(MockPool).toHaveBeenCalledWith(
      expect.objectContaining({
        idleTimeoutMillis: 30000,
      })
    );
  });

  it('respects env var overrides', () => {
    process.env.DATABASE_POOL_MAX = '10';
    process.env.DATABASE_IDLE_TIMEOUT_MS = '15000';
    process.env.DATABASE_CONNECTION_TIMEOUT_MS = '3000';
    createPool();
    expect(MockPool).toHaveBeenCalledWith(
      expect.objectContaining({
        max: 10,
        idleTimeoutMillis: 15000,
        connectionTimeoutMillis: 3000,
      })
    );
  });

  it('attaches error handler that logs but does not crash (RESIL-01)', () => {
    const mockLogger = {
      info: jest.fn(),
      debug: jest.fn(),
      error: jest.fn(),
    };

    const processExitSpy = jest.spyOn(process, 'exit').mockImplementation((() => {}) as never);

    createPool({ logger: mockLogger as any });

    // Find the 'error' handler registration
    const errorCall = mockOn.mock.calls.find(
      (call: any[]) => call[0] === 'error'
    );
    expect(errorCall).toBeDefined();

    // Simulate an idle client error
    const fakeError = new Error('Connection terminated unexpectedly');
    const errorHandler = errorCall![1];
    errorHandler(fakeError);

    expect(mockLogger.error).toHaveBeenCalledWith(
      'Unexpected error on idle database client',
      expect.objectContaining({
        error: 'Connection terminated unexpectedly',
      })
    );

    // process.exit must NOT have been called
    expect(processExitSpy).not.toHaveBeenCalled();

    processExitSpy.mockRestore();
  });

  it('attaches connect, acquire, and remove handlers', () => {
    createPool();

    const registeredEvents = mockOn.mock.calls.map((call: any[]) => call[0]);
    expect(registeredEvents).toContain('connect');
    expect(registeredEvents).toContain('acquire');
    expect(registeredEvents).toContain('remove');
  });

  it('SSL enabled for Railway URLs (RESIL-03)', () => {
    process.env.DATABASE_URL = 'postgresql://user:pass@railway-internal:5432/db';
    createPool();
    expect(MockPool).toHaveBeenCalledWith(
      expect.objectContaining({
        ssl: { rejectUnauthorized: false },
      })
    );
  });

  it('SSL disabled for non-Railway URLs', () => {
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
    createPool();
    expect(MockPool).toHaveBeenCalledWith(
      expect.objectContaining({
        ssl: false,
      })
    );
  });

  it('accepts connectionString override', () => {
    process.env.DATABASE_URL = 'postgresql://env-url';
    createPool({ connectionString: 'custom://url' });
    expect(MockPool).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionString: 'custom://url',
      })
    );
  });

  it('accepts poolConfig overrides', () => {
    createPool({ poolConfig: { max: 5 } });
    expect(MockPool).toHaveBeenCalledWith(
      expect.objectContaining({
        max: 5,
      })
    );
  });
});
