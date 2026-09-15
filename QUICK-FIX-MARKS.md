# Quick Fix: Can't Save Marks

## What I Changed

I've improved the error reporting so you can see **exactly** what's going wrong. The system will now show much clearer error messages.

## What To Do Now

1. **Refresh the page** where you're trying to save marks (press F5)

2. **Open the browser console** to see detailed error info:
   - Press `F12` on your keyboard
   - Click the **Console** tab
   - Keep it open

3. **Try saving marks again**

4. **Look at the console** - you'll now see one of these messages:

### If You See: `❌ Permission denied for marks entry`

The console will show details like:
```
❌ Permission denied for marks entry:
{
  userEmail: "felix@....",
  subjectId: "...",
  roles: [...],
  assignedSubjectIds: [...]
}
```

**This means:** Felix doesn't have the right permissions for this subject.

**Solutions:**
- Check if the subject assignment is in the timetable
- Check if there's an Assessment Role assigned
- The console will show which subjects Felix IS assigned to in `assignedSubjectIds`

### If You See: `Validation error`

**This means:** One of the marks you entered is invalid (too high, negative, or not a number)

The error will tell you exactly which mark is wrong.

### If You See: `Database error`

**This means:** There's a server/database problem. Check the server logs.

## User-Facing Error Messages

The error banner on screen will now show:
- ✅ **Permission denied**: "You do not have permission to enter marks for this subject"
- ✅ **Validation error**: Shows exactly which score is invalid
- ✅ **Database error**: "Database error. Please try again or contact support"

Instead of just "Couldn't save marks"

## Next Steps

1. Try saving marks now with the console open (F12)
2. Take a screenshot of any errors you see in the console
3. Share the console output so we can fix the root cause

## What The Logs Will Tell Us

The server logs will now show:
- Which user is trying to save
- Which subject they're trying to save for
- What roles/permissions they have
- Which subjects they ARE allowed to access
- Any database errors that occur

This will make it very easy to identify if it's:
- ❌ A permission issue (most likely)
- ❌ A validation issue (bad data)
- ❌ A database issue (technical problem)
