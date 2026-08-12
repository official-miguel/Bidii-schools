# 🚀 Bidii System - Quick Start Guide

## Prerequisites
- ✅ Node.js 18+ installed
- ✅ PostgreSQL database (Supabase or local)
- ✅ Git installed

---

## Option 1: Quick Start (Easiest)

### Windows PowerShell:
```powershell
cd "c:\Users\migue\OneDrive\Desktop\miguel\bidii ready\bidii-system.8"
.\run-local.ps1
```

The script will:
1. ✅ Check/create `.env` file
2. ✅ Install dependencies
3. ✅ Generate Prisma client
4. ✅ Check database connection
5. ✅ Run migrations (optional)
6. ✅ Start dev server at `http://localhost:3000`

---

## Option 2: Manual Setup

### Step 1: Install Dependencies
```powershell
npm install
```

### Step 2: Setup Environment Variables
Copy `.env.example` to `.env` and update the values:
```powershell
Copy-Item .env.example .env
```

Edit `.env` and set at minimum:
```env
DATABASE_URL="postgresql://user:password@host:5432/database"
SESSION_SECRET="your-random-secret-key-here"
INTEGRATION_ENCRYPTION_KEY="your-random-encryption-key-here"
```

### Step 3: Generate Prisma Client
```powershell
npx prisma generate
```

### Step 4: Run Database Migrations
```powershell
npx prisma migrate deploy
```

### Step 5: Start Development Server
```powershell
npm run dev
```

### Step 6: Open in Browser
Navigate to: **http://localhost:3000**

---

## Option 3: One-Line Commands

### Fresh Install & Run:
```powershell
npm install; npx prisma generate; npx prisma migrate deploy; npm run dev
```

### Quick Run (after first setup):
```powershell
npm run dev
```

---

## 🔑 Generate Secure Keys

### Generate SESSION_SECRET:
```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Generate INTEGRATION_ENCRYPTION_KEY:
```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 📊 Database Commands

### View Database in Browser:
```powershell
npx prisma studio
```
Opens at: **http://localhost:5555**

### Reset Database (Development Only):
```powershell
npx prisma migrate reset
```

### Create New Migration:
```powershell
npx prisma migrate dev --name your-migration-name
```

### Apply Migrations:
```powershell
npx prisma migrate deploy
```

---

## 🧪 Seed Database with Demo Data

### Seed with Demo School:
```powershell
npm run db:seed-demo
```

This creates:
- 1 Demo School
- Principal account
- Sample teachers, students, classes
- Demo timetable data

### Login Credentials:
After seeding, check the console output for login credentials.

---

## 🛠️ Troubleshooting

### Error: "Can't reach database server"
- ✅ Check DATABASE_URL in `.env`
- ✅ Ensure database is running
- ✅ Check firewall settings
- ✅ For Supabase, use the session pooler URL (port 5432)

### Error: "Module not found"
```powershell
rm -r node_modules
rm package-lock.json
npm install
```

### Error: "Prisma Client not generated"
```powershell
npx prisma generate
```

### Port 3000 already in use:
```powershell
# Find process using port 3000
netstat -ano | findstr :3000

# Kill the process (replace PID with actual process ID)
taskkill /PID <PID> /F

# Or use a different port
$env:PORT=3001; npm run dev
```

---

## 📝 Environment Variables Checklist

### Required:
- ✅ `DATABASE_URL` - PostgreSQL connection string
- ✅ `SESSION_SECRET` - Random 32+ character string
- ✅ `INTEGRATION_ENCRYPTION_KEY` - Random 32+ character string

### Optional (for full features):
- `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` - Email sending
- `BLOB_READ_WRITE_TOKEN` - File uploads (Vercel Blob)
- `TIMETABLE_SOLVER_URL` - AI timetable generation
- `NEXT_PUBLIC_APP_URL` - Public URL for links

---

## 🌐 Access Points

After starting the server:

- **Main App:** http://localhost:3000
- **Prisma Studio:** http://localhost:5555 (run `npx prisma studio`)
- **API Docs:** http://localhost:3000/api (if configured)

---

## 🎯 Quick Development Workflow

```powershell
# 1. Pull latest changes
git pull

# 2. Install new dependencies (if any)
npm install

# 3. Run migrations (if schema changed)
npx prisma migrate deploy

# 4. Generate Prisma client
npx prisma generate

# 5. Start dev server
npm run dev
```

---

## 📱 Default Ports

- **Next.js Dev Server:** 3000
- **Prisma Studio:** 5555
- **Timetable Solver:** 8080 (if running locally)

---

## 💡 Pro Tips

1. **Auto-restart on changes:** The dev server auto-reloads when you save files
2. **View logs:** All output appears in the terminal
3. **Debug mode:** Check `.next/` folder for build output
4. **Clear cache:** Delete `.next/` folder if you encounter weird issues
5. **Database GUI:** Use Prisma Studio for easy database viewing

---

## 🆘 Need Help?

- Check console logs for detailed error messages
- Ensure all environment variables are set correctly
- Verify database connection string format
- Check Node.js version: `node --version` (needs 18+)

---

**Happy Coding! 🎉**
