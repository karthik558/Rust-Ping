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

// Handle login form submission
function handleLogin(event) {
    event.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    // Get users from localStorage
    const users = JSON.parse(localStorage.getItem('users') || '[]');
    
    // Find user
    const user = users.find(u => u.username === username);
    
    if (!user) {
        alert('Invalid username or password');
        return;
    }

    // Hash the provided password
    hashPassword(password).then(hashedPassword => {
        if (hashedPassword !== user.passwordHash) {
            alert('Invalid username or password');
            return;
        }

        // Set authentication cookie
        document.cookie = "auth=true; path=/";
        
        // Store current user info
        localStorage.setItem('currentUser', JSON.stringify({
            username: user.username,
            role: user.role
        }));

        // Show welcome overlay for 2 seconds before redirecting
        const welcomeOverlay = document.getElementById('welcomeOverlay');
        welcomeOverlay.classList.add('show');
        
        setTimeout(() => {
            welcomeOverlay.classList.remove('show');
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
});