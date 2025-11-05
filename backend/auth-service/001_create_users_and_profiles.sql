-- Migration: Create users and profiles tables
-- Description: Core authentication and profile tables
-- Date: 2025-11-05

-- Users table (for authentication)
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(255) PRIMARY KEY,
    provider VARCHAR(50) NOT NULL,
    email VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create index on email for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Create index on provider for analytics
CREATE INDEX IF NOT EXISTS idx_users_provider ON users(provider);

-- Profiles table
CREATE TABLE IF NOT EXISTS profiles (
    user_id VARCHAR(255) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255),
    age INTEGER,
    bio TEXT,
    photos TEXT[], -- Array of photo URLs
    interests TEXT[], -- Array of interests
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create index on age for discovery filtering
CREATE INDEX IF NOT EXISTS idx_profiles_age ON profiles(age);

-- Add comments
COMMENT ON TABLE users IS 'Core user authentication data';
COMMENT ON TABLE profiles IS 'User profile information for dating';
COMMENT ON COLUMN users.provider IS 'OAuth provider: apple, google';
COMMENT ON COLUMN profiles.photos IS 'Array of photo URLs';
COMMENT ON COLUMN profiles.interests IS 'Array of user interests/hobbies';
