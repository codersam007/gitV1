/**
 * ============================================
 * DESIGN BRANCH MANAGER - UI CONTROLLER
 * ============================================
 * 
 * This file handles all UI interactions for the Design Branch Manager add-on.
 * It integrates with Adobe Express SDK and manages communication with the backend API.
 * 
 * BACKEND API BASE URL - Update this when backend is ready:
 * const API_BASE_URL = 'https://your-backend-api.com/api/v1';
 */

import addOnUISdk from "https://new.express.adobe.com/static/add-on-sdk/sdk.js";

// ============================================
// BACKEND API CONFIGURATION
// ============================================
const API_BASE_URL = 'http://localhost:3000/api/v1';
const AUTH_API_URL = 'http://localhost:3000/auth';

// Current project ID (will be set when project is loaded/created)
let currentProjectId = null;
let currentUserId = null;

// ============================================
// INITIALIZATION
// ============================================
addOnUISdk.ready.then(async () => {
    console.log("Design Branch Manager: addOnUISdk is ready for use.");

    // Get the UI runtime
    const { runtime } = addOnUISdk.instance;

    // Get the proxy object for Document Sandbox runtime communication
    // This allows us to interact with the Adobe Express document
    const sandboxProxy = await runtime.apiProxy("documentSandbox");

    // Initialize UI event listeners
    initializeEventListeners();

    // Auto-login or check if user is logged in
    const authSuccess = await initializeAuth();
    
    if (!authSuccess) {
        console.error('Authentication failed. Please check backend connection.');
        return;
    }

    // Load project ID from localStorage or prompt for project
    const savedProjectId = localStorage.getItem('currentProjectId');
    if (savedProjectId) {
        currentProjectId = savedProjectId;
        // Verify project still exists
        try {
            await apiCall(`/projects/${currentProjectId}`, 'GET');
        } catch (error) {
            console.warn('Saved project not found, clearing:', error);
            localStorage.removeItem('currentProjectId');
            currentProjectId = null;
        }
    }

    // If no project, show project selection/creation UI
    if (!currentProjectId) {
        showProjectSelection();
    } else {
        // Load initial data from backend (only if authenticated)
        await loadProjectData();
    }
});

// ============================================
// AUTHENTICATION HELPERS
// ============================================
/**
 * Get stored JWT token
 */
function getToken() {
    return localStorage.getItem('jwt_token');
}

/**
 * Store JWT token
 */
function setToken(token) {
    localStorage.setItem('jwt_token', token);
}

/**
 * Remove stored token (logout)
 */
function clearToken() {
    localStorage.removeItem('jwt_token');
    currentProjectId = null;
    currentUserId = null;
}

/**
 * Initialize authentication
 * Auto-login with mock user for testing
 */
async function initializeAuth() {
    const token = getToken();
    
    if (token) {
        // Verify token is still valid (without using apiCall to avoid circular dependency)
        try {
            const response = await fetch(`${AUTH_API_URL}/me`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data.success) {
                    currentUserId = data.user.userId;
                    console.log('✅ User authenticated:', data.user.name);
                    return true;
                }
            }
        } catch (error) {
            console.log('Token invalid, logging in...', error);
            clearToken();
        }
    }
    
    // Auto-login with test user (for development)
    // In production, this would use Adobe OAuth
    try {
        console.log('Attempting auto-login...');
        const response = await fetch(`${AUTH_API_URL}/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                adobeToken: 'mock-token-for-development',
                userId: 'user123',
                email: 'test@example.com',
                name: 'Test User',
                avatarUrl: null,
            }),
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Login failed: ${response.status} - ${errorText}`);
        }
        
        const data = await response.json();
        if (data.success && data.token) {
            setToken(data.token);
            currentUserId = data.user.userId;
            console.log('✅ Auto-logged in:', data.user.name);
            return true;
        } else {
            throw new Error('Login response missing token');
        }
    } catch (error) {
        console.error('❌ Failed to auto-login:', error);
        showNotification(`Failed to connect to backend. Please make sure the backend is running on http://localhost:3000\n\nError: ${error.message}`, 'error');
        return false;
    }
}

// ============================================
// API HELPER FUNCTIONS
// ============================================
/**
 * Make authenticated API call
 * @param {string} endpoint - API endpoint (without base URL)
 * @param {string} method - HTTP method
 * @param {object} body - Request body (optional)
 * @returns {Promise<object>} Response data
 */
async function apiCall(endpoint, method = 'GET', body = null) {
    const token = getToken();
    
    if (!token) {
        throw new Error('Not authenticated. Please login.');
    }
    
    const options = {
        method,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
        },
    };
    
    if (body) {
        options.body = JSON.stringify(body);
    }
    
    const response = await fetch(`${API_BASE_URL}${endpoint}`, options);
    
    if (response.status === 401) {
        // Token expired, try to refresh or re-login
        clearToken();
        const authSuccess = await initializeAuth();
        if (!authSuccess) {
            throw new Error('Authentication failed. Please refresh the page.');
        }
        // Retry with new token
        const newToken = getToken();
        if (!newToken) {
            throw new Error('Failed to get new token after re-authentication');
        }
        options.headers['Authorization'] = `Bearer ${newToken}`;
        const retryResponse = await fetch(`${API_BASE_URL}${endpoint}`, options);
        if (!retryResponse.ok) {
            const error = await retryResponse.json().catch(() => ({ error: { message: 'Unknown error' } }));
            throw new Error(error.error?.message || `API Error: ${retryResponse.status}`);
        }
        return await retryResponse.json();
    }
    
    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
        throw new Error(error.error?.message || `API Error: ${response.status}`);
    }
    
    return await response.json();
}

// ============================================
// EVENT LISTENER INITIALIZATION
// ============================================
function initializeEventListeners() {
    // Tab switching functionality
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', (event) => {
            const tabName = tab.getAttribute('data-tab');
            switchTab(tabName, event.target);
        });
    });

    // Close modals when clicking outside
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (event) => {
            if (event.target === modal) {
                closeModal(modal.id);
            }
        });
    });
}

// ============================================
// TAB NAVIGATION
// ============================================
/**
 * Switches between different tabs in the UI
 * @param {string} tabName - The name of the tab to switch to
 * @param {HTMLElement} clickedElement - The element that was clicked
 */
function switchTab(tabName, clickedElement) {
    // Hide all sections
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    
    // Remove active class from all tabs
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    
    // Show the selected section
    const targetSection = document.getElementById(tabName);
    if (targetSection) {
        targetSection.classList.add('active');
    }
    
    // Add active class to clicked tab
    if (clickedElement) {
        clickedElement.classList.add('active');
    }

    // Load data for the selected tab (only if authenticated)
    if (currentProjectId && getToken()) {
        switch(tabName) {
            case 'branches':
                loadBranches().catch(err => console.error('Error loading branches:', err));
                break;
            case 'history':
                loadHistory().catch(err => console.error('Error loading history:', err));
                break;
            case 'merge':
                loadMergeRequests(currentMergeFilter || 'all').catch(err => console.error('Error loading merge requests:', err));
                break;
            case 'team':
                loadTeamMembers().catch(err => console.error('Error loading team members:', err));
                break;
        }
    } else if (!getToken()) {
        console.warn('Not authenticated. Please wait for auto-login to complete.');
    }
}

// ============================================
// MODAL MANAGEMENT
// ============================================
/**
 * Opens the create branch modal
 */
async function openCreateBranchModal() {
    document.getElementById('createBranchModal').classList.add('active');
    // Reset form fields
    document.getElementById('branchName').value = '';
    document.getElementById('branchDesc').value = '';
    document.getElementById('branchType').value = 'feature';
    
    // Populate base branch dropdown
    if (currentProjectId) {
        try {
            const response = await apiCall(`/branches?projectId=${currentProjectId}`, 'GET');
            const baseBranchSelect = document.getElementById('baseBranch');
            if (baseBranchSelect && response.success && response.branches) {
                baseBranchSelect.innerHTML = '';
                response.branches.forEach(branch => {
                    const option = document.createElement('option');
                    option.value = branch.name;
                    option.textContent = branch.name;
                    if (branch.isPrimary || branch.name === 'main') {
                        option.selected = true;
                    }
                    baseBranchSelect.appendChild(option);
                });
            }
        } catch (error) {
            console.error('Error loading branches for base branch select:', error);
        }
    }
}

/**
 * Opens the merge branch modal with pre-filled source branch
 * @param {Event} e - The click event
 */
async function openMergeBranchModal(e) {
    e.stopPropagation();
    const branchItem = e.target.closest('.branch-item');
    const branchName = branchItem.querySelector('.branch-name').textContent;
    
    // Set the source branch (read-only)
    document.getElementById('sourceBranch').value = branchName;
    
    // Reset other fields
    document.getElementById('mergeTitle').value = '';
    document.getElementById('mergeDesc').value = '';
    
    // Populate target branch dropdown
    if (currentProjectId) {
        try {
            const response = await apiCall(`/branches?projectId=${currentProjectId}`, 'GET');
            const targetBranchSelect = document.getElementById('targetBranch');
            if (targetBranchSelect && response.success && response.branches) {
                targetBranchSelect.innerHTML = '';
                response.branches.forEach(branch => {
                    // Don't include the source branch as a target
                    if (branch.name !== branchName) {
                        const option = document.createElement('option');
                        option.value = branch.name;
                        option.textContent = branch.name;
                        if (branch.isPrimary || branch.name === 'main') {
                            option.selected = true;
                        }
                        targetBranchSelect.appendChild(option);
                    }
                });
            }
        } catch (error) {
            console.error('Error loading branches for target branch select:', error);
        }
    }
    
    // Show modal
    document.getElementById('mergeBranchModal').classList.add('active');
}

/**
 * Closes a modal by ID
 * @param {string} modalId - The ID of the modal to close
 */
function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

// ============================================
// BRANCH MANAGEMENT
// ============================================
/**
 * Creates a new branch
 */
async function createBranch() {
    if (!currentProjectId) {
        showNotification('Please create or select a project first', 'warning');
        return;
    }

    const type = document.getElementById('branchType').value;
    const name = document.getElementById('branchName').value.trim();
    const description = document.getElementById('branchDesc').value.trim();
    const baseBranch = document.getElementById('baseBranch').value;

    // Validation
    if (!name) {
        showNotification('Branch name is required', 'warning');
        return;
    }

    try {
        const response = await apiCall(`/branches?projectId=${currentProjectId}`, 'POST', {
            name: name,
            type: type,
            description: description,
            baseBranch: baseBranch,
            projectId: currentProjectId,
        });
        
        if (response.success) {
            showSuccessMessage(`✓ Branch '${response.branch.name}' created successfully`);
            
            // Reload branches list
            await loadBranches();
            
            // Close modal and reset form
            closeModal('createBranchModal');
            document.getElementById('branchName').value = '';
            document.getElementById('branchDesc').value = '';
        }
    } catch (error) {
        console.error('Error creating branch:', error);
        showNotification(`Failed to create branch: ${error.message}`, 'error');
    }
}

/**
 * Adds a new branch to the branch list UI
 * @param {string} branchName - The full name of the branch
 */
function addBranchToList(branchName) {
    const branchList = document.getElementById('branchList');
    const newBranch = document.createElement('div');
    newBranch.className = 'branch-item';
    newBranch.onclick = () => selectBranch(newBranch);
    
    const now = new Date();
    newBranch.innerHTML = `
        <div class="branch-info">
            <div class="branch-name">${branchName}</div>
            <div class="branch-meta">📅 Just now • 👤 You</div>
        </div>
        <div class="branch-actions">
            <button class="btn btn-sm btn-secondary" onclick="openMergeBranchModal(event)">Merge</button>
            <button class="btn btn-sm btn-secondary" onclick="deleteBranch(event)">Delete</button>
        </div>
    `;
    
    // Insert after the main branch (first item)
    if (branchList.children.length > 0) {
        branchList.insertBefore(newBranch, branchList.children[1]);
    } else {
        branchList.appendChild(newBranch);
    }
}

/**
 * Deletes a branch
 * @param {Event} e - The click event
 */
async function deleteBranch(e) {
    e.stopPropagation();
    
    if (!currentProjectId) {
        showNotification('No project selected', 'warning');
        return;
    }
    
    const branchItem = e.target.closest('.branch-item');
    const branchName = branchItem.querySelector('.branch-name').textContent;
    
    // Confirmation dialog
    const confirmed = await showConfirmation(`Are you sure you want to delete branch '${branchName}'?`);
    if (!confirmed) {
        return;
    }

    try {
        const response = await apiCall(`/branches/${encodeURIComponent(branchName)}?projectId=${currentProjectId}`, 'DELETE');
        
        if (response.success) {
            // Remove from UI
            branchItem.remove();
            showSuccessMessage(`✓ Branch '${branchName}' deleted successfully`);
        }
    } catch (error) {
        console.error('Error deleting branch:', error);
        showNotification(`Failed to delete branch: ${error.message}`, 'error');
    }
}

/**
 * Selects a branch (highlights it in the UI)
 * @param {HTMLElement} elem - The branch item element
 */
function selectBranch(elem) {
    // Remove selection from all branches
    document.querySelectorAll('.branch-item').forEach(item => {
        item.style.borderColor = 'var(--color-border)';
        item.style.background = 'var(--color-surface)';
    });
    
    // Highlight selected branch
    elem.style.borderColor = 'var(--color-primary)';
    elem.style.background = 'rgba(20, 115, 230, 0.03)';

    // TODO: Load branch details or switch to this branch
    // const branchName = elem.querySelector('.branch-name').textContent;
    // switchToBranch(branchName);
}

/**
 * Updates the branch name input prefix based on selected type
 */
function updateBranchPrefix() {
    const type = document.getElementById('branchType').value;
    const nameInput = document.getElementById('branchName');
    nameInput.focus();
    // The prefix will be added automatically in createBranch()
}

// ============================================
// MERGE REQUEST MANAGEMENT
// ============================================
/**
 * Submits a merge request
 * This function will call the backend API when ready
 */
async function submitMergeRequest() {
    const sourceBranch = document.getElementById('sourceBranch').value;
    const targetBranch = document.getElementById('targetBranch').value;
    const title = document.getElementById('mergeTitle').value.trim();
    const description = document.getElementById('mergeDesc').value.trim();

    // Validation
    if (!title) {
        showNotification('Merge request title is required', 'warning');
        return;
    }

    if (sourceBranch === targetBranch) {
        showNotification('Source and target branches cannot be the same', 'warning');
        return;
    }

    if (!currentProjectId) {
        showNotification('No project selected', 'warning');
        return;
    }

    try {
        const response = await apiCall(`/merge-requests`, 'POST', {
            projectId: currentProjectId,
            sourceBranch: sourceBranch,
            targetBranch: targetBranch,
            title: title,
            description: description,
        });
        
        if (response.success) {
            showNotification(`Merge request created! (#${response.mergeRequest.mergeRequestId})\n\nTeam members will receive notifications.`, 'success');
            closeModal('mergeBranchModal');
            
            // Switch to merge tab and reload
            const mergeTab = document.querySelectorAll('.tab')[2];
            if (mergeTab) {
                switchTab('merge', mergeTab);
                await loadMergeRequests();
            }
        }
    } catch (error) {
        console.error('Error creating merge request:', error);
        showNotification(`Failed to create merge request: ${error.message}`, 'error');
    }
}

/**
 * Approves a merge request
 * @param {HTMLElement|Event} btnOrEvent - The approve button element or click event
 */
async function approveMerge(btnOrEvent) {
    // Handle both button element and event
    const btn = btnOrEvent.target || btnOrEvent;
    if (btnOrEvent.stopPropagation) {
        btnOrEvent.stopPropagation();
    }
    
    console.log('Approve button clicked', btn);
    
    if (!currentProjectId) {
        showNotification('No project selected', 'warning');
        return;
    }

    const card = btn.closest('.card');
    if (!card) {
        console.error('Could not find card element');
        showNotification('Error: Could not find merge request', 'error');
        return;
    }
    
    const mergeRequestId = card.getAttribute('data-merge-id');
    if (!mergeRequestId) {
        console.error('Could not find merge request ID');
        showNotification('Error: Could not find merge request ID', 'error');
        return;
    }

    console.log('Approving merge request:', mergeRequestId, 'for project:', currentProjectId);

    // Disable button to prevent double-click
    btn.disabled = true;
    btn.textContent = 'Approving...';

    try {
        const response = await apiCall(`/merge-requests/${mergeRequestId}/approve?projectId=${currentProjectId}`, 'POST');
        
        console.log('Approve response:', response);
        
        if (response.success) {
            const mergeRequest = response.mergeRequest;
            const status = mergeRequest?.status || 'open';
            
            // Show appropriate message based on status
            if (status === 'approved') {
                showNotification('Merge request approved! Ready to merge.', 'success');
            } else {
                // Still needs more approvals
                const approvedCount = mergeRequest?.reviewers?.filter(r => r.status === 'approved').length || 0;
                const minReviews = mergeRequest?.minReviews || 2;
                showNotification(`Your approval recorded! (${approvedCount}/${minReviews} approvals)`, 'success');
            }
            
            // Force reload merge requests to show updated status
            console.log('Reloading merge requests...');
            await loadMergeRequests();
            console.log('Merge requests reloaded');
        } else {
            throw new Error(response.error?.message || 'Failed to approve');
        }
    } catch (error) {
        console.error('Error approving merge request:', error);
        showNotification(`Failed to approve merge request: ${error.message}`, 'error');
        // Re-enable button on error
        btn.disabled = false;
        btn.textContent = '✓ Approve';
    }
}

/**
 * Requests changes on a merge request
 * @param {HTMLElement|Event} btnOrEvent - The request changes button element or click event
 */
async function requestChanges(btnOrEvent) {
    // Handle both button element and event
    const btn = btnOrEvent.target || btnOrEvent;
    if (btnOrEvent.stopPropagation) {
        btnOrEvent.stopPropagation();
    }
    
    if (!currentProjectId) {
        showNotification('No project selected', 'warning');
        return;
    }

    const card = btn.closest('.card');
    const mergeRequestId = card?.getAttribute('data-merge-id') || btn.getAttribute('data-merge-id');
    
    if (!mergeRequestId) {
        showNotification('Error: Could not find merge request ID', 'error');
        return;
    }
    
    // Use custom prompt since prompt() doesn't work in sandboxed environment
    const comment = await showCommentPrompt('Please provide feedback:') || '';

    try {
        const response = await apiCall(`/merge-requests/${mergeRequestId}/request-changes?projectId=${currentProjectId}`, 'POST', {
            comment: comment,
        });
        
        if (response.success) {
            showNotification('Change request sent', 'success');
            await loadMergeRequests(); // Reload to show updated status
        }
    } catch (error) {
        console.error('Error requesting changes:', error);
        showNotification(`Failed to request changes: ${error.message}`, 'error');
    }
}

/**
 * Completes a merge request
 * @param {HTMLElement|Event} btnOrEvent - The merge button element or click event
 */
async function completeMerge(btnOrEvent) {
    // Handle both button element and event
    const btn = btnOrEvent.target || btnOrEvent;
    if (btnOrEvent.stopPropagation) {
        btnOrEvent.stopPropagation();
    }
    
    if (!currentProjectId) {
        showNotification('No project selected', 'warning');
        return;
    }

    const card = btn.closest('.card');
    const mergeRequestId = card?.getAttribute('data-merge-id') || btn.getAttribute('data-merge-id');
    
    if (!mergeRequestId) {
        showNotification('Error: Could not find merge request ID', 'error');
        return;
    }

    const confirmed = await showConfirmation('Are you sure you want to merge this request?');
    if (!confirmed) {
        return;
    }

    // Disable button
    btn.disabled = true;
    btn.textContent = 'Merging...';

    try {
        const response = await apiCall(`/merge-requests/${mergeRequestId}/merge?projectId=${currentProjectId}`, 'POST');
        
        if (response.success) {
            showNotification('Merge completed successfully!', 'success');
            await loadMergeRequests(); // Reload to show updated status
            await loadBranches(); // Reload branches in case any were merged/deleted
        }
    } catch (error) {
        console.error('Error completing merge:', error);
        showNotification(`Failed to complete merge: ${error.message}`, 'error');
        // Re-enable button on error
        btn.disabled = false;
        btn.textContent = 'Merge Now';
    }
}

/**
 * Filters merge requests by status
 * @param {string} status - The status to filter by ('open', 'merged', 'closed')
 */
// Track current filter state
let currentMergeFilter = 'all';

async function filterMerge(status) {
    currentMergeFilter = status;
    
    console.log('Filtering merge requests by status:', status);
    
    // Update button states to show active filter
    const mergeSection = document.getElementById('merge');
    if (mergeSection) {
        const filterButtons = mergeSection.querySelectorAll('.merge-filter-btn');
        filterButtons.forEach(btn => {
            const btnFilter = btn.getAttribute('data-filter');
            if (btnFilter === status) {
                btn.classList.remove('btn-secondary');
                btn.classList.add('btn-primary');
            } else {
                btn.classList.remove('btn-primary');
                btn.classList.add('btn-secondary');
            }
        });
    }
    
    // Load merge requests with filter
    await loadMergeRequests(status);
}

// ============================================
// TEAM MANAGEMENT
// ============================================
/**
 * Invites a team member
 */
async function inviteMember() {
    const email = document.getElementById('inviteEmail').value.trim();
    
    // Validation
    if (!email) {
        showNotification('Please enter an email address', 'warning');
        return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        showNotification('Please enter a valid email address', 'warning');
        return;
    }

    if (!currentProjectId) {
        showNotification('No project selected', 'warning');
        return;
    }

    try {
        const response = await apiCall(`/team/invite`, 'POST', {
            projectId: currentProjectId,
            email: email,
            role: 'designer', // Default role
        });
        
        if (response.success) {
            showNotification(`Invitation sent to ${email}`, 'success');
            document.getElementById('inviteEmail').value = '';
            await loadTeamMembers(); // Reload team list
        }
    } catch (error) {
        console.error('Error sending invitation:', error);
        showNotification(`Failed to send invitation: ${error.message}`, 'error');
    }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================
/**
 * Shows a success message
 * @param {string} message - The message to display
 */
function showSuccessMessage(message) {
    const successMsg = document.getElementById('branchSuccess');
    if (successMsg) {
        successMsg.textContent = message;
        successMsg.classList.add('show');
        
        // Hide after 3 seconds
        setTimeout(() => {
            successMsg.classList.remove('show');
        }, 3000);
    }
}

/**
 * Shows a comment prompt (replaces prompt() for sandboxed environment)
 * @param {string} message - The prompt message
 * @returns {Promise<string>} - The entered comment or empty string
 */
function showCommentPrompt(message) {
    return new Promise((resolve) => {
        // Create comment modal if it doesn't exist
        let commentModal = document.getElementById('commentModal');
        if (!commentModal) {
            commentModal = document.createElement('div');
            commentModal.id = 'commentModal';
            commentModal.className = 'modal';
            commentModal.innerHTML = `
                <div class="modal-content" style="max-width: 500px;">
                    <div class="modal-title">Provide Feedback</div>
                    <div style="margin-bottom: 12px; color: var(--color-text);">${message}</div>
                    <textarea id="commentInput" style="width: 100%; min-height: 100px; padding: 8px; border: 1px solid var(--color-border); border-radius: 4px; font-family: var(--font-family);" placeholder="Enter your feedback here..."></textarea>
                    <div class="modal-footer">
                        <button id="commentCancel" class="btn btn-secondary">Cancel</button>
                        <button id="commentSubmit" class="btn btn-primary">Submit</button>
                    </div>
                </div>
            `;
            document.body.appendChild(commentModal);
            
            // Handle clicks
            document.getElementById('commentCancel').onclick = () => {
                commentModal.classList.remove('active');
                resolve('');
            };
            document.getElementById('commentSubmit').onclick = () => {
                const comment = document.getElementById('commentInput').value.trim();
                commentModal.classList.remove('active');
                document.getElementById('commentInput').value = '';
                resolve(comment);
            };
            
            // Close on backdrop click
            commentModal.onclick = (e) => {
                if (e.target === commentModal) {
                    commentModal.classList.remove('active');
                    resolve('');
                }
            };
        }
        
        // Show and focus
        commentModal.classList.add('active');
        setTimeout(() => {
            const input = document.getElementById('commentInput');
            if (input) input.focus();
        }, 100);
    });
}

/**
 * Shows a confirmation dialog (replaces confirm() for sandboxed environment)
 * @param {string} message - The confirmation message
 * @returns {Promise<boolean>} - True if confirmed, false if cancelled
 */
function showConfirmation(message) {
    return new Promise((resolve) => {
        // Create confirmation modal if it doesn't exist
        let confirmModal = document.getElementById('confirmationModal');
        if (!confirmModal) {
            confirmModal = document.createElement('div');
            confirmModal.id = 'confirmationModal';
            confirmModal.className = 'modal';
            confirmModal.innerHTML = `
                <div class="modal-content" style="max-width: 400px;">
                    <div class="modal-title">Confirm Action</div>
                    <div id="confirmMessage" style="margin-bottom: 20px; color: var(--color-text);"></div>
                    <div class="modal-footer">
                        <button id="confirmCancel" class="btn btn-secondary">Cancel</button>
                        <button id="confirmOk" class="btn btn-primary">Confirm</button>
                    </div>
                </div>
            `;
            document.body.appendChild(confirmModal);
            
            // Handle clicks
            document.getElementById('confirmCancel').onclick = () => {
                confirmModal.classList.remove('active');
                resolve(false);
            };
            document.getElementById('confirmOk').onclick = () => {
                confirmModal.classList.remove('active');
                resolve(true);
            };
            
            // Close on backdrop click
            confirmModal.onclick = (e) => {
                if (e.target === confirmModal) {
                    confirmModal.classList.remove('active');
                    resolve(false);
                }
            };
        }
        
        // Set message and show
        document.getElementById('confirmMessage').textContent = message;
        confirmModal.classList.add('active');
    });
}

/**
 * Shows a notification message (replaces alert() for sandboxed environment)
 * @param {string} message - The message to display
 * @param {string} type - 'error', 'warning', 'info', 'success' (default: 'info')
 */
function showNotification(message, type = 'info') {
    // Create notification element if it doesn't exist
    let notification = document.getElementById('globalNotification');
    if (!notification) {
        notification = document.createElement('div');
        notification.id = 'globalNotification';
        notification.style.cssText = `
            position: fixed;
            top: 80px;
            right: 20px;
            padding: 16px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 10000;
            max-width: 400px;
            font-size: 14px;
            font-weight: 500;
            display: none;
            animation: slideIn 0.3s ease;
        `;
        document.body.appendChild(notification);
        
        // Add animation
        const style = document.createElement('style');
        style.textContent = `
            @keyframes slideIn {
                from {
                    transform: translateX(100%);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }
        `;
        document.head.appendChild(style);
    }
    
    // Set colors based on type
    const colors = {
        error: { bg: 'rgba(232, 17, 35, 0.15)', border: 'rgba(232, 17, 35, 0.3)', text: '#E81123' },
        warning: { bg: 'rgba(255, 140, 0, 0.15)', border: 'rgba(255, 140, 0, 0.3)', text: '#FF8C00' },
        info: { bg: 'rgba(20, 115, 230, 0.15)', border: 'rgba(20, 115, 230, 0.3)', text: '#1473E6' },
        success: { bg: 'rgba(16, 124, 16, 0.15)', border: 'rgba(16, 124, 16, 0.3)', text: '#107C10' },
    };
    
    const color = colors[type] || colors.info;
    notification.style.background = color.bg;
    notification.style.border = `1px solid ${color.border}`;
    notification.style.color = color.text;
    notification.textContent = message;
    notification.style.display = 'block';
    
    // Also log to console
    console.log(`[${type.toUpperCase()}] ${message}`);
    
    // Hide after 5 seconds (longer for errors)
    const hideDelay = type === 'error' ? 7000 : 5000;
    setTimeout(() => {
        notification.style.display = 'none';
    }, hideDelay);
}

/**
 * Gets the current project ID
 * @returns {string} The current project ID
 */
function getCurrentProjectId() {
    return currentProjectId;
}

/**
 * Loads all project data
 */
async function loadProjectData() {
    if (!currentProjectId || !getToken()) return;
    
    try {
        await Promise.all([
            loadBranches(),
            loadHistory(),
            loadMergeRequests('all'),
            loadTeamMembers(),
            loadProjectSettings()
        ]);
        
        // Set initial filter button state
        currentMergeFilter = 'all';
        const mergeSection = document.getElementById('merge');
        if (mergeSection) {
            const allBtn = mergeSection.querySelector('[data-filter="all"]');
            if (allBtn) {
                allBtn.classList.remove('btn-secondary');
                allBtn.classList.add('btn-primary');
            }
        }
    } catch (error) {
        console.error('Error loading project data:', error);
        showNotification(`Failed to load project data: ${error.message}`, 'error');
    }
}

/**
 * Shows project selection/creation UI
 */
function showProjectSelection() {
    // Create project selection modal
    let projectModal = document.getElementById('projectSelectionModal');
    if (!projectModal) {
        projectModal = document.createElement('div');
        projectModal.id = 'projectSelectionModal';
        projectModal.className = 'modal active';
        projectModal.innerHTML = `
            <div class="modal-content" style="max-width: 500px;">
                <div class="modal-title">Select or Create Project</div>
                <div class="input-group">
                    <label class="label">Project ID</label>
                    <input type="text" id="projectIdInput" placeholder="Enter project ID (e.g., proj_123)">
                    <div style="font-size: 11px; color: var(--color-text-secondary); margin-top: 4px;">
                        This should match your Adobe Express project ID
                    </div>
                </div>
                <div class="input-group">
                    <label class="label">Project Name (if creating new)</label>
                    <input type="text" id="projectNameInput" placeholder="My Design Project">
                </div>
                <div class="input-group">
                    <label class="label">Description (optional)</label>
                    <textarea id="projectDescInput" placeholder="Project description"></textarea>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-primary" onclick="handleProjectSelection()">Continue</button>
                </div>
            </div>
        `;
        document.body.appendChild(projectModal);
        
        // Focus on input
        setTimeout(() => {
            const input = document.getElementById('projectIdInput');
            if (input) input.focus();
        }, 100);
    } else {
        projectModal.classList.add('active');
    }
}

/**
 * Handles project selection or creation
 */
async function handleProjectSelection() {
    const projectId = document.getElementById('projectIdInput').value.trim();
    const projectName = document.getElementById('projectNameInput').value.trim();
    const description = document.getElementById('projectDescInput').value.trim();
    
    if (!projectId) {
        showNotification('Project ID is required', 'warning');
        return;
    }
    
    try {
        // Try to get existing project
        try {
            const response = await apiCall(`/projects/${projectId}`, 'GET');
            if (response.success) {
                currentProjectId = projectId;
                setCurrentProjectId(projectId);
                document.getElementById('projectSelectionModal').classList.remove('active');
                await loadProjectData();
                showNotification('Project loaded successfully', 'success');
                return;
            }
        } catch (error) {
            // Project doesn't exist, create it
            if (projectName) {
                const createResponse = await apiCall(`/projects`, 'POST', {
                    projectId: projectId,
                    name: projectName,
                    description: description
                });
                
                if (createResponse.success) {
                    currentProjectId = projectId;
                    setCurrentProjectId(projectId);
                    document.getElementById('projectSelectionModal').classList.remove('active');
                    await loadProjectData();
                    showNotification('Project created successfully', 'success');
                }
            } else {
                showNotification('Project not found. Please provide a project name to create it.', 'warning');
            }
        }
    } catch (error) {
        console.error('Error handling project selection:', error);
        showNotification(`Failed to load/create project: ${error.message}`, 'error');
    }
}

/**
 * Sets the current project ID
 * @param {string} projectId - The project ID to set
 */
function setCurrentProjectId(projectId) {
    currentProjectId = projectId;
    localStorage.setItem('currentProjectId', projectId);
}

// ============================================
// BACKEND API FUNCTIONS (To be implemented)
// ============================================

/**
 * Loads all branches from the backend
 */
async function loadBranches() {
    if (!currentProjectId) return;
    
    try {
        const response = await apiCall(`/branches?projectId=${currentProjectId}`, 'GET');
        
        if (response.success && response.branches) {
            renderBranches(response.branches);
        }
    } catch (error) {
        console.error('Error loading branches:', error);
    }
}

/**
 * Renders branches in the UI
 */
function renderBranches(branches) {
    const branchList = document.getElementById('branchList');
    if (!branchList) return;
    
    branchList.innerHTML = '';
    
    branches.forEach(branch => {
        const branchItem = document.createElement('div');
        branchItem.className = 'branch-item';
        branchItem.onclick = () => selectBranch(branchItem);
        
        const updatedDate = branch.updatedAt ? new Date(branch.updatedAt).toLocaleString() : 'Unknown';
        const isPrimary = branch.isPrimary || branch.name === 'main';
        
        branchItem.innerHTML = `
            <div class="branch-info">
                <div class="branch-name">${branch.name}</div>
                <div class="branch-meta">📅 Updated ${updatedDate}</div>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
                ${isPrimary ? '<span class="badge badge-success">Primary</span>' : ''}
                ${!isPrimary ? `
                    <div class="branch-actions">
                        <button class="btn btn-sm btn-secondary" onclick="openMergeBranchModal(event)">Merge</button>
                        <button class="btn btn-sm btn-secondary" onclick="deleteBranch(event)">Delete</button>
                    </div>
                ` : ''}
            </div>
        `;
        
        branchList.appendChild(branchItem);
    });
}

/**
 * Loads version history from the backend
 */
async function loadHistory() {
    if (!currentProjectId) return;
    
    try {
        const response = await apiCall(`/history?projectId=${currentProjectId}&limit=20`, 'GET');
        
        if (response.success && response.commits) {
            renderHistory(response.commits);
        }
    } catch (error) {
        console.error('Error loading history:', error);
    }
}

/**
 * Renders history in the UI
 */
function renderHistory(commits) {
    const historySection = document.getElementById('history');
    if (!historySection) return;
    
    // Find the container (after the h2)
    let historyContainer = historySection.querySelector('.history-container');
    if (!historyContainer) {
        historyContainer = document.createElement('div');
        historySection.appendChild(historyContainer);
    }
    
    historyContainer.innerHTML = '';
    
    if (commits.length === 0) {
        historyContainer.innerHTML = '<div class="empty-state">No commits yet</div>';
        return;
    }
    
    commits.forEach((commit, index) => {
        const historyItem = document.createElement('div');
        historyItem.className = `history-item ${index === 0 ? 'current' : ''}`;
        
        const date = new Date(commit.timestamp).toLocaleString();
        const authorName = commit.author?.name || 'Unknown';
        
        historyItem.innerHTML = `
            <div class="history-timestamp">${date}</div>
            <div class="history-message"><strong>${commit.hash}</strong> - ${commit.message}</div>
            <div class="history-author">${authorName}</div>
        `;
        
        historyContainer.appendChild(historyItem);
    });
}

/**
 * Loads merge requests from the backend
 */
async function loadMergeRequests(status = 'all') {
    if (!currentProjectId) {
        console.warn('Cannot load merge requests: No project ID');
        return;
    }
    
    try {
        const url = `/merge-requests?projectId=${currentProjectId}${status !== 'all' ? `&status=${status}` : ''}`;
        console.log('Loading merge requests from:', url);
        const response = await apiCall(url, 'GET');
        
        console.log('Merge requests response:', response);
        
        if (response.success && response.mergeRequests) {
            console.log(`Rendering ${response.mergeRequests.length} merge requests with status filter: ${status}`);
            console.log('Merge request statuses:', response.mergeRequests.map(mr => ({ id: mr.mergeRequestId, status: mr.status })));
            renderMergeRequests(response.mergeRequests);
        } else {
            console.warn('No merge requests in response:', response);
            // Show empty state
            const mergeList = document.getElementById('mergeList');
            if (mergeList) {
                mergeList.innerHTML = '<div class="empty-state">No merge requests found</div>';
            }
        }
    } catch (error) {
        console.error('Error loading merge requests:', error);
        showNotification(`Failed to load merge requests: ${error.message}`, 'error');
    }
}

/**
 * Renders merge requests in the UI
 */
function renderMergeRequests(mergeRequests) {
    const mergeList = document.getElementById('mergeList');
    if (!mergeList) {
        console.error('Merge list element not found');
        return;
    }
    
    console.log('Rendering merge requests:', mergeRequests);
    
    // Clear existing content
    mergeList.innerHTML = '';
    
    if (mergeRequests.length === 0) {
        mergeList.innerHTML = '<div class="empty-state">No merge requests yet</div>';
        return;
    }
    
    mergeRequests.forEach(mr => {
        console.log('Rendering MR:', mr.mergeRequestId, 'Status:', mr.status, 'Reviewers:', mr.reviewers);
        const card = document.createElement('div');
        card.className = 'card';
        card.setAttribute('data-merge-id', mr.mergeRequestId);
        
        const statusBadge = getStatusBadge(mr.status);
        const date = new Date(mr.createdAt).toLocaleString();
        const creatorName = mr.createdByUser?.name || 'Unknown';
        
        // Check if current user has already approved
        const currentUserApproved = mr.reviewers?.some(r => 
            r.userId === currentUserId && r.status === 'approved'
        ) || false;
        
        // Count approvals
        const approvedCount = mr.reviewers?.filter(r => r.status === 'approved').length || 0;
        const totalReviewers = mr.reviewers?.length || 0;
        
        let actionButtons = '';
        if (mr.status === 'open') {
            if (currentUserApproved) {
                // User has already approved, show waiting message
                actionButtons = `
                    <div style="padding: 8px 12px; background: rgba(20, 115, 230, 0.05); border-radius: 4px; font-size: 12px; color: var(--color-primary);">
                        ✓ You approved • Waiting for ${totalReviewers - approvedCount} more approval(s)
                    </div>
                `;
            } else {
                // User can still approve
                actionButtons = `
                    <button class="btn btn-primary approve-btn" data-merge-id="${mr.mergeRequestId}">✓ Approve</button>
                    <button class="btn btn-secondary request-changes-btn" data-merge-id="${mr.mergeRequestId}">Request Changes</button>
                `;
            }
        } else if (mr.status === 'approved') {
            actionButtons = `
                <button class="btn btn-primary complete-merge-btn" data-merge-id="${mr.mergeRequestId}">Merge Now</button>
            `;
        } else if (mr.status === 'merged') {
            actionButtons = `
                <div style="padding: 8px 12px; background: rgba(16, 124, 16, 0.05); border-radius: 4px; font-size: 12px; color: var(--color-success);">
                    ✓ Merged by ${mr.mergedBy || 'User'} on ${new Date(mr.mergedAt).toLocaleDateString()}
                </div>
            `;
        }
        
        card.innerHTML = `
            <div class="card-header">
                <div>
                    <h3 class="card-title">#${mr.mergeRequestId} Merge ${mr.sourceBranch} into ${mr.targetBranch}</h3>
                    <div style="font-size: 12px; color: var(--color-text-secondary); margin-top: 4px;">
                        Created by ${creatorName} • ${date}
                    </div>
                </div>
                ${statusBadge}
            </div>
            <div style="font-size: 13px; margin-bottom: 12px; color: var(--color-text-secondary);">
                ${mr.title}
            </div>
            <div class="stat-grid">
                <div class="stat-card">
                    <div class="stat-value">${mr.stats?.filesChanged || 0}</div>
                    <div class="stat-label">Files Changed</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${mr.stats?.componentsUpdated || 0}</div>
                    <div class="stat-label">Components Updated</div>
                </div>
            </div>
            ${actionButtons ? `<div class="btn-group">${actionButtons}</div>` : ''}
        `;
        
        // Attach event listeners after creating the card
        const approveBtn = card.querySelector('.approve-btn');
        if (approveBtn) {
            approveBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                e.preventDefault();
                await approveMerge(e);
            });
        }
        
        const requestChangesBtn = card.querySelector('.request-changes-btn');
        if (requestChangesBtn) {
            requestChangesBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                e.preventDefault();
                await requestChanges(e);
            });
        }
        
        const completeMergeBtn = card.querySelector('.complete-merge-btn');
        if (completeMergeBtn) {
            completeMergeBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                e.preventDefault();
                await completeMerge(e);
            });
        }
        
        mergeList.appendChild(card);
        console.log('Card rendered for MR #' + mr.mergeRequestId);
    });
}

function getStatusBadge(status) {
    const badges = {
        'open': '<span class="badge badge-info">Pending Review</span>',
        'approved': '<span class="badge badge-success">Approved</span>',
        'merged': '<span class="badge badge-success">Merged</span>',
        'closed': '<span class="badge badge-warning">Closed</span>',
        'rejected': '<span class="badge badge-danger">Rejected</span>',
    };
    return badges[status] || '<span class="badge badge-info">Unknown</span>';
}

/**
 * Loads team members from the backend
 */
async function loadTeamMembers() {
    if (!currentProjectId) return;
    
    try {
        const response = await apiCall(`/team?projectId=${currentProjectId}`, 'GET');
        
        if (response.success && response.teamMembers) {
            renderTeamMembers(response.teamMembers);
        }
    } catch (error) {
        console.error('Error loading team members:', error);
    }
}

/**
 * Renders team members in the UI
 */
function renderTeamMembers(teamMembers) {
    const teamSection = document.getElementById('team');
    if (!teamSection) return;
    
    // Update stats
    const activeCount = teamMembers.filter(m => m.status === 'active').length;
    const statsCards = teamSection.querySelector('.stat-grid');
    if (statsCards) {
        statsCards.innerHTML = `
            <div class="stat-card">
                <div class="stat-value">${teamMembers.length}</div>
                <div class="stat-label">Total Members</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${activeCount}</div>
                <div class="stat-label">Active Today</div>
            </div>
        `;
    }
    
    // Find or create members list
    let membersList = teamSection.querySelector('.branch-list');
    if (!membersList) {
        membersList = document.createElement('div');
        membersList.className = 'branch-list';
        teamSection.appendChild(membersList);
    }
    
    membersList.innerHTML = '';
    
    teamMembers.forEach(member => {
        const card = document.createElement('div');
        card.className = 'card';
        
        const statusBadge = member.status === 'active' 
            ? '<span class="badge badge-success">Active</span>'
            : member.status === 'pending'
            ? '<span class="badge badge-warning">Pending</span>'
            : '<span class="badge badge-warning">Inactive</span>';
        
        const userName = member.user?.name || member.email || 'Unknown';
        const role = member.role || 'designer';
        
        card.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <div class="card-title">${userName}</div>
                    <div style="font-size: 12px; color: var(--color-text-secondary);">
                        ${role.charAt(0).toUpperCase() + role.slice(1)} • ${member.commitCount || 0} commits
                    </div>
                </div>
                ${statusBadge}
            </div>
        `;
        
        membersList.appendChild(card);
    });
}

// ============================================
// EXPORT FUNCTIONS FOR GLOBAL ACCESS
// ============================================
// These functions need to be accessible from HTML onclick handlers
window.openCreateBranchModal = openCreateBranchModal;
window.openMergeBranchModal = openMergeBranchModal;
window.closeModal = closeModal;
window.createBranch = createBranch;
window.deleteBranch = deleteBranch;
window.selectBranch = selectBranch;
window.updateBranchPrefix = updateBranchPrefix;
window.submitMergeRequest = submitMergeRequest;
window.approveMerge = approveMerge;
window.requestChanges = requestChanges;
window.completeMerge = completeMerge;
window.filterMerge = filterMerge;
window.inviteMember = inviteMember;
window.handleProjectSelection = handleProjectSelection;
window.submitCommit = submitCommit;
window.createCommit = createCommit;
window.saveProjectSettings = saveProjectSettings;

/**
 * Loads project settings from backend
 */
async function loadProjectSettings() {
    if (!currentProjectId) return;
    
    try {
        const response = await apiCall(`/projects/${currentProjectId}`, 'GET');
        if (response.success && response.project) {
            renderProjectSettings(response.project);
        }
    } catch (error) {
        console.error('Error loading project settings:', error);
    }
}

/**
 * Renders project settings in the UI
 */
function renderProjectSettings(project) {
    const settingsSection = document.getElementById('settings');
    if (!settingsSection) return;
    
    const settings = project.settings || {};
    const branchProtection = settings.branchProtection || {};
    const notifications = settings.notifications || {};
    
    // Update branch protection checkboxes
    const requireApprovalCheckbox = settingsSection.querySelector('#requireApproval');
    if (requireApprovalCheckbox) {
        requireApprovalCheckbox.checked = branchProtection.requireApproval !== false;
    }
    
    const minReviewsInput = settingsSection.querySelector('#minReviews');
    if (minReviewsInput) {
        minReviewsInput.value = branchProtection.minReviews || 2;
    }
    
    const autoDeleteCheckbox = settingsSection.querySelector('#autoDeleteMerged');
    if (autoDeleteCheckbox) {
        autoDeleteCheckbox.checked = branchProtection.autoDeleteMerged === true;
    }
    
    // Update notification checkboxes
    const notifyMergeRequest = settingsSection.querySelector('#notifyMergeRequest');
    if (notifyMergeRequest) {
        notifyMergeRequest.checked = notifications.onMergeRequest !== false;
    }
    
    const notifyBranchUpdate = settingsSection.querySelector('#notifyBranchUpdate');
    if (notifyBranchUpdate) {
        notifyBranchUpdate.checked = notifications.onBranchUpdate !== false;
    }
}

/**
 * Saves project settings
 */
async function saveProjectSettings() {
    if (!currentProjectId) {
        showNotification('No project selected', 'warning');
        return;
    }
    
    const settingsSection = document.getElementById('settings');
    if (!settingsSection) return;
    
    const requireApproval = settingsSection.querySelector('#requireApproval')?.checked ?? true;
    const minReviews = parseInt(settingsSection.querySelector('#minReviews')?.value || '2');
    const autoDeleteMerged = settingsSection.querySelector('#autoDeleteMerged')?.checked ?? false;
    const notifyMergeRequest = settingsSection.querySelector('#notifyMergeRequest')?.checked ?? true;
    const notifyBranchUpdate = settingsSection.querySelector('#notifyBranchUpdate')?.checked ?? true;
    
    try {
        const response = await apiCall(`/projects/${currentProjectId}/settings`, 'PUT', {
            settings: {
                branchProtection: {
                    requireApproval: requireApproval,
                    minReviews: minReviews,
                    autoDeleteMerged: autoDeleteMerged,
                },
                notifications: {
                    onMergeRequest: notifyMergeRequest,
                    onBranchUpdate: notifyBranchUpdate,
                },
            },
        });
        
        if (response.success) {
            showNotification('Settings saved successfully', 'success');
        }
    } catch (error) {
        console.error('Error saving settings:', error);
        showNotification(`Failed to save settings: ${error.message}`, 'error');
    }
}

/**
 * Creates a new commit with current document snapshot
 */
async function createCommit() {
    if (!currentProjectId) {
        showNotification('No project selected', 'warning');
        return;
    }
    
    // Get current branch (for now, use main or first branch)
    const branchList = document.getElementById('branchList');
    if (!branchList || branchList.children.length === 0) {
        showNotification('No branches available. Please create a branch first.', 'warning');
        return;
    }
    
    // Show commit modal
    let commitModal = document.getElementById('commitModal');
    if (!commitModal) {
        commitModal = document.createElement('div');
        commitModal.id = 'commitModal';
        commitModal.className = 'modal';
        commitModal.innerHTML = `
            <div class="modal-content" style="max-width: 500px;">
                <div class="modal-title">Create Commit</div>
                <div class="input-group">
                    <label class="label">Branch</label>
                    <select id="commitBranchSelect"></select>
                </div>
                <div class="input-group">
                    <label class="label">Commit Message</label>
                    <textarea id="commitMessage" placeholder="Describe your changes..." style="min-height: 100px;"></textarea>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="closeModal('commitModal')">Cancel</button>
                    <button class="btn btn-primary" onclick="submitCommit()">Create Commit</button>
                </div>
            </div>
        `;
        document.body.appendChild(commitModal);
    }
    
    // Populate branch select
    const branchSelect = document.getElementById('commitBranchSelect');
    branchSelect.innerHTML = '';
    const branches = await apiCall(`/branches?projectId=${currentProjectId}`, 'GET');
    if (branches.success && branches.branches) {
        branches.branches.forEach(branch => {
            const option = document.createElement('option');
            option.value = branch._id || branch.id;
            option.textContent = branch.name;
            if (branch.isPrimary) {
                option.selected = true;
            }
            branchSelect.appendChild(option);
        });
    }
    
    commitModal.classList.add('active');
    document.getElementById('commitMessage').focus();
}

/**
 * Submits a commit
 */
async function submitCommit() {
    const branchId = document.getElementById('commitBranchSelect').value;
    const message = document.getElementById('commitMessage').value.trim();
    
    if (!message) {
        showNotification('Commit message is required', 'warning');
        return;
    }
    
    if (!branchId) {
        showNotification('Please select a branch', 'warning');
        return;
    }
    
    try {
        // Get document snapshot from Adobe Express
        const { runtime } = addOnUISdk.instance;
        const sandboxProxy = await runtime.apiProxy("documentSandbox");
        
        // Export document as JSON
        const documentData = await sandboxProxy.exportDocument();
        
        // Convert to Blob
        const blob = new Blob([JSON.stringify(documentData)], { type: 'application/json' });
        const file = new File([blob], 'snapshot.json', { type: 'application/json' });
        
        // Create FormData for file upload
        const formData = new FormData();
        formData.append('snapshot', file);
        formData.append('projectId', currentProjectId);
        formData.append('branchId', branchId);
        formData.append('message', message);
        formData.append('changes', JSON.stringify({
            filesAdded: 0,
            filesModified: 1,
            filesDeleted: 0,
            componentsUpdated: 0,
        }));
        
        const token = getToken();
        const response = await fetch(`${API_BASE_URL}/commits`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
            },
            body: formData,
        });
        
        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
            throw new Error(error.error?.message || `API Error: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('Commit created successfully', 'success');
            closeModal('commitModal');
            document.getElementById('commitMessage').value = '';
            await loadHistory();
            await loadBranches();
        }
    } catch (error) {
        console.error('Error creating commit:', error);
        showNotification(`Failed to create commit: ${error.message}`, 'error');
    }
}