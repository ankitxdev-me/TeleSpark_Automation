// TeleSpark Automation Studio &mdash; Client & Imperial Admin Controller
const API_BASE = '/api/v1';
let currentToken = localStorage.getItem('telespark_token');
let currentUser = JSON.parse(localStorage.getItem('telespark_user') || 'null');
let pendingPhone = null;
let pendingPhoneCodeHash = null;
let isSendingCode = false;
let isVerifyingCode = false;
let resendTimer = null;

// Wizard State
let wizardState = {
  step: 1,
  action: 'comment', // comment | dm | reaction | group | join
  selectedEmojis: ['👍', '❤️', '🔥'],
};

// Initialization
document.addEventListener('DOMContentLoaded', () => {
  renderPredefinedCommentsUI();
  if (currentToken && currentUser) {
    renderAuthenticatedUI();
    fetchUserProfile();
  } else {
    showAuthView();
  }
});

// Generic Fetch Wrapper
async function apiCall(endpoint, method = 'GET', body = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (currentToken) {
    headers['Authorization'] = `Bearer ${currentToken}`;
  }

  const res = await fetch(`${API_BASE}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : null,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const errorMsg = Array.isArray(data.message) ? data.message.join(', ') : data.message || 'Request failed';
    throw new Error(errorMsg);
  }
  return data;
}

// Authentication Helpers
function switchAuthTab(tab) {
  document.getElementById('tab-login').classList.toggle('active', tab === 'login');
  document.getElementById('tab-signup').classList.toggle('active', tab === 'signup');
  document.getElementById('form-login').style.display = tab === 'login' ? 'block' : 'none';
  document.getElementById('form-signup').style.display = tab === 'signup' ? 'block' : 'none';
}

async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;

  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || 'Login failed');
    }

    currentToken = data.accessToken;
    currentUser = data.user;
    localStorage.setItem('telespark_token', currentToken);
    localStorage.setItem('telespark_user', JSON.stringify(currentUser));

    showToast(`Welcome, ${currentUser.name || currentUser.email}!`, 'success');
    renderAuthenticatedUI();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function handleSignup(e) {
  e.preventDefault();
  const name = document.getElementById('signup-name').value;
  const email = document.getElementById('signup-email').value;
  const password = document.getElementById('signup-password').value;

  try {
    const res = await fetch(`${API_BASE}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || 'Registration failed');
    }

    showToast(data.message, 'success');
    switchAuthTab('login');
    document.getElementById('login-email').value = email;
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function fetchUserProfile() {
  try {
    const user = await apiCall('/auth/me');
    currentUser = user;
    renderAuthenticatedUI();
  } catch {
    logout();
  }
}

function logout() {
  currentToken = null;
  currentUser = null;
  localStorage.removeItem('telespark_token');
  localStorage.removeItem('telespark_user');
  showAuthView();
}

function showAuthView() {
  document.getElementById('auth-view').style.display = 'flex';
  document.getElementById('dashboard-view').style.display = 'none';
  document.getElementById('user-profile-pill').style.display = 'none';
}

function renderAuthenticatedUI() {
  document.getElementById('auth-view').style.display = 'none';
  document.getElementById('dashboard-view').style.display = 'flex';

  const userPill = document.getElementById('user-profile-pill');
  userPill.style.display = 'flex';
  document.getElementById('user-display-name').textContent = currentUser.name || currentUser.email;

  const roleBadge = document.getElementById('user-display-role');
  const isAdmin = currentUser.role === 'ADMIN';
  const isMaster = currentUser.email?.toLowerCase() === 'admin@telespark.io';
  const canManageUsers = isMaster || (isAdmin && currentUser.canManageUsers === true);

  if (isAdmin) {
    roleBadge.textContent = isMaster ? '👑 MASTER ADMIN' : '👑 ADMIN';
    roleBadge.className = 'role-badge admin';
    document.getElementById('brand-title').textContent = isMaster ? 'TeleSpark Studio — Imperial Master' : 'TeleSpark Studio — Admin Center';
    document.getElementById('sidebar-admin-block').style.display = 'block';
    document.getElementById('sidebar-admin-management').style.display = 'block';
    
    // Only display User Management tab if master admin or granted canManageUsers permission
    const navUsers = document.getElementById('nav-users');
    if (navUsers) navUsers.style.display = canManageUsers ? 'flex' : 'none';

    document.getElementById('user-portal-hero').style.display = 'none';
    switchNav('overview');
  } else {
    roleBadge.textContent = '🛡️ USER';
    roleBadge.className = 'role-badge user';
    document.getElementById('brand-title').textContent = 'TeleSpark Studio — Client Portal';
    document.getElementById('sidebar-admin-block').style.display = 'none';
    document.getElementById('sidebar-admin-management').style.display = 'none';
    document.getElementById('user-portal-hero').style.display = 'flex';
    switchNav('campaigns');
  }

  refreshAllData();
}

// Navigation Handler
function switchNav(section) {
  const sections = ['overview', 'campaigns', 'accounts', 'users', 'activity'];
  const isAdmin = currentUser && currentUser.role === 'ADMIN';
  const isMaster = currentUser && currentUser.email?.toLowerCase() === 'admin@telespark.io';
  const canManageUsers = isMaster || (isAdmin && currentUser?.canManageUsers === true);

  // Defensive Checks
  if ((section === 'accounts' || section === 'overview') && !isAdmin) {
    showToast('Defensive Guard: Administrator privileges required for this section.', 'error');
    switchNav('campaigns');
    return;
  }

  if (section === 'users' && !canManageUsers) {
    showToast('Defensive Guard: User Management permission required from Master Administrator.', 'error');
    switchNav(isAdmin ? 'overview' : 'campaigns');
    return;
  }

  sections.forEach((sec) => {
    const el = document.getElementById(`sec-${sec}`);
    const nav = document.getElementById(`nav-${sec}`);
    if (el) el.style.display = sec === section ? 'block' : 'none';
    if (nav) nav.classList.toggle('active', sec === section);
  });

  if (section === 'accounts' && isAdmin) loadAccounts();
  if (section === 'users' && isAdmin) loadUsers();
  if (section === 'activity') loadTasks();
}

// Data Refresh
async function refreshAllData() {
  if (currentUser?.role === 'ADMIN') {
    loadStats();
    loadAccounts();
    loadUsers();
  }
  loadTasks();
}

// 1. Overview Stats (Admin Only)
async function loadStats() {
  try {
    if (currentUser?.role === 'ADMIN') {
      const accounts = await apiCall('/accounts');
      const activeCount = accounts.filter((a) => a.status === 'ACTIVE').length;
      document.getElementById('stat-active-accounts').textContent = `${activeCount} / ${accounts.length}`;

      let totalHealth = 0;
      accounts.forEach((a) => (totalHealth += a.health?.healthScore || 100));
      const avg = accounts.length > 0 ? Math.round(totalHealth / accounts.length) : 100;
      document.getElementById('stat-avg-health').textContent = `${avg}%`;

      const users = await apiCall('/users');
      const pendingUsers = users.filter((u) => u.status === 'PENDING').length;
      document.getElementById('stat-pending-users').textContent = pendingUsers;
    }

    const tasksData = await apiCall('/tasks?limit=1');
    document.getElementById('stat-completed-tasks').textContent = tasksData.pagination?.total || 0;
  } catch (err) {
    console.error('Stats loading error:', err);
  }
}

// 2. Telegram Accounts (Admin Only)
async function loadAccounts() {
  const tbody = document.getElementById('accounts-table-body');
  try {
    const accounts = await apiCall('/accounts');
    if (!accounts || accounts.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">No accounts found. Click "Add Telegram Account" to onboard.</td></tr>';
      return;
    }

    tbody.innerHTML = accounts
      .map((acc) => {
        const health = acc.health?.healthScore ?? 100;
        const healthClass = health >= 80 ? 'health-good' : health >= 50 ? 'health-medium' : 'health-low';
        const isAct = acc.status === 'ACTIVE';

        return `
        <tr>
          <td><strong style="font-family: 'JetBrains Mono', monospace; color: #fbbf24;">${acc.phone}</strong></td>
          <td>${acc.username ? `@${acc.username}` : '<span style="color: var(--text-subtle);">None</span>'}</td>
          <td><span class="status-badge ${isAct ? 'active' : 'suspended'}">${acc.status}</span></td>
          <td>
            <div class="health-bar-container">
              <div class="health-bar ${healthClass}" style="width: ${health}%"></div>
            </div>
            <span>${health}%</span>
          </td>
          <td>
            <span style="font-size: 0.78rem; color: #94a3b8;">💬 Comment | 🔥 React | ✉️ DM</span>
          </td>
          <td>
            <div style="display: flex; gap: 0.4rem;">
              <button class="btn btn-secondary btn-sm" onclick="testAccount('${acc.id}')">Test</button>
              ${
                isAct
                  ? `<button class="btn btn-danger btn-sm" onclick="toggleAccount('${acc.id}', 'disable')">Disable</button>`
                  : `<button class="btn btn-success btn-sm" onclick="toggleAccount('${acc.id}', 'enable')">Enable</button>`
              }
            </div>
          </td>
        </tr>
      `;
      })
      .join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" style="color: var(--danger); text-align: center;">${err.message}</td></tr>`;
  }
}

async function testAccount(id) {
  try {
    showToast('Testing MTProto connection for account...', 'info');
    const res = await apiCall(`/accounts/${id}/test`, 'POST');
    if (res.connected) {
      showToast(`Account online: @${res.user?.username || res.user?.phone || 'Verified'}`, 'success');
    } else {
      showToast(`Account offline: ${res.error}`, 'error');
    }
    loadAccounts();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function toggleAccount(id, action) {
  try {
    await apiCall(`/accounts/${id}/${action}`, 'POST');
    showToast(`Account successfully ${action}d`, 'success');
    loadAccounts();
    loadStats();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// 3. User Authorization & Management (Admin Only)
async function loadUsers() {
  const tbody = document.getElementById('users-table-body');
  try {
    const users = await apiCall('/users');
    if (!users || users.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-muted);">No users registered yet.</td></tr>';
      return;
    }

    const isCurrentMaster = currentUser?.email?.toLowerCase() === 'admin@telespark.io';
    const canCurrentAdminGrant = isCurrentMaster || currentUser?.canManageUsers === true;

    tbody.innerHTML = users
      .map((u) => {
        const isMasterAdmin = u.email.toLowerCase() === 'admin@telespark.io';
        const isPending = u.status === 'PENDING';
        const isActive = u.status === 'ACTIVE';
        const isSuspended = u.status === 'SUSPENDED';
        const isAdmin = u.role === 'ADMIN';

        return `
        <tr>
          <td>
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <strong style="color: #f8fafc;">${u.email}</strong>
              ${isMasterAdmin ? '<span class="role-badge admin" style="font-size: 0.65rem;">MASTER</span>' : ''}
            </div>
          </td>
          <td>${u.name || '-'}</td>
          <td><span class="role-badge ${u.role.toLowerCase()}">${u.role}</span></td>
          <td><span class="status-badge ${u.status.toLowerCase()}">${u.status}</span></td>
          <td>
            ${
              isMasterAdmin
                ? '<span style="color: #fbbf24; font-size: 0.8rem; font-weight: 700;">👑 Master (All Perms)</span>'
                : isAdmin
                  ? `<label style="display: inline-flex; align-items: center; gap: 0.4rem; cursor: ${canCurrentAdminGrant ? 'pointer' : 'not-allowed'}; color: ${u.canManageUsers ? '#fbbf24' : '#94a3b8'};">
                       <input type="checkbox" ${u.canManageUsers ? 'checked' : ''} ${canCurrentAdminGrant ? '' : 'disabled'} onchange="toggleUserManagePerm('${u.id}', this.checked)">
                       <span style="font-size: 0.8rem; font-weight: 600;">${u.canManageUsers ? 'Manage Users' : 'No User Access'}</span>
                     </label>`
                  : '<span style="color: var(--text-subtle); font-size: 0.8rem;">— (Normal User)</span>'
            }
          </td>
          <td style="color: var(--text-muted); font-size: 0.8rem;">${new Date(u.createdAt).toLocaleDateString()}</td>
          <td>
            <div style="display: flex; gap: 0.4rem; flex-wrap: wrap; align-items: center;">
              ${
                isMasterAdmin
                  ? '<span style="color: #fbbf24; font-size: 0.8rem; font-weight: 600;">👑 Protected</span>'
                  : `
                    ${
                      isPending
                        ? `<button class="btn btn-success btn-sm" onclick="updateUserStatus('${u.id}', 'ACTIVE')">✅ Approve</button>`
                        : isActive
                          ? `<button class="btn btn-danger btn-sm" onclick="updateUserStatus('${u.id}', 'SUSPENDED')">⛔ Suspend</button>`
                          : `<button class="btn btn-success btn-sm" onclick="updateUserStatus('${u.id}', 'ACTIVE')">🔓 Unsuspend</button>`
                    }
                    ${
                      isAdmin
                        ? `<button class="btn btn-secondary btn-sm" onclick="updateUserRole('${u.id}', 'USER')">Demote to User</button>`
                        : `<button class="btn btn-outline-gold btn-sm" onclick="updateUserRole('${u.id}', 'ADMIN')">👑 Promote Admin</button>`
                    }
                    <button class="btn btn-danger btn-sm" onclick="deleteUserAccount('${u.id}', '${u.email}')" title="Permanently delete user from platform database">🗑️ Delete</button>
                  `
              }
            </div>
          </td>
        </tr>
      `;
      })
      .join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" style="color: var(--danger); text-align: center;">${err.message}</td></tr>`;
  }
}

async function deleteUserAccount(userId, email) {
  if (!confirm(`Are you sure you want to permanently delete user "${email}" and all associated data from the platform database? This action cannot be undone.`)) {
    return;
  }
  try {
    await apiCall(`/users/${userId}`, 'DELETE');
    showToast(`User ${email} permanently deleted from database`, 'success');
    loadUsers();
    loadStats();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function toggleUserManagePerm(userId, canManageUsers) {
  try {
    await apiCall(`/users/${userId}/permissions`, 'PATCH', { canManageUsers });
    showToast(`User Management permission ${canManageUsers ? 'GRANTED' : 'REVOKED'}!`, 'success');
    loadUsers();
  } catch (err) {
    showToast(err.message, 'error');
    loadUsers();
  }
}

async function updateUserStatus(userId, status) {
  try {
    const actionLabel = status === 'SUSPENDED' ? 'suspended' : status === 'ACTIVE' ? 'activated / unsuspended' : 'updated';
    await apiCall(`/users/${userId}/status`, 'PATCH', { status });
    showToast(`User successfully ${actionLabel}!`, 'success');
    loadUsers();
    loadStats();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function updateUserRole(userId, role) {
  try {
    await apiCall(`/users/${userId}/role`, 'PATCH', { role });
    showToast(`User role updated to ${role}`, 'success');
    loadUsers();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Background Live Sync: Poll profile every 15s to react to live promotions or suspensions
setInterval(async () => {
  if (currentToken) {
    try {
      const user = await apiCall('/auth/me');
      if (
        currentUser &&
        (user.role !== currentUser.role || user.canManageUsers !== currentUser.canManageUsers)
      ) {
        currentUser = user;
        localStorage.setItem('telespark_user', JSON.stringify(currentUser));
        showToast(
          `Permissions updated: Role: ${user.role} | Manage Users: ${user.canManageUsers ? 'GRANTED' : 'RESTRICTED'}`,
          'success',
        );
        renderAuthenticatedUI();
      }
    } catch (err) {
      if (err.message && err.message.toLowerCase().includes('suspend')) {
        showToast('Session revoked: ' + err.message, 'error');
        logout();
      }
    }
  }
}, 15000);

// 4. Unified Live Campaign Feed
async function loadTasks() {
  const tbody = document.getElementById('tasks-table-body');
  try {
    const jobs = await apiCall('/jobs?limit=30');

    if (!jobs || jobs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-muted);">No campaign dispatches logged yet. Launch a campaign from "Send Campaigns" to see live execution.</td></tr>';
      return;
    }

    const typeIcons = {
      COMMENT_CAMPAIGN: '💬 Comments',
      REACTION_CAMPAIGN: '🔥 Reactions',
      DM_CAMPAIGN: '✉️ Direct Messages',
      GROUP_MSG_CAMPAIGN: '📢 Group Broadcast',
      JOIN_CAMPAIGN: '👥 Channel Join',
      LEAVE_CAMPAIGN: '🚪 Channel Leave',
    };

    tbody.innerHTML = jobs
      .map((j) => {
        // Resolve status styling
        let statusBadge = '';
        if (j.status === 'COMPLETED') {
          statusBadge = '<span class="status-badge active">COMPLETED</span>';
        } else if (j.status === 'PARTIALLY_COMPLETED') {
          statusBadge = '<span class="status-badge" style="background: rgba(245, 158, 11, 0.18); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.35);">PARTIALLY COMPLETED</span>';
        } else if (j.status === 'FAILED') {
          statusBadge = '<span class="status-badge suspended">FAILED</span>';
        } else if (j.status === 'RUNNING' || j.status === 'QUEUED') {
          statusBadge = '<span class="status-badge pending">IN PROGRESS</span>';
        } else {
          statusBadge = `<span class="status-badge pending">${j.status}</span>`;
        }

        // Progress text
        let progressHtml = '';
        if (j.status === 'COMPLETED') {
          progressHtml = `<span style="color: #34d399; font-weight: 600;">✅ ${j.completedTasks} / ${j.totalTasks} Successful (100%)</span>`;
        } else if (j.status === 'PARTIALLY_COMPLETED') {
          progressHtml = `<span style="color: #fbbf24; font-weight: 600;">⚠️ ${j.completedTasks} Done, ${j.failedTasks} Failed (Total ${j.totalTasks})</span>`;
        } else if (j.status === 'FAILED') {
          progressHtml = `<span style="color: #f87171; font-weight: 600;">❌ 0 / ${j.totalTasks} Completed (${j.failedTasks} Failed)</span>`;
        } else {
          progressHtml = `<span style="color: #60a5fa; font-weight: 500;">⏳ ${j.completedTasks} / ${j.totalTasks} In Progress...</span>`;
        }

        // Operator
        const operator = j.metadata?.createdBy || currentUser?.email || 'Operator';

        // Target / Destination
        const target = j.metadata?.postUrl || j.metadata?.target || (j.metadata?.targetChat ? `${j.metadata?.targetChat}/${j.metadata?.targetMsgId || ''}` : null) || 'Multiple Targets';

        const typeLabel = typeIcons[j.type] || j.type;

        return `
        <tr>
          <td><code style="font-family: 'JetBrains Mono', monospace; font-size: 0.78rem; color: #a5b4fc;">${j.id.slice(0, 8)}...</code></td>
          <td><strong>${typeLabel} (${j.totalTasks})</strong></td>
          <td><span style="font-size: 0.82rem; color: #e2e8f0;">${operator}</span></td>
          <td><code style="font-family: 'JetBrains Mono', monospace; font-size: 0.76rem; color: #94a3b8; max-width: 180px; display: inline-block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${target}</code></td>
          <td>${progressHtml}</td>
          <td>${statusBadge}</td>
          <td style="color: var(--text-muted); font-size: 0.8rem;">${new Date(j.createdAt).toLocaleTimeString()}</td>
        </tr>
      `;
      })
      .join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" style="color: var(--danger); text-align: center;">${err.message}</td></tr>`;
  }
}

// ==========================================================================
// 5. STEP-BY-STEP CAMPAIGN WIZARD LOGIC ("Question-like UI")
// ==========================================================================

function startWizardWithAction(action) {
  switchNav('campaigns');
  selectCampaignTab(action);
}

function wizardSelectAction(action) {
  wizardState.action = action;
  
  // Highlight card
  const cards = ['comment', 'dm', 'reaction', 'group', 'join'];
  cards.forEach((c) => {
    const el = document.getElementById(`card-action-${c}`);
    if (el) el.classList.toggle('selected', c === action);
  });

  // Setup Step 2 labels & inputs dynamically
  const label = document.getElementById('label-wizard-target');
  const input = document.getElementById('wizard-input-target');
  const help = document.getElementById('help-wizard-target');
  const sub = document.getElementById('wizard-step-2-subtitle');
  const singleGroup = document.getElementById('group-wizard-target-single');
  const recipGroup = document.getElementById('group-wizard-target-recipients');

  if (action === 'comment') {
    sub.textContent = 'Enter the target Telegram post URL where comments will be posted.';
    label.textContent = 'Telegram Post URL';
    input.placeholder = 'https://t.me/ForPayoutRecords/743';
    help.innerHTML = 'Direct link to the post: <code>https://t.me/channel_name/post_id</code>';
    singleGroup.style.display = 'block';
    recipGroup.style.display = 'none';
  } else if (action === 'dm') {
    sub.textContent = 'Enter the target Telegram user recipients for direct messaging.';
    singleGroup.style.display = 'none';
    recipGroup.style.display = 'block';
  } else if (action === 'reaction') {
    sub.textContent = 'Enter the target Telegram post URL to rotate emoji reactions on.';
    label.textContent = 'Target Post URL';
    input.placeholder = 'https://t.me/ForPayoutRecords/743';
    help.innerHTML = 'Direct link to the post: <code>https://t.me/channel_name/post_id</code>';
    singleGroup.style.display = 'block';
    recipGroup.style.display = 'none';
  } else if (action === 'group') {
    sub.textContent = 'Enter the target Telegram group link or username for line-by-line messages.';
    label.textContent = 'Target Group Link or Username';
    input.placeholder = 'https://t.me/+2YCMvYKjW1wzNjM1 or @group_username';
    help.innerHTML = 'Public link, invite link (<code>https://t.me/+hash</code>), or <code>@group_name</code>';
    singleGroup.style.display = 'block';
    recipGroup.style.display = 'none';
  } else if (action === 'join') {
    sub.textContent = 'Enter the Telegram channel or group link to join or leave.';
    label.textContent = 'Target Channel or Group Link';
    input.placeholder = 'https://t.me/+2YCMvYKjW1wzNjM1 or @channel_username';
    help.innerHTML = 'Public link, private invite link, or <code>@username</code>';
    singleGroup.style.display = 'block';
    recipGroup.style.display = 'none';
  }

  // Setup Step 3 options visibility
  ['comment', 'dm', 'reaction', 'group', 'join'].forEach((opt) => {
    const el = document.getElementById(`wizard-options-${opt}`);
    if (el) el.style.display = opt === action ? 'block' : 'none';
  });
}

function toggleWizardCommentRandom() {
  const isChecked = document.getElementById('wizard-comment-random').checked;
  const textarea = document.getElementById('wizard-comment-messages');
  textarea.disabled = isChecked;
  textarea.placeholder = isChecked
    ? '[Predefined Random Pool Active: "hello", "hi", "done", "task done", etc.]'
    : 'hello\nfirst comment\nsecond comment\nthird comment';
}

function toggleWizardEmoji(chipEl, emoji) {
  chipEl.classList.toggle('selected');
  const index = wizardState.selectedEmojis.indexOf(emoji);
  if (index > -1) {
    wizardState.selectedEmojis.splice(index, 1);
  } else {
    wizardState.selectedEmojis.push(emoji);
  }
}

function wizardNextStep() {
  if (wizardState.step === 1) {
    // Action selected
    wizardSetStep(2);
  } else if (wizardState.step === 2) {
    // Validate target
    if (wizardState.action === 'dm') {
      const recip = document.getElementById('wizard-input-recipients').value.trim();
      if (!recip) {
        showToast('Please enter at least one recipient username or link', 'error');
        return;
      }
    } else {
      const target = document.getElementById('wizard-input-target').value.trim();
      if (!target) {
        showToast('Please enter the target URL or username', 'error');
        return;
      }
    }
    wizardSetStep(3);
  } else if (wizardState.step === 3) {
    // Validate options
    if (wizardState.action === 'reaction' && wizardState.selectedEmojis.length === 0) {
      showToast('Please select at least one emoji to rotate', 'error');
      return;
    }
    if (wizardState.action === 'dm') {
      const msg = document.getElementById('wizard-dm-message').value.trim();
      if (!msg) {
        showToast('Please enter the direct message text', 'error');
        return;
      }
    }
    if (wizardState.action === 'group') {
      const msgs = document.getElementById('wizard-group-messages').value.trim();
      if (!msgs) {
        showToast('Please enter messages to send', 'error');
        return;
      }
    }
    updateWizardReview();
    wizardSetStep(4);
  } else if (wizardState.step === 4) {
    // Execute campaign dispatch!
    executeWizardCampaign();
  }
}

function wizardPrevStep() {
  if (wizardState.step > 1) {
    wizardSetStep(wizardState.step - 1);
  }
}

function wizardSetStep(step) {
  wizardState.step = step;

  // Toggle step question boxes
  for (let i = 1; i <= 4; i++) {
    const box = document.getElementById(`wizard-step-${i}`);
    if (box) box.style.display = i === step ? 'block' : 'none';

    const node = document.getElementById(`step-node-${i}`);
    if (node) {
      node.classList.toggle('active', i === step);
      node.classList.toggle('completed', i < step);
    }
  }

  // Update progress bar
  const progressPercent = ((step - 1) / 3) * 100;
  document.getElementById('stepper-progress-bar').style.width = `${progressPercent}%`;

  // Update buttons
  const prevBtn = document.getElementById('btn-wizard-prev');
  const nextBtn = document.getElementById('btn-wizard-next');

  prevBtn.style.visibility = step > 1 ? 'visible' : 'hidden';

  if (step === 4) {
    nextBtn.className = 'btn btn-gold btn-lg';
    nextBtn.innerHTML = '🧪 Launch Trial Campaign';
  } else {
    nextBtn.className = 'btn btn-gold';
    nextBtn.innerHTML = 'Continue →';
  }
}

function updateWizardReview() {
  const actionNames = {
    comment: 'Post Comments',
    dm: 'Message Every User (DMs)',
    reaction: 'Post Emoji Reactions',
    group: 'Group Messages',
    join: 'Community Join / Leave',
  };

  document.getElementById('review-type').textContent = actionNames[wizardState.action];

  if (wizardState.action === 'dm') {
    const recips = document.getElementById('wizard-input-recipients').value.split(/[\n,]/).filter(Boolean);
    document.getElementById('review-target').textContent = `${recips.length} Recipient(s)`;
    document.getElementById('review-strategy').textContent = 'Sender Account Rotation';
    const delay = document.getElementById('wizard-dm-delay').value;
    document.getElementById('review-volume').textContent = `${recips.length} Messages (${delay}s delay)`;
  } else if (wizardState.action === 'comment') {
    const target = document.getElementById('wizard-input-target').value.trim();
    const mode = document.getElementById('wizard-comment-mode').value;
    const count = document.getElementById('wizard-comment-count').value;
    const delay = document.getElementById('wizard-comment-delay').value;
    const isRandom = document.getElementById('wizard-comment-random').checked;

    document.getElementById('review-target').textContent = target;
    document.getElementById('review-strategy').textContent = mode === 'MULTIPLE_ACCOUNTS' ? 'Alternating Accounts (Acc 1 ➔ Acc 2)' : 'Single Account';
    document.getElementById('review-volume').textContent = `${count} Comments (${delay}s delay, ${isRandom ? 'Random Pool' : 'Custom Lines'})`;
  } else if (wizardState.action === 'reaction') {
    const target = document.getElementById('wizard-input-target').value.trim();
    const count = document.getElementById('wizard-reaction-count').value;
    const delay = document.getElementById('wizard-reaction-delay').value;

    document.getElementById('review-target').textContent = target;
    document.getElementById('review-strategy').textContent = `Round-Robin Emojis: ${wizardState.selectedEmojis.join(' ')}`;
    document.getElementById('review-volume').textContent = `${count} Reactions (${delay}s delay)`;
  } else if (wizardState.action === 'group') {
    const target = document.getElementById('wizard-input-target').value.trim();
    const msgs = document.getElementById('wizard-group-messages').value.split('\n').filter(Boolean);
    const delay = document.getElementById('wizard-group-delay').value;

    document.getElementById('review-target').textContent = target;
    document.getElementById('review-strategy').textContent = 'Sequential Account Messaging';
    document.getElementById('review-volume').textContent = `${msgs.length} Line(s) (${delay}s delay)`;
  } else if (wizardState.action === 'join') {
    const target = document.getElementById('wizard-input-target').value.trim();
    const act = document.getElementById('wizard-join-action').value;
    const count = document.getElementById('wizard-join-count').value;
    const delay = document.getElementById('wizard-join-delay').value;

    document.getElementById('review-target').textContent = target;
    document.getElementById('review-strategy').textContent = `${act.toUpperCase()} Operation`;
    document.getElementById('review-volume').textContent = `${count} Account(s) (${delay}s delay)`;
  }
}

async function executeWizardCampaign() {
  try {
    showToast('Starting trial campaign tasks with MTProto worker pool...', 'info');

    if (wizardState.action === 'comment') {
      const postUrl = document.getElementById('wizard-input-target').value.trim();
      const mode = document.getElementById('wizard-comment-mode').value;
      const count = parseInt(document.getElementById('wizard-comment-count').value, 10);
      const isRandom = document.getElementById('wizard-comment-random').checked;
      const delay = parseInt(document.getElementById('wizard-comment-delay').value, 10);

      const payload = {
        postUrl,
        mode,
        count,
        useRandomMessages: isRandom,
        intervalSeconds: delay,
        delaySeconds: delay,
      };

      if (!isRandom) {
        const raw = document.getElementById('wizard-comment-messages').value;
        payload.messages = raw.split('\n').map((s) => s.trim()).filter(Boolean);
      }

      const res = await apiCall('/jobs/comments', 'POST', payload);
      showToast(`Trial campaign scheduled! Job ID: ${res.jobId.slice(0, 8)} (${res.totalTasks} comments queued)`, 'success');
    } else if (wizardState.action === 'dm') {
      const rawRecips = document.getElementById('wizard-input-recipients').value;
      const recipients = rawRecips.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
      const message = document.getElementById('wizard-dm-message').value.trim();
      const delay = parseInt(document.getElementById('wizard-dm-delay').value, 10);

      const payload = {
        mode: 'BULK_USERS',
        recipients,
        users: recipients,
        message,
        intervalSeconds: delay,
        delaySeconds: delay,
      };

      const res = await apiCall('/jobs/dms', 'POST', payload);
      showToast(`Trial DM Campaign scheduled! ${res.totalTasks} users queued.`, 'success');
    } else if (wizardState.action === 'reaction') {
      const postUrl = document.getElementById('wizard-input-target').value.trim();
      const count = parseInt(document.getElementById('wizard-reaction-count').value, 10);
      const delay = parseInt(document.getElementById('wizard-reaction-delay').value, 10);

      const payload = {
        postUrl,
        reactions: wizardState.selectedEmojis,
        count,
        intervalSeconds: delay,
        delaySeconds: delay,
      };

      const res = await apiCall('/jobs/reactions', 'POST', payload);
      showToast(`Trial Reaction Campaign scheduled! (${res.totalTasks} accounts reacting)`, 'success');
    } else if (wizardState.action === 'group') {
      const target = document.getElementById('wizard-input-target').value.trim();
      const raw = document.getElementById('wizard-group-messages').value;
      const messages = raw.split('\n').map((s) => s.trim()).filter(Boolean);
      const delay = parseInt(document.getElementById('wizard-group-delay').value, 10);

      const payload = {
        mode: 'SINGLE_GROUP',
        target,
        groups: [target],
        targetChats: [target],
        messages,
        intervalSeconds: delay,
        delaySeconds: delay,
      };

      const res = await apiCall('/jobs/group-messages', 'POST', payload);
      showToast(`Trial Group Campaign scheduled! Job ID: ${res.jobId.slice(0, 8)}`, 'success');
    } else if (wizardState.action === 'join') {
      const action = document.getElementById('wizard-join-action').value;
      const target = document.getElementById('wizard-input-target').value.trim();
      const count = parseInt(document.getElementById('wizard-join-count').value, 10);
      const delay = parseInt(document.getElementById('wizard-join-delay').value, 10);

      const payload = {
        target,
        count,
        accountLimit: count,
        intervalSeconds: delay,
        delaySeconds: delay,
      };

      const endpoint = action === 'join' ? '/jobs/join' : '/jobs/leave';
      const res = await apiCall(endpoint, 'POST', payload);
      showToast(`Trial community operation scheduled! (${res.dispatchedCount || res.totalTasks} accounts queued)`, 'success');
    }

    // Reset wizard and redirect to live activity feed
    wizardSetStep(1);
    switchNav('activity');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ==========================================================================
// 6. CLASSIC BATCH CAMPAIGN DISPATCHERS (For Power Users)
// ==========================================================================

function selectCampaignTab(tab) {
  const tabs = ['comment', 'dm', 'reaction', 'group', 'join'];
  tabs.forEach((t) => {
    document.getElementById(`form-campaign-${t}`).style.display = t === tab ? 'block' : 'none';
    const btn = document.getElementById(`btn-tab-${t}`);
    if (btn) btn.className = t === tab ? 'btn btn-gold btn-sm' : 'btn btn-secondary btn-sm';
  });
}

// ==========================================================================
// 6. PREDEFINED COMMENTS & VARIABLE DELAY MANAGEMENT
// ==========================================================================

const DEFAULT_PREDEFINED_COMMENTS = [
  'Legit project',
  'Nice',
  'Wonderful',
  'Where is the t-g',
  'Nice name 😅',
  'ok',
  'Thank you',
  'Alright',
  'Great',
  'Has anyone getting airdrop successfully??',
  'Good evening',
  'Hello',
  'Is it real?',
  'G',
  'Good luck everyone',
  'Wishing good future',
  'Keep shining',
  'Okay thanks 🙏',
  'Love the project',
  'How did it work',
  '🙏',
  'Productivity growth',
  'This is a very elevating growth',
  'LFG',
  'Happy for everyone',
  'Great efforts',
  'Okay thanks',
  'Alright',
  'Is it new project?',
  'Riskyyyy',
  'Good',
  'To the moon 🚀',
  'Solid team and vision',
  'Excited for this journey!',
  'When next update?',
  'Bullish on this one 🔥',
  'Great community vibes',
  'Keep building guys',
  'Very promising roadmap',
  'Joined and ready',
  'Huge potential here',
  'Amazing work guys',
  'Let\'s go team!',
  'Any announcements today?',
  'Best project of the week',
  'Always supporting this 🙌',
  'Super clean and fast',
  'Let\'s see how it goes',
  'Looking forward to the rewards',
  'Big things ahead',
  'Check this out guys!',
  'Happy to be part of this',
  'Impressive progress',
  'Can\'t wait for next phase',
  'Keep it up!',
  'Count me in 🤝',
  'Very nice development',
  'Let\'s grow together',
  'Everything looks smooth',
  'Top tier community',
];

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getPredefinedComments() {
  try {
    const saved = localStorage.getItem('telespark_predefined_comments');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {}
  return [...DEFAULT_PREDEFINED_COMMENTS];
}

function savePredefinedComments() {
  const editor = document.getElementById('predefined-comments-editor');
  if (!editor) return;
  const lines = editor.value.split('\n').map((s) => s.trim()).filter(Boolean);
  if (lines.length === 0) {
    showToast('Cannot save empty comment list', 'error');
    return;
  }
  localStorage.setItem('telespark_predefined_comments', JSON.stringify(lines));
  renderPredefinedCommentsUI();
  toggleEditPredefinedComments(false);
  showToast(`Saved ${lines.length} predefined comments successfully!`, 'success');
}

function resetPredefinedComments() {
  if (confirm('Reset predefined comments back to default 60 community comments?')) {
    localStorage.removeItem('telespark_predefined_comments');
    renderPredefinedCommentsUI();
    toggleEditPredefinedComments(false);
    showToast('Predefined comments reset to default (60 comments)', 'info');
  }
}

function toggleEditPredefinedComments(forceState) {
  const container = document.getElementById('predefined-edit-container');
  const btn = document.getElementById('btn-edit-predefined');
  if (!container) return;
  const isHidden = container.style.display === 'none';
  const show = forceState !== undefined ? forceState : isHidden;
  container.style.display = show ? 'block' : 'none';
  if (btn) btn.textContent = show ? '✕ Close Editor' : '✏️ Edit Predefined Comments';
  if (show) {
    const comments = getPredefinedComments();
    const editor = document.getElementById('predefined-comments-editor');
    if (editor) {
      editor.value = comments.join('\n');
      updateEditorLineCount();
      editor.focus();
    }
  }
}

function updateEditorLineCount() {
  const editor = document.getElementById('predefined-comments-editor');
  const countSpan = document.getElementById('editor-line-count');
  if (!editor || !countSpan) return;
  const lines = editor.value.split('\n').map((s) => s.trim()).filter(Boolean);
  countSpan.textContent = `${lines.length} comment${lines.length === 1 ? '' : 's'}`;
}

function renderPredefinedCommentsUI() {
  const comments = getPredefinedComments();
  const badge = document.getElementById('predefined-count-badge');
  const preview = document.getElementById('predefined-preview-box');
  if (badge) badge.textContent = `${comments.length} Comments`;
  if (preview) {
    preview.innerHTML = comments
      .slice(0, 15)
      .map((c) => `<span style="display: inline-block; background: rgba(255,255,255,0.08); border-radius: 4px; padding: 2px 7px; margin: 2px; font-size: 0.8rem; border: 1px solid rgba(255,255,255,0.12); color: #e2e8f0;">${escapeHtml(c)}</span>`)
      .join(' ') + (comments.length > 15 ? ` <span style="color: #fbbf24; font-size: 0.8rem; font-weight: 500;">+${comments.length - 15} more...</span>` : '');
  }
}

function toggleCommentModeSelection() {
  const usePredefined = document.getElementById('comment-use-random').checked;
  const customContainer = document.getElementById('comment-custom-container');
  const indicator = document.getElementById('comment-pool-indicator');
  if (customContainer) customContainer.style.display = usePredefined ? 'none' : 'block';
  if (indicator) {
    indicator.textContent = usePredefined ? '✓ Randomly picks from active predefined pool' : '⚠️ Custom messages will be used for this campaign';
    indicator.style.color = usePredefined ? '#10b981' : '#fbbf24';
  }
}

function onDelayModeChange(prefix) {
  const modeSelect = document.getElementById(`${prefix}-delay-mode`);
  if (!modeSelect) return;
  const mode = modeSelect.value;
  const fixedBox = document.getElementById(`${prefix}-delay-fixed-box`);
  const randomBox = document.getElementById(`${prefix}-delay-random-box`);
  const customBox = document.getElementById(`${prefix}-delay-custom-box`);

  if (fixedBox) fixedBox.style.display = mode === 'fixed' ? 'block' : 'none';
  if (randomBox) randomBox.style.display = mode === 'random' ? 'block' : 'none';
  if (customBox) customBox.style.display = mode === 'custom' ? 'block' : 'none';
}

function extractDelayPayload(prefix, defaultInterval = 3) {
  const modeSelect = document.getElementById(`${prefix}-delay-mode`);
  const mode = modeSelect ? modeSelect.value : 'random';

  if (mode === 'random') {
    const minInput = document.getElementById(`${prefix}-delay-min`);
    const maxInput = document.getElementById(`${prefix}-delay-max`);
    const min = minInput ? Math.max(0, parseInt(minInput.value, 10) || 10) : 10;
    const max = maxInput ? Math.max(min, parseInt(maxInput.value, 10) || 50) : 50;
    return {
      delayMode: 'random',
      minDelaySeconds: min,
      maxDelaySeconds: max,
      intervalSeconds: min,
      delaySeconds: min,
    };
  } else if (mode === 'custom') {
    const customInput = document.getElementById(`${prefix}-delay-custom`);
    const raw = customInput ? customInput.value : '10, 50, 20, 15';
    const delays = raw
      .split(/[, ]+/)
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n) && n >= 0);
    const validDelays = delays.length > 0 ? delays : [10, 50, 20, 15];
    return {
      delayMode: 'custom',
      customDelays: validDelays,
      intervalSeconds: validDelays[0],
      delaySeconds: validDelays[0],
    };
  } else {
    const intervalInput = document.getElementById(`${prefix}-interval`);
    const interval = intervalInput ? Math.max(0, parseInt(intervalInput.value, 10) || defaultInterval) : defaultInterval;
    return {
      delayMode: 'fixed',
      intervalSeconds: interval,
      delaySeconds: interval,
    };
  }
}

function formatDelayFeedback(delayPayload) {
  if (delayPayload.delayMode === 'random') {
    return `random delay between ${delayPayload.minDelaySeconds}s and ${delayPayload.maxDelaySeconds}s per task`;
  } else if (delayPayload.delayMode === 'custom') {
    return `custom delays [${delayPayload.customDelays.join(', ')}s]`;
  }
  return `${delayPayload.intervalSeconds}s fixed interval`;
}

async function dispatchCommentCampaign(e) {
  e.preventDefault();
  const postUrl = document.getElementById('comment-post-url').value.trim();
  const mode = document.getElementById('comment-mode').value;
  const count = parseInt(document.getElementById('comment-count').value, 10);
  const useRandom = document.getElementById('comment-use-random').checked;

  const delayPayload = extractDelayPayload('comment', 3);

  const payload = {
    postUrl,
    mode,
    count,
    useRandomMessages: useRandom,
    ...delayPayload,
  };

  if (useRandom) {
    // Send the active custom/predefined pool
    payload.messages = getPredefinedComments();
  } else {
    const rawMessages = document.getElementById('comment-messages').value;
    const comments = rawMessages.split('\n').map((s) => s.trim()).filter(Boolean);
    if (comments.length > 0) {
      payload.messages = comments;
    }
  }

  try {
    showToast('Dispatching comment campaign to BullMQ queue...', 'info');
    const res = await apiCall('/jobs/comments', 'POST', payload);
    const feedback = formatDelayFeedback(delayPayload);
    showToast(`Campaign initiated! Job ID: ${res.jobId.slice(0, 8)} (${res.totalTasks} comments queued with ${feedback})`, 'success');
    switchNav('activity');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function dispatchDmCampaign(e) {
  e.preventDefault();
  const rawRecipients = document.getElementById('dm-recipients').value;
  const recipients = rawRecipients.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
  const message = document.getElementById('dm-message').value.trim();
  const delayPayload = extractDelayPayload('dm', 3);

  const payload = {
    mode: 'BULK_USERS',
    recipients,
    users: recipients,
    message,
    ...delayPayload,
  };

  try {
    showToast('Dispatching "Message Every User" campaign...', 'info');
    const res = await apiCall('/jobs/dms', 'POST', payload);
    const feedback = formatDelayFeedback(delayPayload);
    showToast(`DM Campaign scheduled! ${res.totalTasks} users queued with ${feedback}.`, 'success');
    switchNav('activity');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function dispatchReactionCampaign(e) {
  e.preventDefault();
  const postUrl = document.getElementById('reaction-post-url').value.trim();
  const count = parseInt(document.getElementById('reaction-count').value, 10);
  const delayPayload = extractDelayPayload('reaction', 2);

  const checked = document.querySelectorAll('input[name="emoji-choice"]:checked');
  const emojis = Array.from(checked).map((cb) => cb.value);

  if (emojis.length === 0) {
    showToast('Please select at least one emoji', 'error');
    return;
  }

  const payload = {
    postUrl,
    reactions: emojis,
    count,
    ...delayPayload,
  };

  try {
    showToast('Dispatching reaction campaign...', 'info');
    const res = await apiCall('/jobs/reactions', 'POST', payload);
    const feedback = formatDelayFeedback(delayPayload);
    showToast(`Reactions scheduled! ${res.totalTasks} accounts reacting with ${feedback}.`, 'success');
    switchNav('activity');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function dispatchGroupCampaign(e) {
  e.preventDefault();
  const target = document.getElementById('group-target').value.trim();
  const raw = document.getElementById('group-messages').value;
  const messages = raw.split('\n').map((s) => s.trim()).filter(Boolean);
  const delayPayload = extractDelayPayload('group', 3);

  const payload = {
    mode: 'SINGLE_GROUP',
    target,
    groups: [target],
    targetChats: [target],
    messages,
    ...delayPayload,
  };

  try {
    showToast('Dispatching group campaign...', 'info');
    const res = await apiCall('/jobs/group-messages', 'POST', payload);
    const feedback = formatDelayFeedback(delayPayload);
    showToast(`Group messages scheduled! Job ID: ${res.jobId.slice(0, 8)} (${feedback})`, 'success');
    switchNav('activity');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function dispatchJoinCampaign(e) {
  e.preventDefault();
  const action = document.getElementById('join-action').value;
  const target = document.getElementById('join-target').value.trim();
  const count = parseInt(document.getElementById('join-count').value, 10);
  const delayPayload = extractDelayPayload('join', 5);

  const payload = {
    target,
    count,
    accountLimit: count,
    ...delayPayload,
  };

  const endpoint = action === 'join' ? '/jobs/join' : '/jobs/leave';

  try {
    showToast(`Dispatching community ${action} campaign...`, 'info');
    const res = await apiCall(endpoint, 'POST', payload);
    const feedback = formatDelayFeedback(delayPayload);
    showToast(`Community operation scheduled! (${res.dispatchedCount || res.totalTasks} accounts with ${feedback})`, 'success');
    switchNav('activity');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ==========================================================================
// 7. INTERACTIVE MODAL: ADD TELEGRAM ACCOUNT
// ==========================================================================

function openAddAccountModal() {
  pendingPhone = '';
  pendingPhoneCodeHash = '';
  isSendingCode = false;
  isVerifyingCode = false;
  if (resendTimer) clearInterval(resendTimer);

  document.getElementById('modal-add-account').classList.add('active');
  document.getElementById('account-step-1').style.display = 'block';
  document.getElementById('account-step-2').style.display = 'none';
  document.getElementById('modal-phone').value = '';

  const sendBtn = document.getElementById('btn-modal-send-code');
  if (sendBtn) {
    sendBtn.disabled = false;
    sendBtn.innerHTML = '<span>Send Verification Code</span>';
    sendBtn.style.opacity = '1';
    sendBtn.style.cursor = 'pointer';
  }
}

function closeAddAccountModal() {
  if (resendTimer) clearInterval(resendTimer);
  document.getElementById('modal-add-account').classList.remove('active');
}

function startResendCountdown(seconds = 45) {
  if (resendTimer) clearInterval(resendTimer);
  const resendBtn = document.getElementById('btn-modal-resend-code');
  const countdownSpan = document.getElementById('resend-countdown');
  if (!resendBtn) return;

  let remaining = seconds;
  resendBtn.disabled = true;
  resendBtn.style.opacity = '0.5';
  resendBtn.style.cursor = 'not-allowed';
  if (countdownSpan) countdownSpan.textContent = remaining;

  resendTimer = setInterval(() => {
    remaining--;
    if (countdownSpan) countdownSpan.textContent = remaining;
    if (remaining <= 0) {
      clearInterval(resendTimer);
      resendBtn.disabled = false;
      resendBtn.style.opacity = '1';
      resendBtn.style.cursor = 'pointer';
      resendBtn.innerHTML = 'Resend Verification Code';
    }
  }, 1000);
}

async function resendVerificationCode() {
  if (!pendingPhone || isSendingCode) return;
  const resendBtn = document.getElementById('btn-modal-resend-code');
  if (resendBtn) {
    resendBtn.disabled = true;
    resendBtn.textContent = 'Requesting new code...';
  }
  await submitSendCode(pendingPhone);
}

async function submitSendCode(overridePhone) {
  if (isSendingCode) return; // Prevent double/triple click

  const phoneInput = document.getElementById('modal-phone');
  const phone = (overridePhone || (phoneInput ? phoneInput.value : '')).trim();
  if (!phone) {
    showToast('Please enter a phone number', 'error');
    return;
  }

  const sendBtn = document.getElementById('btn-modal-send-code');
  isSendingCode = true;
  if (sendBtn) {
    sendBtn.disabled = true;
    sendBtn.innerHTML = '<span style="display:inline-block; animation: spin 1s linear infinite;">⏳</span> Connecting to Telegram...';
    sendBtn.style.opacity = '0.7';
    sendBtn.style.cursor = 'not-allowed';
  }

  try {
    showToast('Contacting Telegram MTProto gateway (please wait)...', 'info');
    const res = await apiCall('/accounts/send-code', 'POST', { phone });
    pendingPhone = phone;
    pendingPhoneCodeHash = res.phoneCodeHash || '';

    showToast(`Verification code sent to ${phone}!`, 'success');
    document.getElementById('account-step-1').style.display = 'none';
    document.getElementById('account-step-2').style.display = 'block';
    document.getElementById('modal-code').value = '';
    startResendCountdown(45);
  } catch (err) {
    showToast(err.message || 'Failed to dispatch verification code', 'error');
  } finally {
    isSendingCode = false;
    if (sendBtn) {
      sendBtn.disabled = false;
      sendBtn.innerHTML = '<span>Send Verification Code</span>';
      sendBtn.style.opacity = '1';
      sendBtn.style.cursor = 'pointer';
    }
  }
}

async function submitVerifyCode() {
  if (isVerifyingCode) return; // Prevent double/triple click

  const codeInput = document.getElementById('modal-code');
  const code = (codeInput ? codeInput.value : '').trim();
  const password = document.getElementById('modal-password').value.trim() || undefined;

  if (!code) {
    showToast('Please enter the 5-digit verification code', 'error');
    return;
  }

  const verifyBtn = document.getElementById('btn-modal-verify-code');
  isVerifyingCode = true;
  if (verifyBtn) {
    verifyBtn.disabled = true;
    verifyBtn.innerHTML = '<span style="display:inline-block; animation: spin 1s linear infinite;">⏳</span> Verifying & Saving Session...';
    verifyBtn.style.opacity = '0.7';
    verifyBtn.style.cursor = 'not-allowed';
  }

  try {
    showToast('Authenticating MTProto session string with Telegram...', 'info');
    const res = await apiCall('/accounts/verify-code', 'POST', {
      phone: pendingPhone,
      phoneCodeHash: pendingPhoneCodeHash,
      code,
      password,
    });

    if (resendTimer) clearInterval(resendTimer);
    showToast(`Account successfully registered! Phone: ${res.account?.phone}`, 'success');
    closeAddAccountModal();
    loadAccounts();
    loadStats();
  } catch (err) {
    showToast(err.message || 'Verification failed. Please check the code or 2FA password.', 'error');
  } finally {
    isVerifyingCode = false;
    if (verifyBtn) {
      verifyBtn.disabled = false;
      verifyBtn.innerHTML = '<span>Verify & Register Account</span>';
      verifyBtn.style.opacity = '1';
      verifyBtn.style.cursor = 'pointer';
    }
  }
}

// ==========================================================================
// 8. TOAST NOTIFICATIONS
// ==========================================================================

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
  toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4500);
}
