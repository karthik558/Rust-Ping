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