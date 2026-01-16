# Complete Testing Flow - Frontend + Backend

## 🚀 Prerequisites

### 1. Start Backend Server
```bash
cd git-v1-backend
npm run dev
```

**Expected Output:**
```
✅ MongoDB Connected: localhost:27017
✅ Server running on port 3000
✅ WebSocket server initialized
```

### 2. Verify Backend is Running
Open browser and go to: `http://localhost:3000/health`

**Expected Response:**
```json
{
  "status": "ok",
  "timestamp": "...",
  "environment": "development"
}
```

### 3. Start Frontend (Adobe Express Add-on)
- Open your Adobe Express add-on in development mode
- The frontend will auto-connect to `http://localhost:3000`

---

## 📋 Complete Testing Flow

### **Step 1: Initial Load & Auto-Login** ✅

**What Happens:**
- Frontend automatically logs in with test user
- Token is stored in localStorage
- Project ID `proj_123` is loaded (or you can create a new one)

**What to Check:**
- ✅ No errors in browser console
- ✅ Token stored in localStorage (check DevTools → Application → Local Storage)
- ✅ All tabs load without errors

**Expected Console Logs:**
```
Design Branch Manager: addOnUISdk is ready for use.
✅ Auto-logged in: Test User
```

---

### **Step 2: Create/Verify Project** 🆕

**If project doesn't exist yet:**

**Option A: Create via API (using Hopscotch/Postman)**
```
POST http://localhost:3000/api/v1/projects
Authorization: Bearer YOUR_TOKEN
Body:
{
  "projectId": "proj_123",
  "name": "My Test Project",
  "description": "Testing the Design Branch Manager"
}
```

**Option B: The frontend will use `proj_123` by default**

**What to Check:**
- ✅ Project exists in database
- ✅ Main branch was created automatically
- ✅ You are added as owner/team member

---

### **Step 3: View Branches Tab** 🌿

**What Happens:**
- Frontend loads branches from backend
- Displays all branches for the project

**What to Check:**
- ✅ "main" branch is visible
- ✅ Branch list loads without errors
- ✅ Branch metadata (updated date) displays correctly

**Expected UI:**
- Main branch with "Primary" badge
- Any other branches you've created

**If Empty:**
- This is normal if you haven't created branches yet
- Proceed to Step 4

---

### **Step 4: Create a New Branch** ➕

**Steps:**
1. Click **"+ New Branch"** button
2. Fill in the form:
   - **Branch Type:** `feature`
   - **Branch Name:** `test-feature`
   - **Description:** `Testing branch creation`
   - **Base Branch:** `main`
3. Click **"Create Branch"**

**What to Check:**
- ✅ Success message appears: "✓ Branch 'feature/test-feature' created successfully"
- ✅ New branch appears in the branch list
- ✅ Branch has "Merge" and "Delete" buttons
- ✅ No errors in console

**Expected Result:**
- Branch `feature/test-feature` visible in list
- Success message shows for 3 seconds

---

### **Step 5: View History Tab** 📜

**Steps:**
1. Click **"History"** tab

**What to Check:**
- ✅ History loads (may be empty if no commits yet)
- ✅ No errors in console

**Expected UI:**
- Either commit history or "No commits yet" message
- If you see commits, they should show:
  - Commit hash
  - Commit message
  - Author name
  - Timestamp

**Note:** Empty history is normal - commits are created when you save design snapshots

---

### **Step 6: View Merge Tab** 🔀

**Steps:**
1. Click **"Merge"** tab

**What to Check:**
- ✅ Merge requests load (may be empty)
- ✅ Filter buttons work (Open, Merged, Closed)
- ✅ No errors in console

**Expected UI:**
- List of merge requests OR "No merge requests yet" message
- Each merge request shows:
  - Merge request ID (#1, #2, etc.)
  - Source and target branches
  - Status badge
  - Action buttons

---

### **Step 7: Create a Merge Request** 🔀

**Steps:**
1. Go back to **"Branches"** tab
2. Click **"Merge"** button on any non-main branch
3. Fill in the form:
   - **Source Branch:** (pre-filled)
   - **Target Branch:** `main`
   - **Title:** `Test merge request`
   - **Description:** `Testing merge request creation`
4. Click **"Create Merge Request"**

**What to Check:**
- ✅ Success alert: "Merge request created! (#1)"
- ✅ Automatically switches to Merge tab
- ✅ New merge request appears in list
- ✅ Status shows "Pending Review"
- ✅ Action buttons visible (Approve, Request Changes)

**Expected Result:**
- Merge request #1 visible in Merge tab
- Status: "Pending Review" (blue badge)
- Created by: Your name
- Stats: Files Changed, Components Updated

---

### **Step 8: Approve Merge Request** ✅

**Steps:**
1. In **"Merge"** tab, find your merge request
2. Click **"✓ Approve"** button

**What to Check:**
- ✅ Status changes to "Approved" (green badge)
- ✅ Button changes to "✓ Approved" (disabled)
- ✅ No errors in console

**Expected Result:**
- Badge changes from "Pending Review" to "Approved"
- If you have 2+ reviewers, it may need more approvals

---

### **Step 9: Complete Merge** 🎯

**Steps:**
1. In **"Merge"** tab, find approved merge request
2. Click **"Merge Now"** button
3. Confirm the merge

**What to Check:**
- ✅ Success alert: "Merge completed successfully!"
- ✅ Status changes to "Merged" (green badge)
- ✅ Merge info shows: "✓ Merged by You on [date]"
- ✅ Branches list updates (if auto-delete enabled)

**Expected Result:**
- Merge request shows "Merged" status
- Merge date and user displayed
- Source branch may be marked as merged (if auto-delete enabled)

---

### **Step 10: Delete a Branch** 🗑️

**Steps:**
1. Go to **"Branches"** tab
2. Click **"Delete"** on any non-main branch
3. Confirm deletion

**What to Check:**
- ✅ Confirmation dialog appears
- ✅ Success message: "✓ Branch '[name]' deleted successfully"
- ✅ Branch disappears from list
- ✅ No errors in console

**Expected Result:**
- Branch removed from UI
- Cannot delete "main" branch (should show error)

---

### **Step 11: View Team Tab** 👥

**Steps:**
1. Click **"Team"** tab

**What to Check:**
- ✅ Team members load
- ✅ Stats show: Total Members, Active Today
- ✅ Your user appears in the list
- ✅ Role and commit count displayed

**Expected UI:**
- Stats cards: Total Members (1+), Active Today
- Team member cards showing:
  - Name
  - Role (Owner, Designer, etc.)
  - Commit count
  - Status badge (Active/Pending)

---

### **Step 12: Invite Team Member** 📧

**Steps:**
1. In **"Team"** tab, scroll to "Invite Member" section
2. Enter email: `test@example.com`
3. Click **"Send Invite"**

**What to Check:**
- ✅ Success alert: "Invitation sent to test@example.com"
- ✅ Email field clears
- ✅ Team list updates (new member with "Pending" status)
- ✅ Check backend console for mock email log

**Expected Result:**
- New team member appears with "Pending" badge
- Email logged in backend console (mock email service)

**Backend Console Should Show:**
```
📧 MOCK EMAIL SENT
To: test@example.com
Subject: Invitation to join My Test Project
```

---

### **Step 13: Test Filter Merge Requests** 🔍

**Steps:**
1. Go to **"Merge"** tab
2. Click **"Open"** filter button
3. Click **"Merged"** filter button
4. Click **"Closed"** filter button

**What to Check:**
- ✅ Filter buttons work
- ✅ List updates based on filter
- ✅ Correct merge requests shown for each status

**Expected Result:**
- "Open" shows pending/approved requests
- "Merged" shows completed merges
- "Closed" shows closed/rejected requests

---

### **Step 14: Test Error Handling** ⚠️

**Test Invalid Actions:**

1. **Try to delete main branch:**
   - Should show error: "Cannot delete primary branch"

2. **Try to create duplicate branch:**
   - Should show error: "Branch already exists"

3. **Try to merge same branch to itself:**
   - Should show error: "Source and target branches cannot be the same"

4. **Disconnect backend and try an action:**
   - Should show error message
   - Should not crash the UI

**What to Check:**
- ✅ Error messages are user-friendly
- ✅ UI doesn't break on errors
- ✅ Console shows detailed error logs

---

## 🎯 Success Criteria Checklist

- [ ] Backend starts without errors
- [ ] Frontend loads and auto-logins
- [ ] All tabs load data from backend
- [ ] Can create branches
- [ ] Can create merge requests
- [ ] Can approve merge requests
- [ ] Can complete merges
- [ ] Can delete branches
- [ ] Can view team members
- [ ] Can invite team members
- [ ] Filters work correctly
- [ ] Error handling works
- [ ] No console errors
- [ ] Data persists (refresh page, data still there)

---

## 🐛 Troubleshooting

### **Issue: "Failed to fetch" or CORS errors**

**Solution:**
- Check backend is running on port 3000
- Check CORS settings in backend `.env`:
  ```
  CORS_ORIGIN=http://localhost:3000
  ```
- For Adobe Express, you may need to add the add-on origin to CORS

### **Issue: "Not authenticated" errors**

**Solution:**
- Check token in localStorage (DevTools → Application)
- Token might be expired, refresh the page to auto-login again
- Check backend JWT_SECRET is set in `.env`

### **Issue: "You do not have access to this project"**

**Solution:**
- Make sure project exists: `proj_123`
- Make sure you're a team member of the project
- Check project was created with your user ID

### **Issue: Empty data (branches, merge requests, etc.)**

**Solution:**
- This is normal if you haven't created any yet
- Create a branch or merge request first
- Check browser console for errors
- Check backend logs for API calls

### **Issue: MongoDB connection errors**

**Solution:**
- Make sure MongoDB is running:
  ```bash
  brew services start mongodb-community
  # OR
  docker ps  # Check if MongoDB container is running
  ```
- Check `MONGODB_URI` in `.env` file

---

## 📊 Testing Checklist Summary

**Basic Functionality:**
- ✅ Login/Authentication
- ✅ View Branches
- ✅ Create Branch
- ✅ Delete Branch
- ✅ View History
- ✅ View Merge Requests
- ✅ Create Merge Request
- ✅ Approve Merge Request
- ✅ Complete Merge
- ✅ View Team
- ✅ Invite Team Member
- ✅ Filter Merge Requests

**Advanced Testing:**
- ✅ Multiple users (create second user, test collaboration)
- ✅ Multiple projects (switch between projects)
- ✅ Real-time updates (WebSocket - if implemented)
- ✅ Error scenarios
- ✅ Edge cases (empty states, large data, etc.)

---

## 🎉 Next Steps After Testing

1. **Fix any bugs found**
2. **Add more features:**
   - Project creation UI
   - Project switching
   - Real-time WebSocket updates
   - File upload for commits
   - Conflict resolution UI

3. **Production Preparation:**
   - Replace mock email with Mailgun/SendGrid
   - Migrate file storage to S3
   - Add proper Adobe OAuth integration
   - Set up production environment variables
   - Add error monitoring (Sentry, etc.)

---

## 💡 Pro Tips

1. **Keep browser DevTools open** to see API calls and errors
2. **Keep backend console open** to see server logs
3. **Use Network tab** in DevTools to inspect API requests/responses
4. **Check localStorage** to verify token storage
5. **Test with multiple browsers** to ensure compatibility

Happy Testing! 🚀
