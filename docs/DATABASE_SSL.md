# Database SSL Configuration

## Railway PostgreSQL TLS

Railway PostgreSQL uses self-signed certificates. The current configuration
disables certificate verification for Railway connections:

```typescript
ssl: process.env.DATABASE_URL?.includes('railway')
  ? { rejectUnauthorized: false }
  : false
```

### Security Implications

- `rejectUnauthorized: false` disables certificate verification
- Susceptible to MITM attacks on compromised networks
- Acceptable for Railway's internal network but not ideal

### Future Improvements

1. **Request CA bundle from Railway**: Contact Railway support for their
   PostgreSQL CA certificate bundle.

2. **Use Railway's private networking**: Use internal hostnames to reduce
   attack surface.

3. **Update configuration when available**:
   ```typescript
   ssl: {
     rejectUnauthorized: true,
     ca: fs.readFileSync('/path/to/railway-ca.pem')
   }
   ```

### Environment Variables

- `DATABASE_URL`: PostgreSQL connection string (Railway provides this)
- If URL contains 'railway', SSL is enabled with relaxed verification
