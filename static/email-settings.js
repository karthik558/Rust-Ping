document.addEventListener('DOMContentLoaded', function() {
    loadEmailSettings();

    document.getElementById('saveEmailSettingsButton').addEventListener('click', saveEmailSettings);
    document.getElementById('testEmailButton').addEventListener('click', sendTestEmail);
});

function loadEmailSettings() {
    fetch('/api/email-settings')
        .then(response => response.json())
        .then(data => {
            document.getElementById('smtpServer').value = data.smtp_server || '';
            document.getElementById('smtpPort').value = data.smtp_port || '';
            document.getElementById('smtpUsername').value = data.smtp_username || '';
            document.getElementById('fromEmail').value = data.from_email || '';
            document.getElementById('toEmail').value = data.to_email || '';
            document.getElementById('emailTemplate').value = data.email_template || '';
        })
        .catch(error => console.error('Error loading email settings:', error));
}

function saveEmailSettings() {
    const settings = {
        smtp_server: document.getElementById('smtpServer').value,
        smtp_port: document.getElementById('smtpPort').value,
        smtp_username: document.getElementById('smtpUsername').value,
        smtp_password: document.getElementById('smtpPassword').value,
        from_email: document.getElementById('fromEmail').value,
        to_email: document.getElementById('toEmail').value,
        email_template: document.getElementById('emailTemplate').value
    };

    // Validate required fields
    if (!settings.smtp_server || !settings.smtp_port || !settings.from_email || !settings.to_email) {
        showNotification('Please fill in all required fields', 'error');
        return;
    }

    fetch('/api/email-settings', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(settings)
    })
    .then(async response => {
        const contentType = response.headers.get('content-type');
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || `HTTP error! status: ${response.status}`);
        }
        if (contentType && contentType.includes('application/json')) {
            return response.json();
        }
        return { message: 'Settings saved successfully' };
    })
    .then(data => {
        showNotification('Email settings saved successfully!', 'success');
    })
    .catch(error => {
        console.error('Error saving email settings:', error);
        showNotification('Failed to save email settings: ' + error.message, 'error');
    });
}

function sendTestEmail() {
    // Validate that settings are saved before sending test email
    if (!document.getElementById('smtpServer').value) {
        showNotification('Please save email settings before sending test email', 'error');
        return;
    }

    fetch('/api/test-email', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        }
    })
    .then(async response => {
        const contentType = response.headers.get('content-type');
        if (!response.ok) {
            if (response.status === 404) {
                throw new Error('Email test endpoint not found. Please check if the server is running and configured correctly.');
            }
            const errorText = await response.text();
            throw new Error(errorText || `HTTP error! status: ${response.status}`);
        }
        if (contentType && contentType.includes('application/json')) {
            return response.json();
        }
        return { message: 'Test email sent successfully' };
    })
    .then(data => {
        showNotification('Test email sent successfully!', 'success');
    })
    .catch(error => {
        console.error('Error sending test email:', error);
        showNotification('Failed to send test email: ' + error.message, 'error');
    });
}

function showNotification(message, type) {
    const notificationDiv = document.createElement('div');
    notificationDiv.className = `notification ${type}`;
    notificationDiv.textContent = message;
    document.body.appendChild(notificationDiv);
    
    // Remove notification after 5 seconds
    setTimeout(() => {
        notificationDiv.remove();
    }, 5000);
}

// Function to send error logs via email
function sendErrorLogEmail(device) {
    const settings = JSON.parse(localStorage.getItem('emailSettings') || '{}');
    const template = settings.emailTemplate || '';
    
    const emailContent = template
        .replace('{device_name}', device.name)
        .replace('{status}', device.status)
        .replace('{ip_address}', device.ip)
        .replace('{timestamp}', new Date().toLocaleString());

    // Replace with actual API call to your backend
    fetch('/api/send-error-email', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            ...settings,
            content: emailContent
        })
    });
}
