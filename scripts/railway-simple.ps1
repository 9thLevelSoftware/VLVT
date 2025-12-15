# Railway Setup Helper - Working Version
# This script generates secrets and shows templates for Railway deployment

Write-Host ""
Write-Host "VLVT - Railway Setup Helper" -ForegroundColor Cyan
Write-Host "====================================" -ForegroundColor Cyan
Write-Host ""

# Generate JWT Secret
Write-Host "JWT Secret Generator" -ForegroundColor Yellow
Write-Host "--------------------"
Write-Host ""

$bytes = New-Object byte[] 48
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($bytes)
$jwtSecret = [Convert]::ToBase64String($bytes)

Write-Host "Your JWT Secret:" -ForegroundColor Green
Write-Host $jwtSecret -ForegroundColor Cyan
Write-Host ""

# Try to copy to clipboard
try {
    Set-Clipboard -Value $jwtSecret
    Write-Host "Copied to clipboard!" -ForegroundColor Green
}
catch {
    Write-Host "Note: Could not copy to clipboard automatically" -ForegroundColor Yellow
}

Write-Host ""
Write-Host ""

# Show Environment Variables Template
Write-Host "Railway Environment Variables" -ForegroundColor Yellow
Write-Host "-----------------------------"
Write-Host ""
Write-Host "Copy these into Railway Dashboard -> Service -> Variables -> Raw Editor" -ForegroundColor White
Write-Host ""

$databaseUrlTemplate = '$' + '{{Postgres.DATABASE_URL}}'

Write-Host "AUTH SERVICE:" -ForegroundColor Magenta
Write-Host "PORT=3001"
Write-Host "JWT_SECRET=$jwtSecret"
Write-Host "DATABASE_URL=$databaseUrlTemplate"
Write-Host "NODE_ENV=production"
Write-Host "CORS_ORIGIN=*"
Write-Host ""

Write-Host "PROFILE SERVICE:" -ForegroundColor Magenta
Write-Host "PORT=3002"
Write-Host "DATABASE_URL=$databaseUrlTemplate"
Write-Host "NODE_ENV=production"
Write-Host "CORS_ORIGIN=*"
Write-Host ""

Write-Host "CHAT SERVICE:" -ForegroundColor Magenta
Write-Host "PORT=3003"
Write-Host "DATABASE_URL=$databaseUrlTemplate"
Write-Host "NODE_ENV=production"
Write-Host "CORS_ORIGIN=*"
Write-Host ""

Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Yellow
Write-Host "-----------"
Write-Host "1. Go to railway.app and create a new project"
Write-Host "2. Add PostgreSQL database"
Write-Host "3. Add 3 services (auth, profile, chat) from your GitHub repo"
Write-Host "4. For each service, set Root Directory (e.g., backend/auth-service)"
Write-Host "5. Paste the environment variables above into each service"
Write-Host "6. Click Deploy for each service"
Write-Host "7. Generate domains for each service (Settings -> Networking)"
Write-Host ""
Write-Host "See RAILWAY_QUICKSTART.md for detailed instructions" -ForegroundColor Cyan
Write-Host ""

# Save to file as well
$outputFile = "railway-env-vars.txt"
$output = @"
RAILWAY ENVIRONMENT VARIABLES
Generated: $(Get-Date)

========================================
AUTH SERVICE
========================================
PORT=3001
JWT_SECRET=$jwtSecret
DATABASE_URL=$databaseUrlTemplate
NODE_ENV=production
CORS_ORIGIN=*

========================================
PROFILE SERVICE
========================================
PORT=3002
DATABASE_URL=$databaseUrlTemplate
NODE_ENV=production
CORS_ORIGIN=*

========================================
CHAT SERVICE
========================================
PORT=3003
DATABASE_URL=$databaseUrlTemplate
NODE_ENV=production
CORS_ORIGIN=*

========================================
NOTES
========================================
- Replace Postgres.DATABASE_URL with your actual database variable
  in Railway, it should automatically link when you use this syntax:
  `${{Postgres.DATABASE_URL}}`
"@

$output | Out-File -FilePath $outputFile -Encoding UTF8
Write-Host "Environment variables also saved to: $outputFile" -ForegroundColor Green
Write-Host ""
