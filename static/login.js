// login.js - JavaScript for the login page

// Add this function for password hashing
async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Handle authentication
async function handleLogin(event) {
    event.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    // Hash the input password
    const hashedPassword = await hashPassword(password);
    
    // Compare with stored hash from config
    if (username === AUTH_CONFIG.username && hashedPassword === AUTH_CONFIG.passwordHash) {
        // Set authentication cookie with 2-minute expiration
        document.cookie = `auth=true;max-age=120;path=/`;

        // Show welcome overlay
        const overlay = document.getElementById('welcomeOverlay');
        overlay.classList.add('show');

        // Wait 2 seconds then redirect
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Fade out
        overlay.style.opacity = '0';

        // Wait for fade out animation
        await new Promise(resolve => setTimeout(resolve, 300));

        // Redirect to dashboard
        window.location.href = '/static/index.html';
    } else {
        const errorMsg = document.getElementById('errorMessage');
        errorMsg.textContent = 'Invalid username or password';
        errorMsg.style.display = 'block';
    }
    return false;
}

// Check session timeout
function checkSession() {
  if (!document.cookie.includes('auth=true')) {
    window.location.href = '/static/login.html'; // Redirect to login if not authenticated.  Corrected path.
  }
}

// Check authentication status every 2 minutes (1500000ms) - Using setInterval
setInterval(checkSession, 1500000);


// --- Dark Mode Toggle ---
function toggleDarkMode() {
  const body = document.body;
  body.classList.toggle('dark-mode');
  const darkModeToggle = document.querySelector('.dark-mode-toggle');
  darkModeToggle.classList.toggle('active');

  const icon = darkModeToggle.querySelector('i');
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

// Function to update logo based on dark mode
function updateLogo(isDarkMode) {
  const logoImage = document.getElementById('logoImage');
  if (isDarkMode) {
    logoImage.src = 'logo-dark.png';
  } else {
    logoImage.src = 'logo-light.png';
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
  }

  // --- Forgot Password Link ---  (Moved inside DOMContentLoaded)
  const forgotPasswordLink = document.getElementById('forgotPasswordLink');
  if (forgotPasswordLink) { // Check if the element exists
    forgotPasswordLink.addEventListener('click', function (event) {
      event.preventDefault(); // Prevent default link behavior
      window.location.href = 'https://karthiklal.in/contact.html';
    });
  }
});