# Deployment script for Bidii System
# Run with: .\deploy.ps1

Write-Host "Deploying Bidii System to Vercel..." -ForegroundColor Cyan
Write-Host ""

# Check if git has changes
$status = git status --porcelain
if ($status) {
    Write-Host "Found changes to commit..." -ForegroundColor Yellow
    Write-Host ""
    
    # Add all changes
    git add .
    
    # Commit with timestamp
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    git commit -m "Fix super admin login - add debug logging"
    
    Write-Host "Changes committed" -ForegroundColor Green
    Write-Host ""
} else {
    Write-Host "No changes to commit" -ForegroundColor Blue
    Write-Host ""
}

# Push to main branch
Write-Host "Pushing to remote..." -ForegroundColor Cyan
git push origin main

Write-Host ""
Write-Host "Deployment triggered!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:"
Write-Host "1. Go to https://vercel.com/dashboard"
Write-Host "2. Wait for deployment to complete"
Write-Host "3. Try logging in at https://bidii-one.vercel.app/login"
Write-Host "4. Check logs at Vercel Dashboard"
Write-Host ""
Write-Host "Login with:"
Write-Host "  Email: bidiisoftwares.1.ke@gmail.com"
Write-Host "  Password: Bidii@2026"
