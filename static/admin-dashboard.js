// Check if user is admin
function checkAdminAccess() {
    const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
    if (currentUser.role !== 'admin') {
        window.location.href = 'index.html';
        return;
    }
}

// Initialize dashboard
document.addEventListener('DOMContentLoaded', () => {
    checkAdminAccess();
    setupDarkMode();
    setupEventListeners();
    loadUsers();
    updateUserProfile();
    handleDropdownMenu();
    updateLockedUsersTable();
    initializeGraphs();
    
    // Update data periodically
    setInterval(() => {
        updateLockedUsersTable();
        updateGraphs();
    }, 30000);
});

// Setup event listeners
function setupEventListeners() {
    // Add User button
    const addUserBtn = document.getElementById('addUserBtn');
    const addUserModal = document.getElementById('addUserModal');
    const cancelBtn = document.getElementById('cancelBtn');
    const addUserForm = document.getElementById('addUserForm');

    if (addUserBtn) {
        addUserBtn.addEventListener('click', () => {
            addUserModal.classList.add('active');
        });
    }

    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            addUserModal.classList.remove('active');
            addUserForm.reset();
        });
    }

    if (addUserForm) {
        addUserForm.addEventListener('submit', handleAddUser);
    }

    // Close modal when clicking outside
    window.addEventListener('click', (e) => {
        if (e.target === addUserModal) {
            addUserModal.classList.remove('active');
            addUserForm.reset();
        }
    });
}

// Setup dark mode
function setupDarkMode() {
    const savedDarkMode = localStorage.getItem('darkMode');
    if (savedDarkMode === 'true') {
        document.body.classList.add('dark-mode');
        const toggleButton = document.querySelector('.dark-mode-toggle');
        toggleButton.classList.add('active');
        const icon = toggleButton.querySelector('i');
        icon.classList.remove('fa-moon');
        icon.classList.add('fa-sun');
        icon.style.transform = 'rotate(180deg)';
        updateLogo(true);
    }

    // Listen for dark mode changes from other pages
    document.addEventListener('darkModeChanged', (e) => {
        const isDarkMode = e.detail.isDarkMode;
        document.body.classList.toggle('dark-mode', isDarkMode);
        const toggleButton = document.querySelector('.dark-mode-toggle');
        toggleButton.classList.toggle('active', isDarkMode);
        const icon = toggleButton.querySelector('i');
        if (isDarkMode) {
            icon.classList.remove('fa-moon');
            icon.classList.add('fa-sun');
            icon.style.transform = 'rotate(180deg)';
        } else {
            icon.classList.remove('fa-sun');
            icon.classList.add('fa-moon');
            icon.style.transform = 'rotate(0deg)';
        }
        updateLogo(isDarkMode);
    });
}

// Toggle dark mode
function toggleDarkMode() {
    const toggleButton = document.querySelector('.dark-mode-toggle');
    const isDarkMode = document.body.classList.toggle('dark-mode');
    toggleButton.classList.toggle('active', isDarkMode);
    
    const icon = toggleButton.querySelector('i');
    if (isDarkMode) {
        icon.classList.remove('fa-moon');
        icon.classList.add('fa-sun');
        icon.style.transform = 'rotate(180deg)';
    } else {
        icon.classList.remove('fa-sun');
        icon.classList.add('fa-moon');
        icon.style.transform = 'rotate(0deg)';
    }

    // Save preference
    localStorage.setItem('darkMode', isDarkMode ? 'true' : 'false');
    updateLogo(isDarkMode);

    // Dispatch event for other pages
    document.dispatchEvent(new CustomEvent('darkModeChanged', {
        detail: { isDarkMode }
    }));
}

// Update logo based on dark mode
function updateLogo(isDarkMode) {
    const logo = document.getElementById('logoImage');
    if (logo) {
        logo.src = isDarkMode ? 'logo-dark.png' : 'logo-light.png';
    }
}

// Load users from localStorage
function loadUsers() {
    const userList = document.getElementById('userList');
    if (!userList) return;

    const users = JSON.parse(localStorage.getItem('users') || '[]');
    userList.innerHTML = users.map(user => createUserElement(user)).join('');
}

// Create user element
function createUserElement(user) {
    const roleIcon = user.role === 'admin' ? 'fa-user-shield' : 'fa-user';
    const roleColor = user.role === 'admin' ? '#4CAF50' : '#2196F3';
    
    return `
        <div class="user-item">
            <div class="user-info">
                <div class="user-avatar" style="background-color: ${roleColor}">
                    <i class="fas ${roleIcon}"></i>
                </div>
                <div class="user-details">
                    <span class="user-name">${user.username}</span>
                    <span class="user-role">${user.role.charAt(0).toUpperCase() + user.role.slice(1)}</span>
                </div>
            </div>
            <div class="user-actions">
                <button class="btn-icon" onclick="editUser('${user.username}')" title="Edit User">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn-icon" onclick="resetUserPassword('${user.username}')" title="Reset Password">
                    <i class="fas fa-key"></i>
                </button>
                <button class="btn-icon" onclick="deleteUser('${user.username}')" title="Delete User">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
    `;
}

// Handle add user
async function handleAddUser(event) {
    event.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const role = document.getElementById('role').value;

    // Validate password
    if (!validatePassword(password)) {
        alert('Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, and one number.');
        return;
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Get existing users
    const users = JSON.parse(localStorage.getItem('users') || '[]');

    // Check if username already exists
    if (users.some(user => user.username === username)) {
        alert('Username already exists');
        return;
    }

    // Add new user
    users.push({
        username,
        passwordHash,
        role
    });

    // Save to localStorage
    localStorage.setItem('users', JSON.stringify(users));

    // Reload user list
    loadUsers();

    // Close modal and reset form
    const modal = document.getElementById('addUserModal');
    modal.classList.remove('active');
    event.target.reset();
}

// Validate password
function validatePassword(password) {
    return password.length >= 8 &&
           /[A-Z]/.test(password) &&
           /[a-z]/.test(password) &&
           /[0-9]/.test(password);
}

// Hash password
async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Edit user
function editUser(username) {
    // TODO: Implement edit user functionality
    alert('Edit user functionality coming soon!');
}

// Reset user password
function resetUserPassword(username) {
    // TODO: Implement reset password functionality
    alert('Reset password functionality coming soon!');
}

// Delete user
function deleteUser(username) {
    if (!confirm(`Are you sure you want to delete user "${username}"?`)) {
        return;
    }

    const users = JSON.parse(localStorage.getItem('users') || '[]');
    const updatedUsers = users.filter(user => user.username !== username);
    localStorage.setItem('users', JSON.stringify(updatedUsers));
    loadUsers();
}

// Update user profile
function updateUserProfile() {
    const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
    const usernameElement = document.getElementById('username');
    const userAvatar = document.getElementById('userAvatar');

    if (usernameElement) {
        usernameElement.textContent = currentUser.username;
    }

    if (userAvatar) {
        userAvatar.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUser.username)}&background=random`;
    }
}

// Reload current page
function reloadCurrentPage() {
    window.location.reload();
}

// Handle dropdown menu
function handleDropdownMenu() {
    const dropdowns = document.querySelectorAll('.nav-dropdown');
    
    dropdowns.forEach(dropdown => {
        const btn = dropdown.querySelector('.nav-dropdown-btn');
        const overlay = document.createElement('div');
        overlay.className = 'nav-dropdown-overlay';
        dropdown.parentNode.insertBefore(overlay, dropdown.nextSibling);
        
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown.classList.toggle('active');
        });
        
        overlay.addEventListener('click', () => {
            dropdown.classList.remove('active');
        });
        
        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!dropdown.contains(e.target)) {
                dropdown.classList.remove('active');
            }
        });
        
        // Close dropdown when pressing Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && dropdown.classList.contains('active')) {
                dropdown.classList.remove('active');
            }
        });
    });
} 

function toggleDropdown(button) {
    const dropdown = button.closest('.nav-dropdown');
    dropdown.classList.toggle('active');
}

function closeAllDropdowns() {
    const dropdowns = document.querySelectorAll('.nav-dropdown.active');
    dropdowns.forEach(dropdown => dropdown.classList.remove('active'));
}

// Close dropdowns when clicking outside
document.addEventListener('click', function (event) {
    if (!event.target.closest('.nav-dropdown')) {
        closeAllDropdowns();
    }
});

// Function to update the locked users table
function updateLockedUsersTable() {
    console.log('Updating locked users table...');
    const lockedUsers = getLockedUsers();
    console.log('Locked users:', lockedUsers);
    
    const tableBody = document.getElementById('lockedUsersTableBody');
    const noLockedUsers = document.getElementById('noLockedUsers');

    if (!tableBody || !noLockedUsers) {
        console.error('Required elements not found:', {
            tableBody: !!tableBody,
            noLockedUsers: !!noLockedUsers
        });
        return;
    }

    if (lockedUsers.length === 0) {
        console.log('No locked users found');
        tableBody.innerHTML = '';
        noLockedUsers.style.display = 'block';
        return;
    }

    console.log('Displaying locked users in table');
    noLockedUsers.style.display = 'none';
    tableBody.innerHTML = lockedUsers.map(user => `
        <tr>
            <td>${user.username}</td>
            <td><span class="role-badge ${user.role}">${user.role}</span></td>
            <td>${user.attempts}</td>
            <td>${user.lockedAt}</td>
            <td>${user.remainingTime} minutes</td>
            <td>
                <button onclick="unlockUser('${user.username}')" class="button unlock-button">
                    <i class="fas fa-unlock"></i> Unlock
                </button>
            </td>
        </tr>
    `).join('');
}

// Function to unlock a user
function unlockUser(username) {
    console.log('Unlocking user:', username);
    unlockUserAccount(username);
    showNotification(`Account unlocked: ${username}`, 'success');
    updateLockedUsersTable();
}

// Show notification
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// Function to get all locked users
function getLockedUsers() {
    console.log('Getting locked users...');
    const attempts = JSON.parse(localStorage.getItem('loginAttempts') || '{}');
    const users = JSON.parse(localStorage.getItem('users') || '[]');
    const currentTime = new Date().getTime();
    
    console.log('Login attempts data:', attempts);
    
    const lockedUsers = Object.entries(attempts).map(([username, data]) => {
        const user = users.find(u => u.username === username);
        const maxAttempts = user?.role === 'admin' ? 10 : 3;
        const timeDiff = currentTime - data.timestamp;
        const isLocked = data.count >= maxAttempts && timeDiff < (15 * 60 * 1000); // 15 minutes
        
        console.log(`Checking user ${username}:`, {
            attempts: data.count,
            maxAttempts,
            timeDiff,
            isLocked
        });
        
        if (isLocked) {
            const remainingTime = Math.ceil((15 * 60 * 1000 - timeDiff) / 60000);
            return {
                username,
                role: user?.role || 'user',
                attempts: data.count,
                remainingTime,
                lockedAt: new Date(data.timestamp).toLocaleString()
            };
        }
        return null;
    }).filter(Boolean);
    
    console.log('Found locked users:', lockedUsers);
    return lockedUsers;
}

// Function to unlock a user account
function unlockUserAccount(username) {
    console.log('Unlocking account for:', username);
    const attempts = JSON.parse(localStorage.getItem('loginAttempts') || '{}');
    delete attempts[username];
    localStorage.setItem('loginAttempts', JSON.stringify(attempts));
    console.log('Updated login attempts:', attempts);
}

// Charts configuration
let charts = {
    userActivity: null,
    accountStatus: null,
    userRole: null,
    loginRate: null
};

// Initialize graphs
function initializeGraphs() {
    Chart.defaults.font.family = "'Inter', sans-serif";
    Chart.defaults.font.size = 12;
    Chart.defaults.plugins.legend.labels.usePointStyle = true;
    Chart.defaults.plugins.legend.labels.padding = 15;
    Chart.defaults.plugins.legend.labels.boxWidth = 8;
    Chart.defaults.plugins.legend.labels.pointStyle = 'circle';

    const commonOptions = {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
            legend: {
                position: 'top',
                align: 'start',
                labels: {
                    color: document.body.classList.contains('dark-mode') ? '#e6edf3' : '#24292f'
                }
            }
        }
    };

    // User Activity Timeline
    const userActivityCtx = document.getElementById('userActivityChart').getContext('2d');
    charts.userActivity = new Chart(userActivityCtx, {
        type: 'line',
        data: {
            labels: getLast7Days(),
            datasets: [{
                label: 'Login Attempts',
                data: getLoginAttemptData(),
                borderColor: '#0969da',
                tension: 0.4,
                fill: true,
                backgroundColor: 'rgba(9, 105, 218, 0.1)',
                pointBackgroundColor: '#0969da',
                pointBorderColor: '#fff',
                pointRadius: 4,
                pointHoverRadius: 6
            }]
        },
        options: {
            ...commonOptions,
            scales: {
                x: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        color: document.body.classList.contains('dark-mode') ? '#e6edf3' : '#24292f'
                    }
                },
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1,
                        color: document.body.classList.contains('dark-mode') ? '#e6edf3' : '#24292f'
                    },
                    grid: {
                        color: document.body.classList.contains('dark-mode') ? 'rgba(230, 237, 243, 0.1)' : 'rgba(36, 41, 47, 0.1)'
                    }
                }
            }
        }
    });

    // Account Status Distribution
    const accountStatusCtx = document.getElementById('accountStatusChart').getContext('2d');
    charts.accountStatus = new Chart(accountStatusCtx, {
        type: 'doughnut',
        data: {
            labels: ['Active', 'Locked'],
            datasets: [{
                data: getAccountStatusData(),
                backgroundColor: ['#2da44e', '#cf222e'],
                borderWidth: 0,
                hoverOffset: 4
            }]
        },
        options: {
            ...commonOptions,
            cutout: '65%',
            radius: '90%'
        }
    });

    // User Role Distribution
    const userRoleCtx = document.getElementById('userRoleChart').getContext('2d');
    charts.userRole = new Chart(userRoleCtx, {
        type: 'pie',
        data: {
            labels: ['Admins', 'Regular Users'],
            datasets: [{
                data: getUserRoleData(),
                backgroundColor: ['#0969da', '#6e7781'],
                borderWidth: 0,
                hoverOffset: 4
            }]
        },
        options: {
            ...commonOptions,
            radius: '90%'
        }
    });

    // Login Success/Failure Rate
    const loginRateCtx = document.getElementById('loginRateChart').getContext('2d');
    charts.loginRate = new Chart(loginRateCtx, {
        type: 'bar',
        data: {
            labels: getLast7Days(),
            datasets: [{
                label: 'Successful Logins',
                data: getLoginSuccessData(),
                backgroundColor: '#2da44e',
                borderRadius: 4,
                barPercentage: 0.6,
                categoryPercentage: 0.7
            }, {
                label: 'Failed Logins',
                data: getLoginFailureData(),
                backgroundColor: '#cf222e',
                borderRadius: 4,
                barPercentage: 0.6,
                categoryPercentage: 0.7
            }]
        },
        options: {
            ...commonOptions,
            scales: {
                x: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        color: document.body.classList.contains('dark-mode') ? '#e6edf3' : '#24292f'
                    }
                },
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1,
                        color: document.body.classList.contains('dark-mode') ? '#e6edf3' : '#24292f'
                    },
                    grid: {
                        color: document.body.classList.contains('dark-mode') ? 'rgba(230, 237, 243, 0.1)' : 'rgba(36, 41, 47, 0.1)'
                    }
                }
            }
        }
    });

    // Setup graph visibility toggles
    setupGraphToggles();

    // Update chart colors when dark mode changes
    document.addEventListener('darkModeChanged', updateChartColors);
}

// Update chart colors based on dark mode
function updateChartColors(e) {
    const isDarkMode = e?.detail?.isDarkMode ?? document.body.classList.contains('dark-mode');
    const textColor = isDarkMode ? '#e6edf3' : '#24292f';
    const gridColor = isDarkMode ? 'rgba(230, 237, 243, 0.1)' : 'rgba(36, 41, 47, 0.1)';

    Object.values(charts).forEach(chart => {
        if (!chart) return;

        // Update legend colors
        chart.options.plugins.legend.labels.color = textColor;

        // Update axis colors for line and bar charts
        if (chart.config.type === 'line' || chart.config.type === 'bar') {
            chart.options.scales.x.ticks.color = textColor;
            chart.options.scales.y.ticks.color = textColor;
            chart.options.scales.y.grid.color = gridColor;
        }

        chart.update();
    });
}

// Helper functions for data
function getLast7Days() {
    const days = [];
    for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        days.push(date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
    }
    return days;
}

function getLoginAttemptData() {
    const attempts = JSON.parse(localStorage.getItem('loginAttempts') || '{}');
    const last7Days = new Array(7).fill(0);
    
    Object.values(attempts).forEach(data => {
        const date = new Date(data.timestamp);
        const dayIndex = Math.floor((Date.now() - date) / (1000 * 60 * 60 * 24));
        if (dayIndex >= 0 && dayIndex < 7) {
            last7Days[6 - dayIndex] += 1;
        }
    });
    
    return last7Days;
}

function getAccountStatusData() {
    const attempts = JSON.parse(localStorage.getItem('loginAttempts') || '{}');
    const users = JSON.parse(localStorage.getItem('users') || '[]');
    let lockedCount = 0;
    
    Object.entries(attempts).forEach(([username, data]) => {
        const user = users.find(u => u.username === username);
        const maxAttempts = user?.role === 'admin' ? 10 : 3;
        if (data.count >= maxAttempts) lockedCount++;
    });
    
    return [users.length - lockedCount, lockedCount];
}

function getUserRoleData() {
    const users = JSON.parse(localStorage.getItem('users') || '[]');
    const adminCount = users.filter(user => user.role === 'admin').length;
    return [adminCount, users.length - adminCount];
}

function getLoginSuccessData() {
    // Implement actual login success tracking
    return new Array(7).fill(0).map(() => Math.floor(Math.random() * 5));
}

function getLoginFailureData() {
    const attempts = JSON.parse(localStorage.getItem('loginAttempts') || '{}');
    const last7Days = new Array(7).fill(0);
    
    Object.values(attempts).forEach(data => {
        const date = new Date(data.timestamp);
        const dayIndex = Math.floor((Date.now() - date) / (1000 * 60 * 60 * 24));
        if (dayIndex >= 0 && dayIndex < 7) {
            last7Days[6 - dayIndex] += 1;
        }
    });
    
    return last7Days;
}

// Graph visibility controls
function setupGraphToggles() {
    const toggles = {
        userActivityGraph: document.getElementById('userActivityCard'),
        accountStatusGraph: document.getElementById('accountStatusCard'),
        userRoleGraph: document.getElementById('userRoleCard'),
        loginRateGraph: document.getElementById('loginRateCard')
    };

    Object.entries(toggles).forEach(([id, card]) => {
        const checkbox = document.getElementById(id);
        if (checkbox && card) {
            // Apply saved preference
            const isVisible = localStorage.getItem(id) !== 'hidden';
            checkbox.checked = isVisible;
            card.classList.toggle('hidden', !isVisible);

            // Handle changes
            checkbox.addEventListener('change', (e) => {
                const isChecked = e.target.checked;
                card.classList.toggle('hidden', !isChecked);
                localStorage.setItem(id, isChecked ? 'visible' : 'hidden');
            });
        }
    });
}

function toggleGraphSettings() {
    const panel = document.getElementById('graphSettings');
    panel.classList.toggle('active');
}

// Update graphs periodically
function updateGraphs() {
    if (charts.userActivity) {
        charts.userActivity.data.datasets[0].data = getLoginAttemptData();
        charts.userActivity.update();
    }
    if (charts.accountStatus) {
        charts.accountStatus.data.datasets[0].data = getAccountStatusData();
        charts.accountStatus.update();
    }
    if (charts.userRole) {
        charts.userRole.data.datasets[0].data = getUserRoleData();
        charts.userRole.update();
    }
    if (charts.loginRate) {
        charts.loginRate.data.datasets[0].data = getLoginSuccessData();
        charts.loginRate.data.datasets[1].data = getLoginFailureData();
        charts.loginRate.update();
    }
}