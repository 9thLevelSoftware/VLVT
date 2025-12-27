/**
 * Tests for Socket.IO Rate Limiter Middleware
 *
 * Verifies:
 * - Rate limiting works per event type
 * - Different limits apply to different events
 * - Per-socket tracking (not global)
 * - Error events emitted on rate limit exceeded
 * - Socket is not disconnected on rate limit
 * - State cleanup on disconnect
 * - Sliding window algorithm behavior
 * - Handler wrapping functionality
 * - Callback handling when rate limited
 * - Custom configuration options
 */

import {
  createSocketRateLimiter,
  createSocketRateLimiterMiddleware,
  socketRateLimiter,
  DEFAULT_RATE_LIMITS,
  SocketRateLimiterConfig,
  EventRateLimitConfig,
  SocketWithRateLimit,
} from '../src/middleware/socket-rate-limiter';

// Extended mock socket with test helpers
interface MockSocket extends SocketWithRateLimit {
  _trigger: (event: string, ...args: any[]) => void;
  _handlers: Record<string, Function[]>;
}

// Mock Socket
function createMockSocket(id: string = 'test-socket-id'): MockSocket {
  const eventHandlers: Record<string, Function[]> = {};

  const socket: any = {
    id,
    emit: jest.fn(),
    on: jest.fn((event: string, handler: Function) => {
      if (!eventHandlers[event]) {
        eventHandlers[event] = [];
      }
      eventHandlers[event].push(handler);
      return socket;
    }),
    // Helper to trigger events
    _trigger: (event: string, ...args: any[]) => {
      const handlers = eventHandlers[event] || [];
      handlers.forEach((h) => h(...args));
    },
    // Get registered handlers
    _handlers: eventHandlers,
  };

  return socket as MockSocket;
}

describe('Socket Rate Limiter', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('createSocketRateLimiter()', () => {
    it('should create a rate limiter instance with default config', () => {
      const limiter = createSocketRateLimiter();

      expect(limiter).toBeDefined();
      expect(typeof limiter.applyToSocket).toBe('function');
      expect(typeof limiter.wrapHandler).toBe('function');
      expect(typeof limiter.checkRateLimit).toBe('function');
      expect(typeof limiter.peek).toBe('function');
      expect(typeof limiter.getState).toBe('function');
      expect(typeof limiter.resetEvent).toBe('function');
      expect(typeof limiter.resetAll).toBe('function');
      expect(typeof limiter.cleanupSocket).toBe('function');
    });

    it('should accept custom rate limit configuration', () => {
      const customLimits: Record<string, EventRateLimitConfig> = {
        custom_event: { maxEvents: 5, windowMs: 5000 },
      };

      const limiter = createSocketRateLimiter({ limits: customLimits });
      const socket = createMockSocket();

      limiter.applyToSocket(socket);

      // Send 5 events (should all be allowed)
      for (let i = 0; i < 5; i++) {
        const result = limiter.checkRateLimit(socket, 'custom_event');
        expect(result.allowed).toBe(true);
      }

      // 6th event should be rate limited
      const result = limiter.checkRateLimit(socket, 'custom_event');
      expect(result.allowed).toBe(false);
    });
  });

  describe('applyToSocket()', () => {
    it('should initialize rate limit state for a socket', () => {
      const limiter = createSocketRateLimiter();
      const socket = createMockSocket();

      limiter.applyToSocket(socket);

      const state = limiter.getState(socket);
      expect(state).toBeDefined();
      expect(state?.events).toBeInstanceOf(Map);
    });

    it('should store userId if provided', () => {
      const limiter = createSocketRateLimiter();
      const socket = createMockSocket();
      const userId = 'user-123';

      limiter.applyToSocket(socket, userId);

      const state = limiter.getState(socket);
      expect(state?.userId).toBe(userId);
    });

    it('should register disconnect handler for cleanup', () => {
      const limiter = createSocketRateLimiter();
      const socket = createMockSocket();

      limiter.applyToSocket(socket);

      // Verify disconnect handler was registered
      expect(socket.on).toHaveBeenCalledWith('disconnect', expect.any(Function));
    });

    it('should clean up state on disconnect', () => {
      const limiter = createSocketRateLimiter();
      const socket = createMockSocket();

      limiter.applyToSocket(socket);
      expect(limiter.getState(socket)).toBeDefined();

      // Trigger disconnect
      socket._trigger('disconnect');

      expect(limiter.getState(socket)).toBeUndefined();
    });
  });

  describe('checkRateLimit()', () => {
    it('should allow events within rate limit', () => {
      const limiter = createSocketRateLimiter({
        limits: { test_event: { maxEvents: 5, windowMs: 10000 } },
      });
      const socket = createMockSocket();

      limiter.applyToSocket(socket);

      for (let i = 0; i < 5; i++) {
        const result = limiter.checkRateLimit(socket, 'test_event');
        expect(result.allowed).toBe(true);
        expect(result.currentCount).toBe(i + 1);
        expect(result.remaining).toBe(4 - i);
      }
    });

    it('should block events exceeding rate limit', () => {
      const limiter = createSocketRateLimiter({
        limits: { test_event: { maxEvents: 3, windowMs: 10000 } },
      });
      const socket = createMockSocket();

      limiter.applyToSocket(socket);

      // Use up the limit
      for (let i = 0; i < 3; i++) {
        limiter.checkRateLimit(socket, 'test_event');
      }

      // Next event should be blocked
      const result = limiter.checkRateLimit(socket, 'test_event');
      expect(result.allowed).toBe(false);
      expect(result.currentCount).toBe(3);
      expect(result.remaining).toBe(0);
    });

    it('should provide retryAfterMs when rate limited', () => {
      const windowMs = 10000;
      const limiter = createSocketRateLimiter({
        limits: { test_event: { maxEvents: 1, windowMs } },
      });
      const socket = createMockSocket();

      limiter.applyToSocket(socket);

      // First event allowed
      limiter.checkRateLimit(socket, 'test_event');

      // Advance time by 2 seconds
      jest.advanceTimersByTime(2000);

      // Second event should be blocked with retry info
      const result = limiter.checkRateLimit(socket, 'test_event');
      expect(result.allowed).toBe(false);
      expect(result.retryAfterMs).toBeDefined();
      // Should be approximately 8 seconds (10000 - 2000)
      expect(result.retryAfterMs).toBeGreaterThan(7900);
      expect(result.retryAfterMs).toBeLessThanOrEqual(8000);
    });

    it('should allow events after window expires (sliding window)', () => {
      const windowMs = 5000;
      const limiter = createSocketRateLimiter({
        limits: { test_event: { maxEvents: 2, windowMs } },
      });
      const socket = createMockSocket();

      limiter.applyToSocket(socket);

      // Use up the limit
      limiter.checkRateLimit(socket, 'test_event');
      jest.advanceTimersByTime(1000);
      limiter.checkRateLimit(socket, 'test_event');

      // Should be blocked now
      let result = limiter.checkRateLimit(socket, 'test_event');
      expect(result.allowed).toBe(false);

      // Wait for first event to expire (4 more seconds to reach 5s total)
      jest.advanceTimersByTime(4100);

      // Should be allowed again (first event expired)
      result = limiter.checkRateLimit(socket, 'test_event');
      expect(result.allowed).toBe(true);
    });

    it('should track different event types independently', () => {
      const limiter = createSocketRateLimiter({
        limits: {
          event_a: { maxEvents: 2, windowMs: 10000 },
          event_b: { maxEvents: 3, windowMs: 10000 },
        },
      });
      const socket = createMockSocket();

      limiter.applyToSocket(socket);

      // Use up event_a limit
      limiter.checkRateLimit(socket, 'event_a');
      limiter.checkRateLimit(socket, 'event_a');

      // event_a should be blocked
      expect(limiter.checkRateLimit(socket, 'event_a').allowed).toBe(false);

      // event_b should still be allowed
      expect(limiter.checkRateLimit(socket, 'event_b').allowed).toBe(true);
      expect(limiter.checkRateLimit(socket, 'event_b').allowed).toBe(true);
      expect(limiter.checkRateLimit(socket, 'event_b').allowed).toBe(true);

      // Now event_b should be blocked
      expect(limiter.checkRateLimit(socket, 'event_b').allowed).toBe(false);
    });

    it('should track sockets independently (per-socket)', () => {
      const limiter = createSocketRateLimiter({
        limits: { test_event: { maxEvents: 2, windowMs: 10000 } },
      });
      const socket1 = createMockSocket('socket-1');
      const socket2 = createMockSocket('socket-2');

      limiter.applyToSocket(socket1);
      limiter.applyToSocket(socket2);

      // Use up socket1's limit
      limiter.checkRateLimit(socket1, 'test_event');
      limiter.checkRateLimit(socket1, 'test_event');

      // socket1 should be blocked
      expect(limiter.checkRateLimit(socket1, 'test_event').allowed).toBe(false);

      // socket2 should still be allowed (separate tracking)
      expect(limiter.checkRateLimit(socket2, 'test_event').allowed).toBe(true);
      expect(limiter.checkRateLimit(socket2, 'test_event').allowed).toBe(true);
    });

    it('should allow unconfigured events by default', () => {
      const limiter = createSocketRateLimiter({
        limits: { configured_event: { maxEvents: 1, windowMs: 1000 } },
      });
      const socket = createMockSocket();

      limiter.applyToSocket(socket);

      // Unconfigured event should always be allowed
      for (let i = 0; i < 100; i++) {
        const result = limiter.checkRateLimit(socket, 'unconfigured_event');
        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(Infinity);
      }
    });

    it('should return allowed for uninitialized socket', () => {
      const limiter = createSocketRateLimiter();
      const socket = createMockSocket();

      // Don't apply to socket - should still allow
      const result = limiter.checkRateLimit(socket, 'test_event');
      expect(result.allowed).toBe(true);
    });
  });

  describe('wrapHandler()', () => {
    it('should call original handler when not rate limited', () => {
      const limiter = createSocketRateLimiter({
        limits: { test_event: { maxEvents: 5, windowMs: 10000 } },
      });
      const socket = createMockSocket();
      const originalHandler = jest.fn();

      limiter.applyToSocket(socket);

      const wrappedHandler = limiter.wrapHandler('test_event', originalHandler);
      wrappedHandler.call(socket, { data: 'test' });

      expect(originalHandler).toHaveBeenCalledWith({ data: 'test' });
    });

    it('should not call original handler when rate limited', () => {
      const limiter = createSocketRateLimiter({
        limits: { test_event: { maxEvents: 1, windowMs: 10000 } },
      });
      const socket = createMockSocket();
      const originalHandler = jest.fn();

      limiter.applyToSocket(socket);

      const wrappedHandler = limiter.wrapHandler('test_event', originalHandler);

      // First call should work
      wrappedHandler.call(socket, { data: 'test1' });
      expect(originalHandler).toHaveBeenCalledTimes(1);

      // Second call should be rate limited
      wrappedHandler.call(socket, { data: 'test2' });
      expect(originalHandler).toHaveBeenCalledTimes(1); // Still 1
    });

    it('should call callback with error when rate limited', () => {
      const limiter = createSocketRateLimiter({
        limits: { test_event: { maxEvents: 1, windowMs: 10000 } },
      });
      const socket = createMockSocket();
      const originalHandler = jest.fn();
      const callback = jest.fn();

      limiter.applyToSocket(socket);

      const wrappedHandler = limiter.wrapHandler('test_event', originalHandler);

      // Use up the limit
      wrappedHandler.call(socket, { data: 'test' }, jest.fn());

      // This should trigger rate limit error callback
      wrappedHandler.call(socket, { data: 'test' }, callback);

      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: 'Rate limit exceeded',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfterMs: expect.any(Number),
      });
    });

    it('should emit error event when rate limited', () => {
      const limiter = createSocketRateLimiter({
        limits: { test_event: { maxEvents: 1, windowMs: 10000 } },
      });
      const socket = createMockSocket();

      limiter.applyToSocket(socket);

      const wrappedHandler = limiter.wrapHandler('test_event', jest.fn());

      // Use up the limit
      wrappedHandler.call(socket, {});

      // Trigger rate limit
      wrappedHandler.call(socket, {});

      expect(socket.emit).toHaveBeenCalledWith('rate_limit_error', {
        error: 'Rate limit exceeded',
        code: 'RATE_LIMIT_EXCEEDED',
        eventName: 'test_event',
        retryAfterMs: expect.any(Number),
        limit: 1,
      });
    });

    it('should pass through handler return value', () => {
      const limiter = createSocketRateLimiter({
        limits: { test_event: { maxEvents: 5, windowMs: 10000 } },
      });
      const socket = createMockSocket();
      const originalHandler = jest.fn().mockReturnValue('result');

      limiter.applyToSocket(socket);

      const wrappedHandler = limiter.wrapHandler('test_event', originalHandler);
      const result = wrappedHandler.call(socket, {});

      expect(result).toBe('result');
    });
  });

  describe('peek()', () => {
    it('should return current state without recording event', () => {
      const limiter = createSocketRateLimiter({
        limits: { test_event: { maxEvents: 2, windowMs: 10000 } },
      });
      const socket = createMockSocket();

      limiter.applyToSocket(socket);

      // Record one event
      limiter.checkRateLimit(socket, 'test_event');

      // Peek should show 1 event recorded
      let peekResult = limiter.peek(socket, 'test_event');
      expect(peekResult.currentCount).toBe(1);
      expect(peekResult.remaining).toBe(1);

      // Peek again - should still show 1 (peek doesn't record)
      peekResult = limiter.peek(socket, 'test_event');
      expect(peekResult.currentCount).toBe(1);

      // checkRateLimit records another event
      limiter.checkRateLimit(socket, 'test_event');

      // Now peek should show 2
      peekResult = limiter.peek(socket, 'test_event');
      expect(peekResult.currentCount).toBe(2);
    });
  });

  describe('resetEvent()', () => {
    it('should reset rate limit for specific event', () => {
      const limiter = createSocketRateLimiter({
        limits: {
          event_a: { maxEvents: 1, windowMs: 10000 },
          event_b: { maxEvents: 1, windowMs: 10000 },
        },
      });
      const socket = createMockSocket();

      limiter.applyToSocket(socket);

      // Use up both limits
      limiter.checkRateLimit(socket, 'event_a');
      limiter.checkRateLimit(socket, 'event_b');

      // Both should be blocked
      expect(limiter.checkRateLimit(socket, 'event_a').allowed).toBe(false);
      expect(limiter.checkRateLimit(socket, 'event_b').allowed).toBe(false);

      // Reset event_a
      limiter.resetEvent(socket, 'event_a');

      // event_a should be allowed again
      expect(limiter.checkRateLimit(socket, 'event_a').allowed).toBe(true);

      // event_b should still be blocked
      expect(limiter.checkRateLimit(socket, 'event_b').allowed).toBe(false);
    });
  });

  describe('resetAll()', () => {
    it('should reset all rate limits for socket', () => {
      const limiter = createSocketRateLimiter({
        limits: {
          event_a: { maxEvents: 1, windowMs: 10000 },
          event_b: { maxEvents: 1, windowMs: 10000 },
        },
      });
      const socket = createMockSocket();

      limiter.applyToSocket(socket);

      // Use up both limits
      limiter.checkRateLimit(socket, 'event_a');
      limiter.checkRateLimit(socket, 'event_b');

      // Reset all
      limiter.resetAll(socket);

      // Both should be allowed again
      expect(limiter.checkRateLimit(socket, 'event_a').allowed).toBe(true);
      expect(limiter.checkRateLimit(socket, 'event_b').allowed).toBe(true);
    });
  });

  describe('Custom configuration', () => {
    it('should use custom error event name', () => {
      const limiter = createSocketRateLimiter({
        limits: { test_event: { maxEvents: 1, windowMs: 10000 } },
        errorEventName: 'custom_error',
      });
      const socket = createMockSocket();

      limiter.applyToSocket(socket);

      const wrappedHandler = limiter.wrapHandler('test_event', jest.fn());
      wrappedHandler.call(socket, {});
      wrappedHandler.call(socket, {}); // Trigger rate limit

      expect(socket.emit).toHaveBeenCalledWith('custom_error', expect.any(Object));
    });

    it('should call onRateLimitExceeded callback', () => {
      const onRateLimitExceeded = jest.fn();
      const limiter = createSocketRateLimiter({
        limits: { test_event: { maxEvents: 1, windowMs: 10000 } },
        onRateLimitExceeded,
      });
      const socket = createMockSocket();
      const userId = 'user-123';

      limiter.applyToSocket(socket, userId);

      const wrappedHandler = limiter.wrapHandler('test_event', jest.fn());
      wrappedHandler.call(socket, {});
      wrappedHandler.call(socket, {}); // Trigger rate limit

      expect(onRateLimitExceeded).toHaveBeenCalledWith(
        socket,
        'test_event',
        userId
      );
    });

    it('should log violations when logViolations is true', () => {
      const mockLogger = {
        warn: jest.fn(),
        debug: jest.fn(),
      };
      const limiter = createSocketRateLimiter({
        limits: { test_event: { maxEvents: 1, windowMs: 10000 } },
        logViolations: true,
        logger: mockLogger,
      });
      const socket = createMockSocket();

      limiter.applyToSocket(socket, 'user-123');

      const wrappedHandler = limiter.wrapHandler('test_event', jest.fn());
      wrappedHandler.call(socket, {});
      wrappedHandler.call(socket, {}); // Trigger rate limit

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Socket rate limit exceeded',
        expect.objectContaining({
          socketId: socket.id,
          userId: 'user-123',
          eventName: 'test_event',
        })
      );
    });

    it('should not log violations when logViolations is false', () => {
      const mockLogger = {
        warn: jest.fn(),
        debug: jest.fn(),
      };
      const limiter = createSocketRateLimiter({
        limits: { test_event: { maxEvents: 1, windowMs: 10000 } },
        logViolations: false,
        logger: mockLogger,
      });
      const socket = createMockSocket();

      limiter.applyToSocket(socket);

      const wrappedHandler = limiter.wrapHandler('test_event', jest.fn());
      wrappedHandler.call(socket, {});
      wrappedHandler.call(socket, {}); // Trigger rate limit

      expect(mockLogger.warn).not.toHaveBeenCalled();
    });
  });

  describe('DEFAULT_RATE_LIMITS', () => {
    it('should have send_message limit of 30 per minute', () => {
      expect(DEFAULT_RATE_LIMITS.send_message).toEqual({
        maxEvents: 30,
        windowMs: 60000,
      });
    });

    it('should have typing limit of 10 per 10 seconds', () => {
      expect(DEFAULT_RATE_LIMITS.typing).toEqual({
        maxEvents: 10,
        windowMs: 10000,
      });
    });

    it('should have read_receipt limit of 60 per minute', () => {
      expect(DEFAULT_RATE_LIMITS.read_receipt).toEqual({
        maxEvents: 60,
        windowMs: 60000,
      });
    });

    it('should have mark_read limit of 60 per minute', () => {
      expect(DEFAULT_RATE_LIMITS.mark_read).toEqual({
        maxEvents: 60,
        windowMs: 60000,
      });
    });
  });

  describe('createSocketRateLimiterMiddleware()', () => {
    it('should create middleware function', () => {
      const middleware = createSocketRateLimiterMiddleware();
      expect(typeof middleware).toBe('function');
    });

    it('should initialize socket and call next', () => {
      const middleware = createSocketRateLimiterMiddleware();
      const socket = createMockSocket() as SocketWithRateLimit;
      const next = jest.fn();

      middleware(socket, next);

      expect(next).toHaveBeenCalled();
      expect(socket.rateLimitState).toBeDefined();
    });

    it('should extract userId from socket if available', () => {
      const middleware = createSocketRateLimiterMiddleware();
      const socket = createMockSocket() as SocketWithRateLimit;
      (socket as any).userId = 'test-user-id';
      const next = jest.fn();

      middleware(socket, next);

      expect(socket.rateLimitState?.userId).toBe('test-user-id');
    });
  });

  describe('Default socketRateLimiter export', () => {
    it('should be a valid rate limiter instance', () => {
      expect(socketRateLimiter).toBeDefined();
      expect(typeof socketRateLimiter.applyToSocket).toBe('function');
      expect(typeof socketRateLimiter.wrapHandler).toBe('function');
    });

    it('should use default rate limits', () => {
      const socket = createMockSocket();
      socketRateLimiter.applyToSocket(socket);

      // Should allow up to 30 send_message events per minute
      for (let i = 0; i < 30; i++) {
        const result = socketRateLimiter.checkRateLimit(socket, 'send_message');
        expect(result.allowed).toBe(true);
      }

      // 31st should be blocked
      const result = socketRateLimiter.checkRateLimit(socket, 'send_message');
      expect(result.allowed).toBe(false);
      expect(result.maxEvents).toBe(30);
    });
  });

  describe('Edge cases', () => {
    it('should handle rapid successive events correctly', () => {
      const limiter = createSocketRateLimiter({
        limits: { rapid_event: { maxEvents: 100, windowMs: 1000 } },
      });
      const socket = createMockSocket();

      limiter.applyToSocket(socket);

      // Send 100 events as fast as possible
      for (let i = 0; i < 100; i++) {
        expect(limiter.checkRateLimit(socket, 'rapid_event').allowed).toBe(true);
      }

      // 101st should be blocked
      expect(limiter.checkRateLimit(socket, 'rapid_event').allowed).toBe(false);
    });

    it('should handle very long windows correctly', () => {
      const limiter = createSocketRateLimiter({
        limits: { long_window: { maxEvents: 1, windowMs: 3600000 } }, // 1 hour
      });
      const socket = createMockSocket();

      limiter.applyToSocket(socket);

      limiter.checkRateLimit(socket, 'long_window');

      // Should be blocked even after 30 minutes
      jest.advanceTimersByTime(1800000);
      expect(limiter.checkRateLimit(socket, 'long_window').allowed).toBe(false);

      // Should be allowed after 1 hour
      jest.advanceTimersByTime(1800001);
      expect(limiter.checkRateLimit(socket, 'long_window').allowed).toBe(true);
    });

    it('should not affect other sockets when one disconnects', () => {
      const limiter = createSocketRateLimiter({
        limits: { test_event: { maxEvents: 2, windowMs: 10000 } },
      });
      const socket1 = createMockSocket('socket-1');
      const socket2 = createMockSocket('socket-2');

      limiter.applyToSocket(socket1);
      limiter.applyToSocket(socket2);

      // Both sockets send an event
      limiter.checkRateLimit(socket1, 'test_event');
      limiter.checkRateLimit(socket2, 'test_event');

      // Disconnect socket1
      socket1._trigger('disconnect');

      // socket2 should still have its state
      const state = limiter.getState(socket2);
      expect(state).toBeDefined();
      expect(limiter.peek(socket2, 'test_event').currentCount).toBe(1);
    });

    it('should handle callback-less handlers gracefully when rate limited', () => {
      const limiter = createSocketRateLimiter({
        limits: { test_event: { maxEvents: 1, windowMs: 10000 } },
      });
      const socket = createMockSocket();
      const originalHandler = jest.fn();

      limiter.applyToSocket(socket);

      const wrappedHandler = limiter.wrapHandler('test_event', originalHandler);

      // First call
      wrappedHandler.call(socket, { data: 'test' }); // No callback

      // Second call - should not throw even without callback
      expect(() => {
        wrappedHandler.call(socket, { data: 'test' }); // No callback
      }).not.toThrow();
    });
  });
});
