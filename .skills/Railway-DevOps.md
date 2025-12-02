# Railway CLI - DevOps & Deployment

## Purpose
Railway is our deployment platform. Use this tool for all deployment, logs, database access, and service management tasks.

## Usage
```powershell
# PowerShell
.skills/railway.wrapper.ps1 <command> [options]

# Git Bash
.skills/railway.wrapper.sh <command> [options]
```

## Quick Reference

### View Logs
```powershell
# All services
.skills/railway.wrapper.ps1 logs

# Specific service
.skills/railway.wrapper.ps1 logs --service auth-service
.skills/railway.wrapper.ps1 logs --service profile-service
.skills/railway.wrapper.ps1 logs --service chat-service

# Follow logs in real-time
.skills/railway.wrapper.ps1 logs --service chat-service -f
```

### Database Operations
```powershell
# Connect to Postgres interactively
.skills/railway.wrapper.ps1 db

# Run a SQL query
.skills/railway.wrapper.ps1 db -c "SELECT * FROM users LIMIT 5;"

# Run a SQL file
.skills/railway.wrapper.ps1 db -f migrations/005_add_subscriptions_table.sql

# List all tables
.skills/railway.wrapper.ps1 db -c "\dt"

# Describe a table
.skills/railway.wrapper.ps1 db -c "\d users"
```

### Service Management
```powershell
# Check deployment status
.skills/railway.wrapper.ps1 status

# List all services
.skills/railway.wrapper.ps1 services

# Restart a service
.skills/railway.wrapper.ps1 restart --service profile-service

# View environment variables
.skills/railway.wrapper.ps1 env --service auth-service
```

### Deployments
```powershell
# Deploy current branch
.skills/railway.wrapper.ps1 deploy

# Deploy specific service
.skills/railway.wrapper.ps1 deploy --service profile-service

# View deployment history
.skills/railway.wrapper.ps1 deployments
```

### Project Management
```powershell
# Link to project (first time setup)
.skills/railway.wrapper.ps1 link

# Show current project status
.skills/railway.wrapper.ps1 status

# Open Railway dashboard in browser
.skills/railway.wrapper.ps1 open
```

## Common Debugging Workflows

### Service Returning 500 Errors
```powershell
# 1. Check service logs for errors
.skills/railway.wrapper.ps1 logs --service <service-name>

# 2. Check if recent deployment succeeded
.skills/railway.wrapper.ps1 deployments

# 3. Verify environment variables are set
.skills/railway.wrapper.ps1 env --service <service-name>
```

### Database Issues
```powershell
# 1. Connect and check tables exist
.skills/railway.wrapper.ps1 db -c "\dt"

# 2. Run missing migrations
.skills/railway.wrapper.ps1 db -f migrations/<migration-file>.sql

# 3. Check recent queries in postgres logs
.skills/railway.wrapper.ps1 logs --service postgres
```

### Deployment Failures
```powershell
# 1. Check build logs
.skills/railway.wrapper.ps1 logs --service <service-name>

# 2. Verify the service has correct start command
.skills/railway.wrapper.ps1 env --service <service-name>

# 3. Check if Railway detected the right builder
.skills/railway.wrapper.ps1 status
```

## Services in This Project

| Service | Port | Description |
|---------|------|-------------|
| auth-service | 3001 | JWT auth, Apple/Google Sign-In |
| profile-service | 3002 | User profiles, discovery, photos |
| chat-service | 3003 | Matches, messaging, Socket.io |
| postgres | 5432 | PostgreSQL database |

## Environment Variables Required

Each service needs:
- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET` - Auth service only
- `NODE_ENV=production`
- `PORT` - Assigned by Railway

## Tips

1. **Always check logs first** when debugging production issues
2. **Use `\dt` in psql** to see what tables exist before running migrations
3. **Migrations are idempotent** - running them again won't hurt (CREATE IF NOT EXISTS)
4. **Services auto-deploy on git push** to main branch
5. **Use `-f` flag with logs** to follow in real-time during debugging
