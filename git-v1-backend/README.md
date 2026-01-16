# Design Branch Manager - Backend Flow & Architecture

## Overview
This document outlines the backend architecture, API endpoints, data models, and flow for the Design Branch Manager add-on.

---

## 1. System Architecture

```
┌─────────────────┐
│  Adobe Express  │
│     Add-on      │
└────────┬────────┘
         │ HTTPS/REST API
         │
┌────────▼─────────────────────────────────────┐
│         Backend API Server                   │
│  ┌──────────────┐  ┌──────────────────────┐ │
│  │   REST API   │  │   WebSocket Server   │ │
│  │   Endpoints  │  │   (Real-time updates)│ │
│  └──────────────┘  └──────────────────────┘ │
└────────┬─────────────────────────────────────┘
         │
    ┌────┴────┬──────────────┬─────────────┐
    │         │              │             │
┌───▼───┐ ┌──▼───┐    ┌─────▼────┐  ┌─────▼────┐
│Database│ │ File │    │  Adobe  │  │  Email   │
│ (Mongo │ │Store │    │  Cloud  │  │ Service  │
│  DB)  │ │ (S3) │    │   API   │  │ (SendGrid)│
└───────┘ └──────┘    └─────────┘  └──────────┘
```

---

## 2. Core Data Models

### 2.1 Project
```javascript
{
  _id: ObjectId,
  projectId: String (unique), // Adobe Express project ID
  name: String,
  description: String,
  ownerId: String, // User ID of project owner
  createdAt: Date,
  updatedAt: Date,
  settings: {
    branchProtection: {
      requireApproval: Boolean,
      minReviews: Number,
      autoDeleteMerged: Boolean
    },
    notifications: {
      onMergeRequest: Boolean,
      onBranchUpdate: Boolean
    }
  }
}
```

### 2.2 Branch
```javascript
{
  _id: ObjectId,
  projectId: String,
  name: String, // e.g., "feature/Q1-campaign"
  type: String, // "feature", "hotfix", "design", "experiment", "main"
  description: String,
  baseBranch: String, // Parent branch name
  createdBy: String, // User ID
  createdAt: Date,
  updatedAt: Date,
  lastCommit: {
    hash: String,
    message: String,
    timestamp: Date,
    authorId: String
  },
  isPrimary: Boolean, // true for main branch
  status: String // "active", "merged", "deleted"
}
```

### 2.3 Commit/Version
```javascript
{
  _id: ObjectId,
  projectId: String,
  branchId: String,
  hash: String (unique),
  message: String,
  authorId: String,
  timestamp: Date,
  changes: {
    filesAdded: Number,
    filesModified: Number,
    filesDeleted: Number,
    componentsUpdated: Number
  },
  snapshot: {
    // Reference to design file snapshot in storage
    fileUrl: String,
    thumbnailUrl: String
  },
  parentCommitHash: String // For version history chain
}
```

### 2.4 Merge Request
```javascript
{
  _id: ObjectId,
  projectId: String,
  mergeRequestId: Number, // Sequential ID per project
  sourceBranch: String,
  targetBranch: String,
  title: String,
  description: String,
  status: String, // "open", "approved", "merged", "closed", "rejected"
  createdBy: String,
  createdAt: Date,
  updatedAt: Date,
  mergedAt: Date,
  mergedBy: String,
  reviewers: [{
    userId: String,
    status: String, // "pending", "approved", "requested_changes", "rejected"
    reviewedAt: Date,
    comment: String
  }],
  conflicts: [{
    filePath: String,
    conflictType: String
  }],
  stats: {
    filesChanged: Number,
    componentsUpdated: Number
  }
}
```

### 2.5 Team Member
```javascript
{
  _id: ObjectId,
  projectId: String,
  userId: String,
  email: String,
  role: String, // "owner", "admin", "designer", "viewer"
  status: String, // "active", "inactive", "pending"
  invitedBy: String,
  invitedAt: Date,
  joinedAt: Date,
  lastActiveAt: Date,
  commitCount: Number
}
```

### 2.6 User
```javascript
{
  _id: ObjectId,
  userId: String, // Adobe Express user ID
  email: String,
  name: String,
  avatarUrl: String,
  createdAt: Date,
  preferences: {
    notifications: Object
  }
}
```

---

## 3. API Endpoints Flow

### 3.1 Authentication & Authorization
```
Flow:
1. User authenticates with Adobe Express
2. Adobe Express provides OAuth token
3. Backend validates token with Adobe API
4. Backend creates/updates user record
5. Backend returns JWT session token
6. All subsequent requests include JWT in Authorization header
```

**Endpoints:**
- `POST /auth/login` - Exchange Adobe token for JWT
- `POST /auth/refresh` - Refresh JWT token
- `GET /auth/me` - Get current user info

---

### 3.2 Project Management

**GET /api/v1/projects/:projectId**
- Flow: Validate JWT → Check user has access → Return project data
- Response: Project object with settings

**POST /api/v1/projects**
- Flow: Validate JWT → Create project → Create default "main" branch → Return project
- Request: { name, description, projectId (Adobe ID) }
- Response: Created project object

**PUT /api/v1/projects/:projectId/settings**
- Flow: Validate JWT → Check user is owner/admin → Update settings → Return updated project
- Request: { settings: { branchProtection: {...}, notifications: {...} } }

---

### 3.3 Branch Management

**GET /api/v1/branches?projectId=:projectId**
- Flow: Validate JWT → Check access → Query branches for project → Return list
- Response: Array of branch objects

**POST /api/v1/branches**
- Flow: 
  1. Validate JWT → Check access
  2. Validate branch name format
  3. Check base branch exists
  4. Create branch record
  5. Create initial commit from base branch snapshot
  6. Emit WebSocket event (new branch created)
  7. Return created branch
- Request: { projectId, name, type, description, baseBranch }
- Response: Created branch object

**DELETE /api/v1/branches/:branchName?projectId=:projectId**
- Flow:
  1. Validate JWT → Check access
  2. Check branch is not primary (main)
  3. Check branch has no open merge requests
  4. Mark branch as deleted (soft delete)
  5. Emit WebSocket event
  6. Return success
- Response: { success: true, message: "Branch deleted" }

**GET /api/v1/branches/:branchName?projectId=:projectId**
- Flow: Validate JWT → Check access → Return branch details with latest commit
- Response: Branch object with commit history

---

### 3.4 Version History

**GET /api/v1/history?projectId=:projectId&branch=:branchName&limit=:limit**
- Flow:
  1. Validate JWT → Check access
  2. Query commits for project (and branch if specified)
  3. Sort by timestamp descending
  4. Limit results
  5. Populate author info
  6. Return history array
- Response: Array of commit objects with author details

**POST /api/v1/commits**
- Flow:
  1. Validate JWT → Check access
  2. Receive design file snapshot from Adobe Express
  3. Upload snapshot to file storage (S3)
  4. Generate thumbnail
  5. Create commit record
  6. Update branch lastCommit
  7. Emit WebSocket event (new commit)
  8. Return commit object
- Request: { projectId, branchId, message, snapshot: File, changes: {...} }
- Response: Created commit object

---

### 3.5 Merge Request Management

**GET /api/v1/merge-requests?projectId=:projectId&status=:status**
- Flow: Validate JWT → Check access → Query merge requests → Filter by status → Return list
- Response: Array of merge request objects

**POST /api/v1/merge-requests**
- Flow:
  1. Validate JWT → Check access
  2. Validate source and target branches exist
  3. Check for conflicts (compare branch snapshots)
  4. Generate merge request ID (sequential)
  5. Create merge request record
  6. Assign reviewers (based on project settings)
  7. Send email notifications to reviewers
  8. Emit WebSocket event (new merge request)
  9. Return created merge request
- Request: { projectId, sourceBranch, targetBranch, title, description }
- Response: Created merge request object

**POST /api/v1/merge-requests/:mergeRequestId/approve**
- Flow:
  1. Validate JWT → Check access
  2. Check user is a reviewer
  3. Update reviewer status to "approved"
  4. Check if all required approvals met
  5. If yes, update merge request status to "approved"
  6. Send email notification
  7. Emit WebSocket event
  8. Return updated merge request
- Response: Updated merge request object

**POST /api/v1/merge-requests/:mergeRequestId/request-changes**
- Flow:
  1. Validate JWT → Check access
  2. Check user is a reviewer
  3. Update reviewer status to "requested_changes"
  4. Update merge request status to "open" (if was approved)
  5. Send email notification to requester
  6. Emit WebSocket event
  7. Return updated merge request
- Request: { comment: String }
- Response: Updated merge request object

**POST /api/v1/merge-requests/:mergeRequestId/merge**
- Flow:
  1. Validate JWT → Check access
  2. Check merge request is approved
  3. Check branch protection rules (if target is main)
  4. Resolve conflicts (if any)
  5. Merge source branch into target branch
  6. Create merge commit
  7. Update target branch snapshot
  8. Update merge request status to "merged"
  9. If auto-delete enabled, mark source branch as merged
  10. Send email notifications
  11. Emit WebSocket event
  12. Return merged result
- Response: { success: true, mergeCommit: Commit object }

**GET /api/v1/merge-requests/:mergeRequestId/conflicts**
- Flow: Validate JWT → Check access → Compare branch snapshots → Return conflict list
- Response: Array of conflict objects

---

### 3.6 Team Management

**GET /api/v1/team?projectId=:projectId**
- Flow: Validate JWT → Check access → Query team members → Return list with stats
- Response: Array of team member objects with commit counts

**POST /api/v1/team/invite**
- Flow:
  1. Validate JWT → Check user is owner/admin
  2. Validate email format
  3. Check if user already exists in system
  4. Create team member record with status "pending"
  5. Generate invitation token
  6. Send invitation email with token
  7. Return success
- Request: { projectId, email, role }
- Response: { success: true, message: "Invitation sent" }

**POST /api/v1/team/accept-invite**
- Flow:
  1. Validate invitation token
  2. Update team member status to "active"
  3. Set joinedAt timestamp
  4. Return success
- Request: { token: String }
- Response: { success: true, projectId: String }

**PUT /api/v1/team/:userId/role?projectId=:projectId**
- Flow: Validate JWT → Check user is owner/admin → Update role → Return updated member
- Request: { role: String }

**DELETE /api/v1/team/:userId?projectId=:projectId**
- Flow: Validate JWT → Check user is owner/admin → Remove team member → Return success

---

## 4. WebSocket Events (Real-time Updates)

**Connection Flow:**
1. Client connects with JWT token
2. Server validates token
3. Server subscribes client to project channels
4. Client receives updates for subscribed projects

**Event Types:**

**Branch Events:**
- `branch:created` - New branch created
- `branch:updated` - Branch updated (new commit)
- `branch:deleted` - Branch deleted

**Merge Request Events:**
- `merge:created` - New merge request
- `merge:approved` - Merge request approved
- `merge:changes_requested` - Changes requested
- `merge:merged` - Merge completed
- `merge:closed` - Merge request closed

**Team Events:**
- `team:member_added` - New team member
- `team:member_updated` - Team member updated

---

## 5. File Storage Flow

**Design Snapshot Storage:**
```
1. Adobe Express sends design file (JSON/export format)
2. Backend receives file
3. Upload to S3/Cloud Storage with path: projects/{projectId}/branches/{branchId}/commits/{commitHash}.json
4. Generate thumbnail (if needed)
5. Store thumbnail: projects/{projectId}/branches/{branchId}/commits/{commitHash}_thumb.png
6. Return file URLs
```

**File Structure:**
```
s3://design-branch-manager/
  ├── projects/
  │   ├── {projectId}/
  │   │   ├── branches/
  │   │   │   ├── {branchId}/
  │   │   │   │   ├── commits/
  │   │   │   │   │   ├── {commitHash}.json
  │   │   │   │   │   └── {commitHash}_thumb.png
  │   │   │   │   └── current.json (latest snapshot)
```

---

## 6. Conflict Detection Flow

**Merge Conflict Detection:**
```
1. Get source branch latest snapshot
2. Get target branch latest snapshot
3. Compare design elements:
   - Same element modified in both branches → CONFLICT
   - Element deleted in one, modified in other → CONFLICT
   - Element added in both with same ID → CONFLICT
4. Generate conflict report:
   {
     conflicts: [
       {
         elementId: String,
         elementType: String,
         conflictType: "both_modified" | "deleted_modified" | "duplicate_id",
         sourceValue: Object,
         targetValue: Object
       }
     ]
   }
5. Return conflicts or proceed with merge
```

**Conflict Resolution:**
```
1. User selects resolution strategy per conflict:
   - Use source version
   - Use target version
   - Manual merge (combine both)
2. Apply resolutions
3. Create merged snapshot
4. Complete merge
```

---

## 7. Notification Flow

**Email Notifications:**
```
1. Event occurs (merge request, branch update, etc.)
2. Query project notification settings
3. Get list of users to notify
4. Generate email template
5. Send via email service (SendGrid/Mailgun)
6. Log notification sent
```

**Notification Types:**
- Merge request created
- Merge request approved/rejected
- Merge completed
- Branch updated
- Team member invited
- Review requested

---

## 8. Database Indexes

**Required Indexes for Performance:**

```javascript
// Projects
db.projects.createIndex({ projectId: 1 }, { unique: true })
db.projects.createIndex({ ownerId: 1 })

// Branches
db.branches.createIndex({ projectId: 1, name: 1 }, { unique: true })
db.branches.createIndex({ projectId: 1, status: 1 })
db.branches.createIndex({ updatedAt: -1 })

// Commits
db.commits.createIndex({ projectId: 1, branchId: 1, timestamp: -1 })
db.commits.createIndex({ hash: 1 }, { unique: true })
db.commits.createIndex({ projectId: 1, timestamp: -1 })

// Merge Requests
db.mergeRequests.createIndex({ projectId: 1, mergeRequestId: 1 }, { unique: true })
db.mergeRequests.createIndex({ projectId: 1, status: 1 })
db.mergeRequests.createIndex({ projectId: 1, createdAt: -1 })
db.mergeRequests.createIndex({ "reviewers.userId": 1 })

// Team Members
db.teamMembers.createIndex({ projectId: 1, userId: 1 }, { unique: true })
db.teamMembers.createIndex({ projectId: 1, status: 1 })
db.teamMembers.createIndex({ email: 1 })
```

---

## 9. Error Handling Flow

**Error Response Format:**
```javascript
{
  error: {
    code: String, // "BRANCH_NOT_FOUND", "UNAUTHORIZED", etc.
    message: String,
    details: Object // Optional additional info
  }
}
```

**Common Error Codes:**
- `UNAUTHORIZED` - Invalid or missing JWT
- `FORBIDDEN` - User doesn't have permission
- `NOT_FOUND` - Resource doesn't exist
- `VALIDATION_ERROR` - Invalid request data
- `CONFLICT` - Resource conflict (e.g., branch already exists)
- `MERGE_CONFLICT` - Merge has conflicts
- `BRANCH_PROTECTED` - Cannot merge to protected branch

---

## 10. Security Considerations

**Authentication:**
- JWT tokens with expiration
- Refresh token mechanism
- Adobe OAuth token validation

**Authorization:**
- Role-based access control (RBAC)
- Project-level permissions
- Branch protection rules

**Data Validation:**
- Input sanitization
- SQL injection prevention (using parameterized queries)
- XSS prevention
- Rate limiting per user/IP

**File Upload:**
- File type validation
- File size limits
- Virus scanning (optional)
- Secure file storage with signed URLs

---

## 11. Performance Optimization

**Caching Strategy:**
- Redis cache for frequently accessed data:
  - Project settings
  - Active branch list
  - Recent commits
  - Team member list

**Pagination:**
- All list endpoints support pagination
- Default limit: 20 items
- Max limit: 100 items

**Lazy Loading:**
- Commit history loaded on demand
- File snapshots loaded when needed
- Thumbnails generated on-demand

---

## 12. Integration Points

**Adobe Express API Integration:**
```
1. OAuth token validation
2. Project metadata retrieval
3. Design file export/import
4. User profile information
```

**External Services:**
- File Storage: AWS S3 / Google Cloud Storage
- Email: SendGrid / Mailgun / AWS SES
- Real-time: Socket.io / WebSockets
- Database: MongoDB / PostgreSQL
- Cache: Redis

---

## 13. Deployment Flow

**Environment Setup:**
1. Development
2. Staging
3. Production

**CI/CD Pipeline:**
```
1. Code push to repository
2. Run tests
3. Build Docker image
4. Deploy to staging
5. Run integration tests
6. Deploy to production (if staging passes)
7. Health checks
8. Rollback on failure
```

---

## 14. Monitoring & Logging

**Metrics to Track:**
- API response times
- Error rates
- Active users
- Merge request completion time
- Branch creation rate
- File upload/download speeds

**Logging:**
- All API requests/responses
- Error stack traces
- User actions (audit log)
- System events

---

## 15. API Request/Response Examples

### Create Branch
**Request:**
```http
POST /api/v1/branches
Authorization: Bearer {jwt_token}
Content-Type: application/json

{
  "projectId": "proj_123",
  "name": "new-color-palette",
  "type": "feature",
  "description": "Updating brand colors",
  "baseBranch": "main"
}
```

**Response:**
```json
{
  "_id": "branch_456",
  "projectId": "proj_123",
  "name": "feature/new-color-palette",
  "type": "feature",
  "description": "Updating brand colors",
  "baseBranch": "main",
  "createdBy": "user_789",
  "createdAt": "2024-12-16T10:30:00Z",
  "updatedAt": "2024-12-16T10:30:00Z",
  "status": "active",
  "isPrimary": false
}
```

### Create Merge Request
**Request:**
```http
POST /api/v1/merge-requests
Authorization: Bearer {jwt_token}
Content-Type: application/json

{
  "projectId": "proj_123",
  "sourceBranch": "feature/new-color-palette",
  "targetBranch": "main",
  "title": "Update brand color palette",
  "description": "This merge updates the primary brand colors to match new guidelines"
}
```

**Response:**
```json
{
  "_id": "mr_789",
  "projectId": "proj_123",
  "mergeRequestId": 43,
  "sourceBranch": "feature/new-color-palette",
  "targetBranch": "main",
  "title": "Update brand color palette",
  "description": "This merge updates the primary brand colors...",
  "status": "open",
  "createdBy": "user_789",
  "createdAt": "2024-12-16T11:00:00Z",
  "reviewers": [
    {
      "userId": "user_456",
      "status": "pending",
      "reviewedAt": null,
      "comment": null
    }
  ],
  "stats": {
    "filesChanged": 3,
    "componentsUpdated": 15
  }
}
```

---

This flow document provides a comprehensive blueprint for implementing the backend. Each section can be expanded with specific implementation details when you're ready to code.
