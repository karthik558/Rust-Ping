let devices = [];
const LOCAL_STORAGE_KEY = 'rustping_devices';
const DEVICES_FILE_PATH = 'devices.json';
let initialDevicesLoaded = false;
let isEditing = false;
let editingDeviceId = null;

// Load devices on page load
document.addEventListener('DOMContentLoaded', () => {
    loadDevices();
    setupEventListeners();
    setupDarkMode();
    addRefreshButton();
    setInterval(synchronizeDevices, 30000);
    window.addEventListener('focus', synchronizeDevices);
});

function setupDarkMode() {
    const savedDarkMode = localStorage.getItem("darkMode");
    const toggleButton = document.querySelector(".dark-mode-toggle");
    const icon = toggleButton.querySelector("i");

    if (savedDarkMode === "true") {
        document.body.classList.add("dark-mode");
        toggleButton.classList.add("active");
        icon.classList.remove("fa-moon");
        icon.classList.add("fa-sun");
        
        // Update logo for dark mode
        const logoImage = document.getElementById("logoImage");
        if (logoImage) {
            logoImage.src = "logo-dark.png";
        }
    }
}

function toggleDarkMode() {
    const body = document.body;
    const toggleButton = document.querySelector(".dark-mode-toggle");
    const icon = toggleButton.querySelector("i");
    const logoImage = document.getElementById("logoImage");
    
    body.classList.toggle("dark-mode");
    toggleButton.classList.toggle("active");
    
    const isDarkMode = body.classList.contains("dark-mode");
    localStorage.setItem("darkMode", isDarkMode);
    
    // Update icon
    if (isDarkMode) {
        icon.classList.remove("fa-moon");
        icon.classList.add("fa-sun");
    } else {
        icon.classList.remove("fa-sun");
        icon.classList.add("fa-moon");
    }
    
    // Update logo
    if (logoImage) {
        logoImage.src = isDarkMode ? 'logo-light.png' : 'logo-dark.png';
    }
}

async function loadDevices() {
    let devicesChanged = false;
    let localDevices = [];
    let fileDevices = [];
    
    // First, try to get latest data from API/file
    try {
        // Try API endpoint first
        try {
            const response = await fetch('/devices');
            if (response.ok) {
                fileDevices = await response.json();
            } else {
                throw new Error('API not available');
            }
        } catch (apiError) {
            console.warn('API not available, falling back to file', apiError);
            
            // Fallback to static file if API fails
            const response = await fetch(DEVICES_FILE_PATH);
            if (response.ok) {
                fileDevices = await response.json();
            } else {
                throw new Error(`Failed to load devices: ${response.status}`);
            }
        }
    } catch (fileError) {
        console.warn('Could not load from file:', fileError);
    }
    
    // Check localStorage for any saved devices
    const savedDevicesJSON = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (savedDevicesJSON) {
        try {
            localDevices = JSON.parse(savedDevicesJSON);
        } catch (e) {
            console.error('Failed to parse localStorage devices', e);
            // Clear corrupt data
            localStorage.removeItem(LOCAL_STORAGE_KEY);
        }
    }
    
    // Decide which set of devices to use
    if (fileDevices.length > 0) {
        // Use file/API devices as the source of truth
        devices = fileDevices;
        
        // Update localStorage with latest from file/API
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(devices));
        
        // If we had local changes, let the user know they've been overwritten
        if (localDevices.length > 0 && JSON.stringify(localDevices) !== JSON.stringify(fileDevices)) {
            showNotification('Device list has been updated from server', 'info');
        }
    } else if (localDevices.length > 0) {
        // Fall back to localStorage if no file/API data is available
        devices = localDevices;
    } else {
        // If all else fails, start with an empty array
        devices = [];
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(devices));
    }
    
    renderDeviceList();
}

function setupEventListeners() {
    const form = document.getElementById('deviceForm');
    const httpCheckbox = form.querySelector('input[value="Http"]');
    const httpsCheckbox = form.querySelector('input[value="Https"]');
    const httpPathGroup = document.querySelector('.http-path-group');

    // Show/hide HTTP path field based on HTTP/HTTPS selection
    [httpCheckbox, httpsCheckbox].forEach(checkbox => {
        checkbox.addEventListener('change', () => {
            httpPathGroup.style.display = 
                (httpCheckbox.checked || httpsCheckbox.checked) ? 'block' : 'none';
        });
    });

    // Handle custom category selection
    const categorySelect = document.getElementById('deviceCategory');
    const customCategoryGroup = document.getElementById('customCategoryGroup');
    
    categorySelect.addEventListener('change', () => {
        if (categorySelect.value === 'Custom') {
            customCategoryGroup.style.display = 'block';
        } else {
            customCategoryGroup.style.display = 'none';
        }
    });

    // Load existing categories from devices
    loadExistingCategories();

    // Handle form submission
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // Get category - use custom category if selected
        let categoryValue;
        if (categorySelect.value === 'Custom') {
            categoryValue = document.getElementById('customCategory').value.trim();
            if (!categoryValue) {
                showNotification('Please enter a custom category name', 'error');
                return;
            }
        } else {
            categoryValue = categorySelect.value;
        }
        
        const newDevice = {
            name: document.getElementById('deviceName').value,
            ip: document.getElementById('deviceIP').value,
            category: categoryValue,
            sensors: Array.from(form.querySelectorAll('input[type="checkbox"]:checked'))
                .map(cb => cb.value),
        };

        // Handle HTTP path if needed
        if (newDevice.sensors.includes('Http') || newDevice.sensors.includes('Https')) {
            const httpPath = document.getElementById('httpPath').value;
            if (!httpPath) {
                showNotification('HTTP Path is required for HTTP/HTTPS sensors', 'error');
                return;
            }
            newDevice.http_path = httpPath;
        }

        // Add the device using our new function
        const success = await addDevice(newDevice);
        
        if (success) {
            // If successful, reset the form and update categories
            form.reset();
            customCategoryGroup.style.display = 'none';
            
            // Add the new category to the dropdown if it's custom
            if (categoryValue !== categorySelect.value) {
                const option = document.createElement('option');
                option.value = categoryValue;
                option.textContent = categoryValue;
                
                // Insert before the Custom option
                const customOption = Array.from(categorySelect.options)
                    .find(opt => opt.value === 'Custom');
                    
                if (customOption) {
                    categorySelect.insertBefore(option, customOption);
                } else {
                    categorySelect.appendChild(option);
                }
            }
        }
    });

    // Add cancel button handler
    document.getElementById('cancelButton').addEventListener('click', cancelEdit);
}

async function loadExistingCategories() {
    const categorySelect = document.getElementById('deviceCategory');
    const existingOptions = Array.from(categorySelect.options).map(opt => opt.value);
    
    try {
        // Get all devices 
        let deviceData;
        try {
            const response = await fetch('/devices');
            if (response.ok) {
                deviceData = await response.json();
            } else {
                throw new Error('Failed to fetch devices from API');
            }
        } catch (apiError) {
            console.warn('API not available, falling back to local storage or file');
            
            // Try localStorage first
            const savedDevices = localStorage.getItem('rustping_devices');
            if (savedDevices) {
                deviceData = JSON.parse(savedDevices);
            } else {
                // Finally try the static file
                try {
                    const response = await fetch('devices.json');
                    if (response.ok) {
                        deviceData = await response.json();
                    } else {
                        throw new Error('Failed to fetch devices from file');
                    }
                } catch (fileError) {
                    console.error('Could not load categories:', fileError);
                    return;
                }
            }
        }
        
        // Extract unique categories
        const categories = new Set();
        deviceData.forEach(device => {
            if (device.category && !existingOptions.includes(device.category)) {
                categories.add(device.category);
            }
        });
        
        // Add unique categories to select
        categories.forEach(category => {
            // Skip "Custom" since it's already in the dropdown
            if (category !== 'Custom' && !existingOptions.includes(category)) {
                const option = document.createElement('option');
                option.value = category;
                option.textContent = category;
                
                // Insert before the Custom option
                const customOption = Array.from(categorySelect.options)
                    .find(opt => opt.value === 'Custom');
                    
                if (customOption) {
                    categorySelect.insertBefore(option, customOption);
                } else {
                    categorySelect.appendChild(option);
                }
            }
        });
    } catch (error) {
        console.error('Error loading categories:', error);
    }
}

function renderDeviceList() {
    const deviceList = document.getElementById('deviceList');
    deviceList.innerHTML = '';

    devices.forEach((device, index) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${device.name}</td>
            <td>${device.ip}</td>
            <td>${device.category}</td>
            <td>${device.sensors.join(', ')}</td>
            <td>
                <button class="button icon-button edit-button" onclick="editDevice(${index})">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="button icon-button delete-button" onclick="removeDevice(${index})">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        `;
        deviceList.appendChild(row);
    });
}

async function addDevice(newDevice) {
    try {
        // First try API, which updates the server's devices.json
        try {
            const response = await fetch('/devices', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(newDevice)
            });
            
            if (response.ok) {
                // API success - server will update devices.json
                showNotification('Device added successfully to server', 'success');
            } else {
                throw new Error('API call failed');
            }
        } catch (apiError) {
            console.warn('API not available, falling back to local storage', apiError);
            // Add to devices array locally only
            devices.push(newDevice);
            
            // Save to localStorage
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(devices));
            showNotification('Device added locally (server unavailable)', 'info');
        }
        
        // Always update the UI immediately
        renderDeviceList();
        return true;
    } catch (error) {
        console.error('Error adding device:', error);
        showNotification('Failed to add device: ' + error.message, 'error');
        return false;
    }
}

async function removeDevice(index) {
    if (!confirm('Are you sure you want to remove this device?')) return;

    try {
        // Get device info before removing (for messages)
        const deviceName = devices[index].name;
        
        // Try API call first
        let apiSuccess = false;
        try {
            const response = await fetch(`/devices/${index}`, { method: 'DELETE' });
            if (response.ok) {
                apiSuccess = true;
                showNotification(`Device "${deviceName}" removed from server`, 'success');
            } else {
                throw new Error(`Server returned ${response.status}`);
            }
        } catch (apiError) {
            console.warn('API call failed, removing locally only', apiError);
            
            // Remove locally if API fails
            devices.splice(index, 1);
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(devices));
            showNotification(`Device "${deviceName}" removed locally (server unavailable)`, 'info');
        }
        
        // Always update the UI
        renderDeviceList();
        
    } catch (error) {
        console.error('Error removing device:', error);
        showNotification('Failed to remove device: ' + error.message, 'error');
    }
}

function showNotification(message, type) {
    // Remove any existing notifications
    const existingNotifications = document.querySelectorAll('.notification');
    existingNotifications.forEach(notification => notification.remove());
    
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.classList.add('fade-out');
        setTimeout(() => {
            notification.remove();
        }, 300);
    }, 3000);
}

// Add a download button to export devices to JSON file
document.addEventListener('DOMContentLoaded', () => {
    const exportSection = document.createElement('div');
    exportSection.className = 'export-section';
    exportSection.innerHTML = `
        <button id="exportButton" class="button export-button">
            <i class="fas fa-download"></i> Export Devices
        </button>
    `;
    
    document.querySelector('.device-management-section').appendChild(exportSection);
    
    document.getElementById('exportButton').addEventListener('click', () => {
        const json = JSON.stringify(devices, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = 'devices.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    });
});

async function synchronizeDevices() {
    try {
        // Try API first
        try {
            const response = await fetch('/devices');
            if (response.ok) {
                const apiDevices = await response.json();
                
                // Check if devices are actually different
                if (JSON.stringify(devices) !== JSON.stringify(apiDevices)) {
                    devices = apiDevices;
                    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(devices));
                    renderDeviceList();
                }
                return;
            }
        } catch (apiError) {
            console.warn('API not available, trying file', apiError);
        }
        
        // Fall back to file
        const response = await fetch(DEVICES_FILE_PATH);
        if (!response.ok) {
            throw new Error(`Failed to load devices: ${response.status}`);
        }
        
        const fileDevices = await response.json();
        
        // Check if devices are actually different
        if (JSON.stringify(devices) !== JSON.stringify(fileDevices)) {
            devices = fileDevices;
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(devices));
            renderDeviceList();
        }
    } catch (error) {
        console.warn('Could not synchronize devices:', error);
    }
}

function addRefreshButton() {
    const deviceListHeader = document.querySelector('.card h2.section-title');
    if (deviceListHeader) {
        const refreshButton = document.createElement('button');
        refreshButton.className = 'refresh-button';
        refreshButton.innerHTML = '<i class="fas fa-sync"></i>';
        refreshButton.title = 'Refresh device list from server';
        
        refreshButton.onclick = async () => {
            // Visual feedback - add spinning class
            refreshButton.classList.add('spinning');
            
            try {
                await synchronizeDevices();
                showNotification('Device list refreshed from server', 'info');
            } catch (error) {
                showNotification('Failed to refresh device list', 'error');
            } finally {
                // Remove spinning class after a delay
                setTimeout(() => {
                    refreshButton.classList.remove('spinning');
                }, 500);
            }
        };
        
        // Create a container for the header and button
        const headerContainer = document.createElement('div');
        headerContainer.className = 'header-container';
        
        // Replace the header with our container
        deviceListHeader.parentNode.insertBefore(headerContainer, deviceListHeader);
        headerContainer.appendChild(deviceListHeader);
        headerContainer.appendChild(refreshButton);
    }
}

// Function to reload the current page
function reloadCurrentPage() {
    window.location.reload();
}

// Check authentication and setup inactivity detection
document.addEventListener('DOMContentLoaded', function () {
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

let editingIndex = null;

function editDevice(index) {
    isEditing = true;
    editingIndex = index;
    const device = devices[index];

    // Update form UI
    document.getElementById('formTitle').textContent = 'Edit Device';
    document.getElementById('submitButtonText').textContent = 'Update Device';
    document.getElementById('cancelButton').style.display = 'inline-flex';

    // Fill form with device data
    document.getElementById('deviceName').value = device.name;
    document.getElementById('deviceIP').value = device.ip;
    document.getElementById('deviceCategory').value = device.category;

    // Handle sensors
    const checkboxes = document.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(cb => {
        cb.checked = device.sensors.includes(cb.value);
    });

    // Handle HTTP path
    const httpPathGroup = document.querySelector('.http-path-group');
    const hasHttp = device.sensors.includes('Http') || device.sensors.includes('Https');
    httpPathGroup.style.display = hasHttp ? 'block' : 'none';
    if (hasHttp) {
        document.getElementById('httpPath').value = device.http_path || '';
    }

    // Scroll to form
    document.getElementById('deviceForm').scrollIntoView({ behavior: 'smooth' });
}

// Update form submission handler
document.getElementById('deviceForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const formData = {
        name: document.getElementById('deviceName').value,
        ip: document.getElementById('deviceIP').value,
        category: document.getElementById('deviceCategory').value === 'Custom' 
            ? document.getElementById('customCategory').value 
            : document.getElementById('deviceCategory').value,
        sensors: Array.from(document.querySelectorAll('input[type="checkbox"]:checked'))
            .map(cb => cb.value),
        http_path: document.getElementById('httpPath').value || null
    };

    try {
        if (isEditing && editingIndex !== null) {
            // Update existing device
            const response = await fetch(`/devices/${editingIndex}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });

            if (!response.ok) throw new Error('Failed to update device');
            
            // Update local array
            devices[editingIndex] = formData;
            showNotification('Device updated successfully', 'success');
        } else {
            // Add new device
            const response = await fetch('/devices', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });

            if (!response.ok) throw new Error('Failed to add device');
            
            devices.push(formData);
            showNotification('Device added successfully', 'success');
        }

        // Reset form and update UI
        cancelEdit();
        await loadDevices(); // Refresh the device list
    } catch (error) {
        console.error('Error:', error);
        showNotification(error.message, 'error');
    }
});

function cancelEdit() {
    isEditing = false;
    editingIndex = null;
    
    document.getElementById('formTitle').textContent = 'Add Device';
    document.getElementById('submitButtonText').textContent = 'Add Device';
    document.getElementById('cancelButton').style.display = 'none';
    document.getElementById('deviceForm').reset();
    
    document.querySelector('.http-path-group').style.display = 'none';
}

// Add cancel button handler
document.getElementById('cancelButton').addEventListener('click', cancelEdit);