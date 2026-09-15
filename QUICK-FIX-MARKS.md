# Quick Fix: Can't Save Marks - DATABASE ERROR

## Update: It's a Database Error (500), Not Permissions!

Based on your console output, this is a **database error**, not a permission issue.

## What You Saw:
```
❌ Failed to save marks: {
  status: 500,
  error: "Database error. Please try again..."
}
```

## What I Did:

I've enhanced the error logging to show the **exact database error message** and stack trace. This will tell us what's failing in the database.

## Next Steps - Try Again:

1. **Restart your development server** (if running locally):
   ```powershell
   # Stop the server (Ctrl+C), then:
   npm run dev
   ```

2. **If on production, check the server logs** - they will now show:
   - The exact database error message
   - The SQL operation that failed
   - Stack trace
   - How many items were being saved

3. **Try saving marks again** with console open (F12)

4. **The error message will now show the actual database error** instead of just "Database error"

## Common Database Errors:

### Error 1: "relation does not exist" or "constraint does not exist"
**Cause:** Database schema is out of sync

**Fix:**
```powershell
# Run Prisma migration
npx prisma migrate dev
# OR if already deployed:
npx prisma db push
```

### Error 2: "connection refused" or "timeout"
**Cause:** Database is not accessible

**Fix:**
- Check `.env` file has correct `DATABASE_URL`
- Check database is running
- Check network connectivity

### Error 3: "column does not exist"
**Cause:** Database schema missing a column

**Fix:**
```powershell
npx prisma generate
npx prisma db push
```

### Error 4: "constraint violation" or "unique constraint"
**Cause:** Trying to insert duplicate data

**Fix:** This would be shown in the validation, so unlikely

## Check Server Logs

The server console will now show something like:

```
❌ Database error while saving marks: {
  message: "actual error message here",
  stack: "full stack trace...",
  name: "PrismaClientKnownRequestError",
  subjectId: "...",
  itemCount: 1,
  toUpsertCount: 1,
  toDeleteCount: 0
}
```

**Share this output** and I can tell you exactly what's wrong and how to fix it.

## Quick Diagnostic:

Try this in your terminal to check if the database is accessible:

```powershell
npx prisma db execute --stdin
```

Then paste:
```sql
SELECT COUNT(*) FROM "AssessmentItem";
```

Press Enter, then Ctrl+Z (Windows) or Ctrl+D (Mac/Linux).

If this returns a number, the database is accessible. If it errors, there's a connection problem.

## Most Likely Causes:

1. **Database connection issue** - Check `DATABASE_URL` in `.env`
2. **Schema out of sync** - Run `npx prisma db push`
3. **Missing table/constraint** - Run migrations
4. **Permission at database level** - Check database user has INSERT/UPDATE/DELETE permissions

Try saving again and **share the new error message** from both:
- Browser console (F12)
- Server console/terminal
