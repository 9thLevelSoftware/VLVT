import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { authenticateJWT } from '../src/middleware/auth';

const JWT_SECRET = process.env.JWT_SECRET!;

describe('Auth Middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let nextFunction: NextFunction;

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset mock objects only, not modules
    mockRequest = {
      headers: {},
      user: undefined,
    };

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    nextFunction = jest.fn();
  });

  it('should call next() with valid token', () => {
    const token = jwt.sign(
      { userId: 'test_user', provider: 'google', email: 'test@example.com' },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    mockRequest.headers = {
      authorization: `Bearer ${token}`,
    };

    authenticateJWT(mockRequest as Request, mockResponse as Response, nextFunction);

    expect(nextFunction).toHaveBeenCalled();
    expect(mockRequest.user).toBeDefined();
    expect(mockRequest.user).toHaveProperty('userId', 'test_user');
  });

  it('should return 401 when no authorization header', () => {
    authenticateJWT(mockRequest as Request, mockResponse as Response, nextFunction);

    expect(mockResponse.status).toHaveBeenCalledWith(401);
    expect(mockResponse.json).toHaveBeenCalledWith({
      success: false,
      error: 'No authorization header provided',
    });
    expect(nextFunction).not.toHaveBeenCalled();
  });

  it('should return 401 when authorization header is malformed', () => {
    mockRequest.headers = {
      authorization: 'InvalidFormat token',
    };

    authenticateJWT(mockRequest as Request, mockResponse as Response, nextFunction);

    expect(mockResponse.status).toHaveBeenCalledWith(401);
    expect(mockResponse.json).toHaveBeenCalledWith({
      success: false,
      error: 'Invalid authorization header format. Use: Bearer <token>',
    });
    expect(nextFunction).not.toHaveBeenCalled();
  });

  it('should return 401 when token is missing', () => {
    mockRequest.headers = {
      authorization: 'Bearer ',
    };

    authenticateJWT(mockRequest as Request, mockResponse as Response, nextFunction);

    expect(mockResponse.status).toHaveBeenCalledWith(401);
    expect(mockResponse.json).toHaveBeenCalledWith({
      success: false,
      error: 'No token provided',
    });
    expect(nextFunction).not.toHaveBeenCalled();
  });

  it('should return 401 when token is invalid', () => {
    mockRequest.headers = {
      authorization: 'Bearer invalid_token',
    };

    authenticateJWT(mockRequest as Request, mockResponse as Response, nextFunction);

    expect(mockResponse.status).toHaveBeenCalledWith(401);
    expect(mockResponse.json).toHaveBeenCalledWith({
      success: false,
      error: 'Invalid token',
    });
    expect(nextFunction).not.toHaveBeenCalled();
  });

  it('should return 401 when token is expired', () => {
    const expiredToken = jwt.sign(
      { userId: 'test_user', provider: 'google' },
      JWT_SECRET,
      { expiresIn: '-1s' }
    );

    mockRequest.headers = {
      authorization: `Bearer ${expiredToken}`,
    };

    authenticateJWT(mockRequest as Request, mockResponse as Response, nextFunction);

    expect(mockResponse.status).toHaveBeenCalledWith(401);
    expect(mockResponse.json).toHaveBeenCalledWith({
      success: false,
      error: 'Token expired',
    });
    expect(nextFunction).not.toHaveBeenCalled();
  });

  it('should attach user object to request', () => {
    const token = jwt.sign(
      { userId: 'test_user_123', provider: 'apple', email: 'apple@example.com' },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    mockRequest.headers = {
      authorization: `Bearer ${token}`,
    };

    authenticateJWT(mockRequest as Request, mockResponse as Response, nextFunction);

    expect(mockRequest.user).toEqual(
      expect.objectContaining({
        userId: 'test_user_123',
        provider: 'apple',
        email: 'apple@example.com',
      })
    );
  });

  it('should handle token with different signing algorithms', () => {
    // JWT library should reject tokens with wrong algorithm
    const token = jwt.sign(
      { userId: 'test_user' },
      'wrong_secret',
      { expiresIn: '7d' }
    );

    mockRequest.headers = {
      authorization: `Bearer ${token}`,
    };

    authenticateJWT(mockRequest as Request, mockResponse as Response, nextFunction);

    expect(mockResponse.status).toHaveBeenCalledWith(401);
    expect(nextFunction).not.toHaveBeenCalled();
  });
});
