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
        statusMessage.classList.remove('error'); // Remove error class
        statusMessage.classList.add('success');
        statusMessage.classList.add('show');     // Show the message
    }

    function showErrorMessage(message) {
        statusMessage.textContent = message;
        statusMessage.classList.remove('success'); // Remove success class
        statusMessage.classList.add('error');
        statusMessage.classList.add('show');     // Show the message
    }

    function hideStatusMessage() {
        statusMessage.classList.remove('show');
    }
    // --- End Helper Functions ---


    if (newPassword !== confirmPassword) {
        showErrorMessage('Passwords do not match'); // Use helper function
        return;
    }

    if (checkPasswordStrength(newPassword) < 3) {
        showErrorMessage('Password is not strong enough'); // Use helper function
        return;
    }

    try {
        const hashedPassword = await hashPassword(newPassword);

        // Update config.js with new hash
        const response = await fetch('/update-password', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ hash: hashedPassword })
        });

        if (response.ok) {
            showSuccessMessage('Password updated successfully'); // Use helper function
            setTimeout(() => {
                window.location.href = '/static/index.html';  //or '/'; //redirect to home page
            }, 2000);
        } else {
            // Get more detailed error information from the server if possible
            const errorData = await response.json().catch(() => null); // Try to parse as JSON
            const errorMessage = errorData?.message || 'Failed to update password'; // Use server message or default
            showErrorMessage(errorMessage);
        }
    } catch (error) {
        showErrorMessage('Failed to update password: ' + error.message); // Use helper function
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