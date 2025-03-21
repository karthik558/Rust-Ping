// Add the hash password function at the top of the file
async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Check password strength
function checkPasswordStrength(password) {
    let strength = 0;
    if (password.length >= 8) strength++;
    if (password.match(/[a-z]/) && password.match(/[A-Z]/)) strength++;
    if (password.match(/\d/)) strength++;
    if (password.match(/[^a-zA-Z\d]/)) strength++;

    const meter = document.getElementById('strengthMeter');
    const strengthText = document.getElementById('strengthText');

    meter.className = 'meter-fill'; // Reset classes
    switch (strength) {
        case 0:
        case 1:
            meter.classList.add('weak');
            strengthText.textContent = 'Weak Password';
            break;
        case 2:
        case 3:
            meter.classList.add('medium');
            strengthText.textContent = 'Medium Password';
            break;
        case 4:
            meter.classList.add('strong');
            strengthText.textContent = 'Strong Password';
            break;
    }
    return strength;
}

// Update password
async function updatePassword() {
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const statusMessage = document.getElementById('statusMessage');

    // --- Helper Functions for Status Messages ---
    function showSuccessMessage(message) {
        statusMessage.textContent = message;
        statusMessage.classList.remove('error');
        statusMessage.classList.add('success');
        statusMessage.classList.add('show');
    }

    function showErrorMessage(message) {
        statusMessage.textContent = message;
        statusMessage.classList.remove('success');
        statusMessage.classList.add('error');
        statusMessage.classList.add('show');
    }

    function hideStatusMessage() {
        statusMessage.classList.remove('show');
    }
    // --- End Helper Functions ---

    if (newPassword !== confirmPassword) {
        showErrorMessage('Passwords do not match');
        return;
    }

    if (checkPasswordStrength(newPassword) < 3) {
        showErrorMessage('Password is not strong enough');
        return;
    }

    try {
        const hashedPassword = await hashPassword(newPassword);
        const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
        
        if (!currentUser.username) {
            throw new Error('No user logged in');
        }

        // Get users from localStorage or initialize from AUTH_CONFIG
        let users = JSON.parse(localStorage.getItem('users') || '[]');
        if (users.length === 0 && typeof AUTH_CONFIG !== 'undefined') {
            users = AUTH_CONFIG.users || [];
            localStorage.setItem('users', JSON.stringify(users));
        }
        
        // Update the user's password
        const userIndex = users.findIndex(u => u.username === currentUser.username);
        if (userIndex === -1) {
            throw new Error('User not found');
        }
        
        users[userIndex].passwordHash = hashedPassword;

        // Update localStorage
        localStorage.setItem('users', JSON.stringify(users));

        // Update config.js
        const configContent = `const AUTH_CONFIG = ${JSON.stringify({ users }, null, 4)};`;
        const response = await fetch('/update-config', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                content: configContent
            })
        });

        if (!response.ok) {
            throw new Error('Failed to update config file');
        }

        showSuccessMessage('Password updated successfully');
        setTimeout(() => {
            window.location.href = '/static/index.html';
        }, 2000);
    } catch (error) {
        console.error('Error updating password:', error);
        showErrorMessage('Failed to update password: ' + error.message);
    }
}

// Add event listeners for password strength checking
document.getElementById('newPassword').addEventListener('input', function () {
    checkPasswordStrength(this.value);
});

// --- Dark Mode Toggle ---
function toggleDarkMode() {
    const body = document.body;
    body.classList.toggle('dark-mode');
    const darkModeToggle = document.querySelector('.dark-mode-toggle');
    if (darkModeToggle) {
        darkModeToggle.classList.toggle('active'); //check if darkmodetoggle exists
    }

    const icon = document.querySelector('.dark-mode-toggle i'); //query the icon seprately
    if (icon) {
        const isDarkMode = body.classList.contains('dark-mode');
        localStorage.setItem('darkMode', isDarkMode);
        updateLogo(isDarkMode);
        updateWelcomeLogo(isDarkMode);

        if (isDarkMode) {
            icon.classList.remove('fa-moon');
            icon.classList.add('fa-sun');
        } else {
            icon.classList.remove('fa-sun');
            icon.classList.add('fa-moon');
        }
    }
}

// Function to update logo based on dark mode
function updateLogo(isDarkMode) {
    const logoImage = document.getElementById('logoImage');
    if (logoImage) {
        if (isDarkMode) {
            logoImage.src = 'logo-dark.png';
        } else {
            logoImage.src = 'logo-light.png';
        }
    }
}

// Function to reload the current page
function reloadCurrentPage() {
    window.location.reload();
}

// Update logo based on dark mode
function updateWelcomeLogo(isDarkMode) {
    const welcomeLogo = document.getElementById('welcomeLogoImage');
    if (welcomeLogo) {
        welcomeLogo.src = isDarkMode ? 'logo-dark.png' : 'logo-light.png';
    }
}

// Check for saved dark mode preference on page load, and handle forgot password
document.addEventListener('DOMContentLoaded', () => {
    const isDarkMode = localStorage.getItem('darkMode') === 'true';
    if (isDarkMode) {
        document.body.classList.add('dark-mode');
        updateLogo(isDarkMode);
        updateWelcomeLogo(isDarkMode); // Ensure welcome logo is updated too
        const icon = document.querySelector('.dark-mode-toggle i');
        if (icon) {
            icon.classList.remove('fa-moon');
            icon.classList.add('fa-sun');
        }
    }

    //  The password form event listener (if you decide to submit the form via JS)
    const passwordForm = document.getElementById('passwordForm'); // Get the form element
    if (passwordForm) { // Check if the form exists (it might not be on all pages)
        passwordForm.addEventListener('submit', function (event) {
            event.preventDefault(); // Prevent the default form submission
            updatePassword();     // Call your updatePassword function
        });
    }
});

// Add to each protected page's <head> section
document.addEventListener('DOMContentLoaded', function() {
    if (!document.cookie.includes('auth=true')) {
        window.location.href = '/static/login.html';
        return;
    }
    
    // Reset inactivity timer on user activity
    let inactivityTimer;
    const TIMEOUT_MINUTES = 15;

    function resetInactivityTimer() {
        clearTimeout(inactivityTimer);
        inactivityTimer = setTimeout(logout, TIMEOUT_MINUTES * 60 * 1000);
    }

    ['click', 'keypress', 'scroll', 'mousemove'].forEach(event => {
        document.addEventListener(event, resetInactivityTimer);
    });
    resetInactivityTimer();
});

function logout() {
    document.cookie = "auth=true; max-age=0; path=/";
    window.location.href = '/static/login.html';
}