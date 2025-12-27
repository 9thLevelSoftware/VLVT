/**
 * Socket.IO Rate Limiter Middleware
 *
 * Per-socket rate limiting for real-time messaging to prevent chat spam and abuse.
 * Uses a sliding window algorithm to track event counts per socket/user.
 *
 * Features:
 * - Different rate limits per event type (message, typing, read_receipt)
 * - Per-socket/user tracking (not global)
 * - Emits error events when rate limit exceeded (doesn't disconnect)
 * - Automatic cleanup on socket disconnect
 * - Configurable limits and windows
 */

/**
 * Minimal Socket interface for rate limiting
 * This is compatible with any socket.io version
 */
export interface RateLimitableSocket {
  id: string;
  emit: (event: string, ...args: any[]) => boolean;
  on: (event: string, listener: (...args: any[]) => void) => this;
}

/**
 * Configuration for a specific event type's rate limit
 */
export interface EventRateLimitConfig {
  /** Maximum number of events allowed in the window */
  maxEvents: number;
  /** Time window in milliseconds */
  windowMs: number;
}

/**
 * Rate limit configuration per event type
 */
export interface SocketRateLimiterConfig {
  /** Rate limits per event type */
  limits: Record<string, EventRateLimitConfig>;
  /** Whether to log violations (default: true) */
  logViolations?: boolean;
  /** Custom error event name (default: 'rate_limit_error') */
  errorEventName?: string;
  /** Logger instance */
  logger?: {
    warn: (message: string, meta?: object) => void;
    debug?: (message: string, meta?: object) => void;
  };
  /** Callback when rate limit is exceeded */
  onRateLimitExceeded?: (
    socket: RateLimitableSocket,
    eventName: string,
    userId?: string
  ) => void;
}

/**
 * Track event timestamps for sliding window
 */
interface EventTracker {
  timestamps: number[];
}

/**
 * Rate limit state for a socket
 */
interface SocketRateLimitState {
  /** Event trackers per event type */
  events: Map<string, EventTracker>;
  /** User ID associated with this socket (if authenticated) */
  userId?: string;
}

/**
 * Result of checking rate limit
 */
export interface RateLimitCheckResult {
  /** Whether the event is allowed */
  allowed: boolean;
  /** Number of events in current window */
  currentCount: number;
  /** Maximum events allowed */
  maxEvents: number;
  /** Time until window resets (ms) */
  retryAfterMs?: number;
  /** Remaining events allowed */
  remaining: number;
}

/**
 * Socket with rate limit state attached
 */
export interface SocketWithRateLimit extends RateLimitableSocket {
  rateLimitState?: SocketRateLimitState;
}

/**
 * Default rate limit configurations for chat events
 */
export const DEFAULT_RATE_LIMITS: Record<string, EventRateLimitConfig> = {
  // Messages: 30 per minute (normal conversation pace)
  send_message: { maxEvents: 30, windowMs: 60000 },
  message: { maxEvents: 30, windowMs: 60000 },

  // Typing indicators: 10 per 10 seconds (prevent typing indicator spam)
  typing: { maxEvents: 10, windowMs: 10000 },

  // Read receipts: 60 per minute (batch reads are common)
  read_receipt: { maxEvents: 60, windowMs: 60000 },
  mark_read: { maxEvents: 60, windowMs: 60000 },
};

/**
 * Create a socket rate limiter instance
 */
export function createSocketRateLimiter(config: Partial<SocketRateLimiterConfig> = {}) {
  const {
    limits = DEFAULT_RATE_LIMITS,
    logViolations = true,
    errorEventName = 'rate_limit_error',
    logger = console,
    onRateLimitExceeded,
  } = config;

  // Store rate limit state per socket
  const socketStates = new WeakMap<RateLimitableSocket, SocketRateLimitState>();

  /**
   * Initialize rate limit state for a socket
   */
  function initializeSocket(socket: SocketWithRateLimit, userId?: string): void {
    const state: SocketRateLimitState = {
      events: new Map(),
      userId,
    };
    socketStates.set(socket, state);
    socket.rateLimitState = state;
  }

  /**
   * Clean up rate limit state when socket disconnects
   */
  function cleanupSocket(socket: RateLimitableSocket): void {
    socketStates.delete(socket);
  }

  /**
   * Get or create event tracker for a specific event type
   */
  function getEventTracker(
    state: SocketRateLimitState,
    eventName: string
  ): EventTracker {
    let tracker = state.events.get(eventName);
    if (!tracker) {
      tracker = { timestamps: [] };
      state.events.set(eventName, tracker);
    }
    return tracker;
  }

  /**
   * Clean old timestamps outside the window
   */
  function cleanOldTimestamps(
    tracker: EventTracker,
    windowMs: number,
    now: number
  ): void {
    const cutoff = now - windowMs;
    tracker.timestamps = tracker.timestamps.filter((ts) => ts > cutoff);
  }

  /**
   * Check if an event is rate limited
   */
  function checkRateLimit(
    socket: RateLimitableSocket,
    eventName: string
  ): RateLimitCheckResult {
    const state = socketStates.get(socket);
    if (!state) {
      // No state = not initialized, allow by default
      return {
        allowed: true,
        currentCount: 0,
        maxEvents: 0,
        remaining: Infinity,
      };
    }

    // Get rate limit config for this event type
    const limitConfig = limits[eventName];
    if (!limitConfig) {
      // No limit configured for this event type, allow it
      return {
        allowed: true,
        currentCount: 0,
        maxEvents: 0,
        remaining: Infinity,
      };
    }

    const { maxEvents, windowMs } = limitConfig;
    const now = Date.now();
    const tracker = getEventTracker(state, eventName);

    // Clean old timestamps
    cleanOldTimestamps(tracker, windowMs, now);

    const currentCount = tracker.timestamps.length;
    const remaining = Math.max(0, maxEvents - currentCount);
    const allowed = currentCount < maxEvents;

    if (allowed) {
      // Record this event
      tracker.timestamps.push(now);
    }

    // Calculate retry after if rate limited
    let retryAfterMs: number | undefined;
    if (!allowed && tracker.timestamps.length > 0) {
      const oldestTimestamp = tracker.timestamps[0];
      retryAfterMs = oldestTimestamp + windowMs - now;
    }

    return {
      allowed,
      currentCount: allowed ? currentCount + 1 : currentCount,
      maxEvents,
      retryAfterMs,
      remaining: allowed ? remaining - 1 : remaining,
    };
  }

  /**
   * Handle rate limit exceeded
   */
  function handleRateLimitExceeded(
    socket: RateLimitableSocket,
    eventName: string,
    result: RateLimitCheckResult
  ): void {
    const state = socketStates.get(socket);
    const userId = state?.userId;

    // Log violation
    if (logViolations) {
      logger.warn('Socket rate limit exceeded', {
        socketId: socket.id,
        userId,
        eventName,
        currentCount: result.currentCount,
        maxEvents: result.maxEvents,
        retryAfterMs: result.retryAfterMs,
      });
    }

    // Emit error event to client
    socket.emit(errorEventName, {
      error: 'Rate limit exceeded',
      code: 'RATE_LIMIT_EXCEEDED',
      eventName,
      retryAfterMs: result.retryAfterMs,
      limit: result.maxEvents,
    });

    // Call custom callback if provided
    if (onRateLimitExceeded) {
      onRateLimitExceeded(socket, eventName, userId);
    }
  }

  /**
   * Create middleware that wraps socket event handlers with rate limiting
   */
  function createRateLimitedHandler<T extends (...args: any[]) => any>(
    eventName: string,
    handler: T
  ): T {
    return function rateLimitedHandler(this: RateLimitableSocket, ...args: any[]) {
      const result = checkRateLimit(this, eventName);

      if (!result.allowed) {
        handleRateLimitExceeded(this, eventName, result);

        // If the last argument is a callback, call it with error
        const lastArg = args[args.length - 1];
        if (typeof lastArg === 'function') {
          lastArg({
            success: false,
            error: 'Rate limit exceeded',
            code: 'RATE_LIMIT_EXCEEDED',
            retryAfterMs: result.retryAfterMs,
          });
        }
        return;
      }

      // Event is allowed, call the original handler
      return handler.apply(this, args);
    } as T;
  }

  /**
   * Apply rate limiting to a Socket.IO server
   * Call this in the io.on('connection') handler
   */
  function applyToSocket(socket: RateLimitableSocket, userId?: string): void {
    initializeSocket(socket, userId);

    // Clean up on disconnect
    socket.on('disconnect', () => {
      cleanupSocket(socket);
    });
  }

  /**
   * Wrap an event handler with rate limiting
   */
  function wrapHandler<T extends (...args: any[]) => any>(
    eventName: string,
    handler: T
  ): T {
    return createRateLimitedHandler(eventName, handler);
  }

  /**
   * Manually check rate limit without recording the event
   * Useful for pre-checking before expensive operations
   */
  function peek(socket: RateLimitableSocket, eventName: string): RateLimitCheckResult {
    const state = socketStates.get(socket);
    if (!state) {
      return {
        allowed: true,
        currentCount: 0,
        maxEvents: 0,
        remaining: Infinity,
      };
    }

    const limitConfig = limits[eventName];
    if (!limitConfig) {
      return {
        allowed: true,
        currentCount: 0,
        maxEvents: 0,
        remaining: Infinity,
      };
    }

    const { maxEvents, windowMs } = limitConfig;
    const now = Date.now();

    // Only check existing tracker - don't create new one (prevents memory leak)
    const tracker = state.events.get(eventName);
    if (!tracker) {
      return {
        allowed: true,
        currentCount: 0,
        maxEvents,
        remaining: maxEvents,
      };
    }

    // Clean old timestamps (but don't modify the original array)
    const cutoff = now - windowMs;
    const validTimestamps = tracker.timestamps.filter((ts) => ts > cutoff);
    const currentCount = validTimestamps.length;
    const remaining = Math.max(0, maxEvents - currentCount);
    const allowed = currentCount < maxEvents;

    let retryAfterMs: number | undefined;
    if (!allowed && validTimestamps.length > 0) {
      retryAfterMs = validTimestamps[0] + windowMs - now;
    }

    return {
      allowed,
      currentCount,
      maxEvents,
      retryAfterMs,
      remaining,
    };
  }

  /**
   * Get current rate limit state for a socket (for debugging/monitoring)
   */
  function getState(socket: RateLimitableSocket): SocketRateLimitState | undefined {
    return socketStates.get(socket);
  }

  /**
   * Reset rate limit state for a specific event type
   */
  function resetEvent(socket: RateLimitableSocket, eventName: string): void {
    const state = socketStates.get(socket);
    if (state) {
      state.events.delete(eventName);
    }
  }

  /**
   * Reset all rate limit state for a socket
   */
  function resetAll(socket: RateLimitableSocket): void {
    const state = socketStates.get(socket);
    if (state) {
      state.events.clear();
    }
  }

  return {
    applyToSocket,
    wrapHandler,
    checkRateLimit,
    peek,
    getState,
    resetEvent,
    resetAll,
    cleanupSocket,
    initializeSocket,
  };
}

/**
 * Type for the socket rate limiter instance
 */
export type SocketRateLimiter = ReturnType<typeof createSocketRateLimiter>;

/**
 * Default socket rate limiter instance with standard chat limits
 */
export const socketRateLimiter = createSocketRateLimiter();

/**
 * Middleware wrapper for Socket.IO that automatically applies rate limiting
 * to specified events. Use this as an alternative to manually wrapping handlers.
 *
 * Usage:
 * ```typescript
 * const rateLimiter = createSocketRateLimiter();
 *
 * io.on('connection', (socket) => {
 *   rateLimiter.applyToSocket(socket, socket.userId);
 *
 *   // Wrap individual handlers
 *   socket.on('send_message', rateLimiter.wrapHandler('send_message', (data, cb) => {
 *     // Your handler logic
 *   }));
 * });
 * ```
 */
export function createSocketRateLimiterMiddleware(
  config: Partial<SocketRateLimiterConfig> = {}
) {
  const limiter = createSocketRateLimiter(config);

  /**
   * Socket.IO middleware that initializes rate limiting for each connection
   */
  return function socketRateLimiterMiddleware(
    socket: SocketWithRateLimit,
    next: (err?: Error) => void
  ): void {
    // Get userId from socket if available (set by auth middleware)
    const userId = (socket as any).userId;

    // Initialize rate limiting for this socket
    limiter.applyToSocket(socket, userId);

    next();
  };
}
