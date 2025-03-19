// login.js - JavaScript for the login page

// Add this function for password hashing
async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
}

// Add session timeout handling
let inactivityTimer;
const TIMEOUT_MINUTES = 15;

function resetInactivityTimer() {
    clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(logout, TIMEOUT_MINUTES * 60 * 1000);
}

function setupInactivityDetection() {
    // Reset timer on user activity
    ['click', 'keypress', 'scroll', 'mousemove'].forEach(event => {
        document.addEventListener(event, resetInactivityTimer);
    });
    resetInactivityTimer();
}

// Initialize default admin if no users exist
function initializeDefaultAdmin() {
    const users = JSON.parse(localStorage.getItem('users') || '[]');
    if (users.length === 0) {
        const defaultAdmin = {
            username: 'admin',
            passwordHash: '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918', // admin
            role: 'admin'
        };
        users.push(defaultAdmin);
        localStorage.setItem('users', JSON.stringify(users));
    }
}

// Login attempt tracking
const ADMIN_MAX_LOGIN_ATTEMPTS = 10;
const USER_MAX_LOGIN_ATTEMPTS = 3;
const LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes in milliseconds

function getLoginAttempts(username) {
    const attempts = JSON.parse(localStorage.getItem('loginAttempts') || '{}');
    return attempts[username] || { count: 0, timestamp: null };
}

function updateLoginAttempts(username, reset = false) {
    const attempts = JSON.parse(localStorage.getItem('loginAttempts') || '{}');
    
    if (reset) {
        delete attempts[username];
    } else {
        attempts[username] = {
            count: (attempts[username]?.count || 0) + 1,
            timestamp: new Date().getTime()
        };
    }
    
    localStorage.setItem('loginAttempts', JSON.stringify(attempts));
    return attempts[username];
}

function isAccountLocked(username) {
    const attempts = getLoginAttempts(username);
    const users = JSON.parse(localStorage.getItem('users') || '[]');
    const user = users.find(u => u.username === username);
    const maxAttempts = user?.role === 'admin' ? ADMIN_MAX_LOGIN_ATTEMPTS : USER_MAX_LOGIN_ATTEMPTS;

    if (attempts.count >= maxAttempts) {
        const timeDiff = new Date().getTime() - attempts.timestamp;
        if (timeDiff < LOCKOUT_DURATION) {
            const remainingTime = Math.ceil((LOCKOUT_DURATION - timeDiff) / 60000);
            return `Account is temporarily locked. Please try again in ${remainingTime} minutes.`;
        } else {
            updateLoginAttempts(username, true);
            return false;
        }
    }
    return false;
}

// Function to unlock a user account
function unlockUserAccount(username) {
    updateLoginAttempts(username, true);
}

// Function to get all locked users
function getLockedUsers() {
    const attempts = JSON.parse(localStorage.getItem('loginAttempts') || '{}');
    const users = JSON.parse(localStorage.getItem('users') || '[]');
    const currentTime = new Date().getTime();
    
    return Object.entries(attempts).map(([username, data]) => {
        const user = users.find(u => u.username === username);
        const maxAttempts = user?.role === 'admin' ? ADMIN_MAX_LOGIN_ATTEMPTS : USER_MAX_LOGIN_ATTEMPTS;
        const timeDiff = currentTime - data.timestamp;
        const isLocked = data.count >= maxAttempts && timeDiff < LOCKOUT_DURATION;
        
        if (isLocked) {
            const remainingTime = Math.ceil((LOCKOUT_DURATION - timeDiff) / 60000);
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
}

// Handle login form submission
function handleLogin(event) {
    event.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const errorMessageDiv = document.getElementById('errorMessage');
    const loginButton = document.querySelector('.primary-button');

    // Clear previous error messages
    errorMessageDiv.style.display = 'none';
    errorMessageDiv.textContent = '';

    // Check if account is locked
    const lockStatus = isAccountLocked(username);
    if (lockStatus) {
        errorMessageDiv.style.display = 'block';
        errorMessageDiv.textContent = lockStatus;
        return;
    }

    // Show loading state
    loginButton.classList.add('loading');

    // Get users from localStorage
    const users = JSON.parse(localStorage.getItem('users') || '[]');
    
    // Find user
    const user = users.find(u => u.username === username);
    
    if (!user) {
        updateLoginAttempts(username);
        errorMessageDiv.style.display = 'block';
        errorMessageDiv.textContent = 'Invalid username or password';
        loginButton.classList.remove('loading');
        return;
    }

    // Hash the provided password
    hashPassword(password).then(hashedPassword => {
        if (hashedPassword !== user.passwordHash) {
            updateLoginAttempts(username);
            errorMessageDiv.style.display = 'block';
            errorMessageDiv.textContent = 'Invalid username or password';
            loginButton.classList.remove('loading');
            return;
        }

        // Reset login attempts on successful login
        updateLoginAttempts(username, true);

        // Handle "Remember me" functionality
        const rememberMe = document.getElementById('rememberMe').checked;
        if (rememberMe) {
            // Set a longer expiration for the auth cookie (30 days)
            const expirationDate = new Date();
            expirationDate.setDate(expirationDate.getDate() + 30);
            document.cookie = `auth=true; path=/; expires=${expirationDate.toUTCString()}`;
        } else {
            document.cookie = "auth=true; path=/";
        }
        
        // Store current user info
        localStorage.setItem('currentUser', JSON.stringify({
            username: user.username,
            role: user.role,
            lastLogin: new Date().toISOString()
        }));

        // Show welcome overlay for 2 seconds before redirecting
        const welcomeOverlay = document.getElementById('welcomeOverlay');
        welcomeOverlay.classList.add('show');
        
        setTimeout(() => {
            welcomeOverlay.classList.remove('show');
            loginButton.classList.remove('loading');
            // Redirect based on role
            if (user.role === 'admin') {
                window.location.href = 'admin-dashboard.html';
            } else {
                window.location.href = 'index.html';
            }
        }, 2000);
    });
}

function logout() {
    document.cookie = "auth=true; max-age=0; path=/";
    localStorage.removeItem('currentUser');
    window.location.href = '/static/login.html';
}

// Check session timeout
function checkSession() {
    if (!document.cookie.includes('auth=true')) {
        window.location.href = '/static/login.html';
    }
}

// Check authentication status every 2 minutes
setInterval(checkSession, 1500000);

// --- Dark Mode Toggle ---
function toggleDarkMode() {
    const toggleButton = document.querySelector(".dark-mode-toggle");
    const isDarkMode = document.body.classList.toggle("dark-mode");
    toggleButton.classList.toggle("active", isDarkMode);

    // Update icon
    const icon = toggleButton.querySelector("i");
    if (isDarkMode) {
        icon.classList.remove("fa-moon");
        icon.classList.add("fa-sun");
        icon.style.transform = "rotate(180deg)";
    } else {
        icon.classList.remove("fa-sun");
        icon.classList.add("fa-moon");
        icon.style.transform = "rotate(0deg)";
    }

    // Save preference
    localStorage.setItem("darkMode", isDarkMode ? "true" : "false");
    updateLogo(isDarkMode);
}

// Update logo based on dark mode
function updateLogo(isDarkMode) {
    const logo = document.getElementById('logoImage');
    if (logo) {
        logo.src = isDarkMode ? 'logo-dark.png' : 'logo-light.png';
    }
}

// Reload current page
function reloadCurrentPage() {
    window.location.reload();
}

// Password strength meter
function updatePasswordStrength(password) {
    const meter = document.querySelector('.meter-bar');
    if (!meter) return;

    const strength = calculatePasswordStrength(password);
    meter.className = 'meter-bar';
    
    if (password.length === 0) {
        meter.style.width = '0';
        return;
    }

    switch (strength) {
        case 1:
            meter.classList.add('weak');
            break;
        case 2:
            meter.classList.add('fair');
            break;
        case 3:
            meter.classList.add('good');
            break;
        case 4:
            meter.classList.add('strong');
            break;
    }
}

function calculatePasswordStrength(password) {
    let strength = 0;
    
    // Length check
    if (password.length >= 8) strength++;
    if (password.length >= 12) strength++;
    
    // Character variety
    if (/[A-Z]/.test(password) && /[a-z]/.test(password)) strength++;
    if (/[0-9]/.test(password)) strength++;
    if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) strength++;
    
    // Normalize to 4 levels
    return Math.min(4, Math.floor(strength * 1.5));
}

// Toggle password visibility
function togglePasswordVisibility() {
    const passwordInput = document.getElementById('password');
    const toggleIcon = document.querySelector('.password-toggle i');
    
    if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        toggleIcon.classList.remove('fa-eye');
        toggleIcon.classList.add('fa-eye-slash');
    } else {
        passwordInput.type = 'password';
        toggleIcon.classList.remove('fa-eye-slash');
        toggleIcon.classList.add('fa-eye');
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    // Initialize default admin
    initializeDefaultAdmin();
    
    // Apply dark mode preference
    const savedDarkMode = localStorage.getItem("darkMode");
    if (savedDarkMode === "true") {
        document.body.classList.add("dark-mode");
        const toggleButton = document.querySelector(".dark-mode-toggle");
        toggleButton.classList.add("active");
        const icon = toggleButton.querySelector("i");
        icon.classList.remove("fa-moon");
        icon.classList.add("fa-sun");
        icon.style.transform = "rotate(180deg)";
        updateLogo(true);
    }

    // Add forgot password handler
    const forgotPasswordLink = document.getElementById('forgotPasswordLink');
    if (forgotPasswordLink) {
        forgotPasswordLink.addEventListener('click', (e) => {
            e.preventDefault();
            alert('Please contact your administrator to reset your password.');
        });
    }

    // Initialize inactivity detection if authenticated
    if (document.cookie.includes('auth=true')) {
        setupInactivityDetection();
    }

    // Auto-focus username field
    const usernameInput = document.getElementById('username');
    if (usernameInput) {
        usernameInput.focus();
    }

    // Add password toggle button click handler
    const passwordToggle = document.querySelector('.password-toggle');
    if (passwordToggle) {
        passwordToggle.addEventListener('click', togglePasswordVisibility);
    }

    // Add password strength meter handler
    const passwordInput = document.getElementById('password');
    if (passwordInput) {
        passwordInput.addEventListener('input', (e) => {
            updatePasswordStrength(e.target.value);
        });
    }

    // Add keyboard shortcut for login (Enter key)
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            const activeElement = document.activeElement;
            const loginForm = document.getElementById('loginForm');
            
            if (loginForm && 
                (activeElement === passwordInput || 
                 activeElement === document.getElementById('username'))) {
                e.preventDefault();
                handleLogin(new Event('submit'));
            }
        }
    });
});