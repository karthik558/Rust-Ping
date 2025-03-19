let selectedDevice = null;
let bandwidthChart;
let devicePieChart;
let devicesData = [];
let isFetching = false;
let sortOrder = {}; // Keep track of sorting
let currentCategory = 'all';
let deviceStatuses = new Map();
let categoryHealthChart = null;
let categoryHealthData = {
  labels: [],
  datasets: [
    {
      label: 'Up',
      data: []
    },
    {
      label: 'Down',
      data: []
    },
    {
      label: 'Unknown',
      data: []
    }
  ]
};

// Device Status Management
let updateInterval = 30000; // 30 seconds
let isUpdating = false;
let updateIndicator = document.getElementById('updateIndicator');
let refreshButton = document.getElementById('refreshButton');

function showUpdateIndicator() {
    if (updateIndicator) {
        updateIndicator.style.display = 'inline-flex';
        if (refreshButton) {
            refreshButton.classList.add('updating');
            refreshButton.disabled = true;
        }
    }
}

function hideUpdateIndicator() {
    if (updateIndicator) {
        updateIndicator.style.display = 'none';
        if (refreshButton) {
            refreshButton.classList.remove('updating');
            refreshButton.disabled = false;
        }
    }
}

async function fetchDevices() {
  if (isFetching) return;
  isFetching = true;
  try {
    const response = await fetch('/devices');
    const devices = await response.json();
    devicesData = devices;
    renderData(devices);
  } catch (error) {
    console.error("Error fetching devices:", error);
    alert("Failed to fetch device data. Please check your connection and try again.");
  } finally {
    isFetching = false;
  }
}

function renderData(devices) {
  updateTable(devices);
  updateBandwidthChart(devices);
  updateCategoryHealthChart(devices);
  // Update pie chart if a device is selected, otherwise clear it.
  if (selectedDevice) {
    const device = devices.find(d => d.name === selectedDevice.name);
    if (device) {
      updatePieChart(device);
      selectedDevice = device; // Update selectedDevice with latest data
    } else {
      clearPieChart(); // Clear if selected device is no longer in the list.
      selectedDevice = null; // Reset selected device.
    }
  } else {
    clearPieChart(); // No device selected, clear the chart
  }
}

// Add this function to generate category buttons
function updateCategoryButtons(devices) {
  const categories = [...new Set(devices.map(device => device.category))];
  const buttonContainer = document.querySelector('.category-buttons');

  // Only update category buttons if they don't exist
  if (buttonContainer.children.length <= 1) { // Account for "All Devices" button
    // Keep the existing "All Devices" button
    const existingButtons = buttonContainer.innerHTML;

    // Add category-specific buttons
    const newButtons = categories.map(category => `
          <button class="category-btn btn btn-primary" data-category="${category}">${category}</button>
      `).join('');

    buttonContainer.innerHTML = existingButtons + newButtons;

    // Add click handlers to all buttons
    buttonContainer.querySelectorAll('.category-btn').forEach(button => {
      button.onclick = () => filterByCategory(button.getAttribute('data-category'));
    });
  }
}

// Update the category filter function
function filterByCategory(category) {
  currentCategory = category;
  const buttons = document.querySelectorAll('.category-btn');

  // Update button states
  buttons.forEach(btn => {
    if (btn.getAttribute('data-category') === category) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Filter table rows
  const rows = document.querySelectorAll('#devices-table tbody tr');
  rows.forEach(row => {
    if (category === 'all' || row.getAttribute('data-category') === category) {
      row.style.display = '';
    } else {
      row.style.display = 'none';
    }
  });
}

function updateTable(devices) {
  const tbody = document.querySelector("#devices-table tbody");
  tbody.innerHTML = ""; // Clear existing rows

  devices.forEach(device => {
    const tr = document.createElement("tr");
    tr.setAttribute('data-category', device.category);
    tr.addEventListener("click", () => {
      // Handle row click:  Update selected device and pie chart.
      if (selectedDevice && selectedDevice.name === device.name) {
        // Clicking the same row again deselects it.
        selectedDevice = null;
        clearPieChart();
        tr.classList.remove("selected-row"); // Remove highlight
      } else {
        // Deselect any previously selected row.
        if (selectedDevice) {
          const prevSelectedRow = document.querySelector(".selected-row");
          if (prevSelectedRow) {
            prevSelectedRow.classList.remove("selected-row");
          }
        }
        selectedDevice = device;
        updatePieChart(device);
        tr.classList.add("selected-row"); // Highlight selected row
      }
    });

    // Helper function to create table cells.
    const addCell = (content, isStatus = false) => {
      const td = document.createElement("td");
      td.innerHTML = isStatus ? content : (content || "-"); // Use innerHTML for status.
      tr.appendChild(td);
      return td;
    };

    addCell(device.name);
    addCell(device.ip);

    const sensorTd = document.createElement("td");
    if (Array.isArray(device.sensors)) {
      device.sensors.forEach(sensor => {
        const span = document.createElement("span");
        span.className = "sensor-box badge badge-primary";
        span.textContent = sensor;
        sensorTd.appendChild(span);
      });
    } else {
      sensorTd.textContent = "-";
    }
    tr.appendChild(sensorTd);

    const pingStatus = device.ping_status;
    const pingStatusClass = pingStatus === true ? "success" : pingStatus === false ? "danger" : "warning";
    const pingStatusText = pingStatus === true ? "OK" : pingStatus === false ? "Fail" : "Unknown";
    addCell(`<span class="status-dot badge badge-${pingStatusClass}"></span>${pingStatusText}`, true);

    addCell(device.bandwidth_usage ? device.bandwidth_usage.toFixed(2) : "-");

    const httpStatus = device.http_status;
    const httpStatusClass = httpStatus === true ? "success" : httpStatus === false ? "danger" : "warning";
    const httpStatusText = httpStatus === true ? "OK" : httpStatus === false ? "Fail" : "Unknown";
    addCell(`<span class="status-dot badge badge-${httpStatusClass}"></span>${httpStatusText}`, true);

    tbody.appendChild(tr);

    // If this row corresponds to the currently selected device, highlight it.
    if (selectedDevice && selectedDevice.name === device.name) {
      tr.classList.add("selected-row");
    }
  });

  updateCategoryButtons(devices);
  filterByCategory(currentCategory); // Reapply category filter
}

function updateBandwidthChart(devices) {
  const ctx = document.getElementById('bandwidthChart').getContext('2d');
  const labels = devices.map(d => d.name);
  const data = devices.map(d => d.bandwidth_usage || 0);
  const isDarkMode = document.body.classList.contains('dark-mode');
  const backgroundColor = isDarkMode ? 'rgba(108, 117, 125, 0.7)' : 'rgba(9, 105, 218, 0.2)'; // GitHub-like colors
  const borderColor = isDarkMode ? 'rgba(108, 117, 125, 1)' : 'rgba(9, 105, 218, 1)';


  if (bandwidthChart) {
    // Update existing chart
    bandwidthChart.data.labels = labels;
    bandwidthChart.data.datasets[0].data = data;
    bandwidthChart.data.datasets[0].backgroundColor = backgroundColor;
    bandwidthChart.data.datasets[0].borderColor = borderColor;
    bandwidthChart.update();
  } else {
    // Create new chart
    bandwidthChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Bandwidth Usage (Mbps)',
          data: data,
          backgroundColor: backgroundColor,
          borderColor: borderColor,
          borderWidth: 1,
          borderRadius: 4, // Consistent border radius
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            grid: {
              color: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)', // Dynamic grid color
            },
            ticks: {
              color: isDarkMode ? '#c9d1d9' : '#24292f', // GitHub text color
            }
          },
          x: {
            grid: {
              display: false
            },
            ticks: {
              color: isDarkMode ? '#c9d1d9' : '#24292f', // GitHub text color
            }
          }
        },
        plugins: {
          legend: {
            display: false, // Hide legend
          },
          tooltip: { // Style the tooltip
            backgroundColor: isDarkMode ? '#161b22' : '#fff',  // GitHub card bg
            bodyColor: isDarkMode ? '#c9d1d9' : '#24292f',
            borderColor: isDarkMode ? '#30363d' : '#d0d7de',
            borderWidth: 1,
            padding: 10,
          }
        }
      }
    });
  }
}

function clearPieChart() {
  if (devicePieChart) {
    devicePieChart.data.labels = [];
    devicePieChart.data.datasets[0].data = [];
    devicePieChart.update();
  }
}

function updatePieChart(device) {
  if (!device || !Array.isArray(device.sensors) || device.sensors.length === 0) {
    clearPieChart();
    return;
  }

  const ctx = document.getElementById('devicePieChart').getContext('2d');
  const labels = device.sensors;
  const data = device.sensors.map(() => 1); // Equal distribution
  const isDarkMode = document.body.classList.contains('dark-mode');

  const backgroundColors = [  // GitHub-inspired colors
    'rgba(9, 105, 218, 0.7)',   // Blue
    'rgba(45, 164, 78, 0.7)',   // Green
    'rgba(209, 134, 22, 0.7)',  // Orange
    'rgba(207, 34, 46, 0.7)',    // Red
    'rgba(125, 133, 144, 0.7)', // Gray
    'rgba(163, 113, 247, 0.7)',  // Purple
    'rgba(242, 201, 76, 0.7)',    // Yellow
    'rgba(219, 225, 235, 0.7)' // Light Gray
  ];
  const usedColors = labels.map(
    (_, index) => backgroundColors[index % backgroundColors.length]
  );

  if (devicePieChart) {
    // Update existing chart
    devicePieChart.data.labels = labels;
    devicePieChart.data.datasets[0].data = data;
    devicePieChart.data.datasets[0].backgroundColor = usedColors;
    devicePieChart.update();
  } else {
    // Create new chart
    devicePieChart = new Chart(ctx, {
      type: 'pie',
      data: {
        labels: labels,
        datasets: [{
          label: 'Sensor Distribution',
          data: data,
          backgroundColor: usedColors,
          borderWidth: 1,
          borderColor: isDarkMode ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)',
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: isDarkMode ? '#c9d1d9' : '#24292f', // GitHub text color
            }
          },
          tooltip: { // Style the tooltip
            backgroundColor: isDarkMode ? '#161b22' : '#fff',  // GitHub card bg
            bodyColor: isDarkMode ? '#c9d1d9' : '#24292f',
            borderColor: isDarkMode ? '#30363d' : '#d0d7de',
            borderWidth: 1,
            padding: 10,
          }
        }
      }
    });
  }
}

// Function to update the logo based on dark mode
function updateLogo(isDarkMode) {
  const logo = document.getElementById('logoImage');
  if (logo) {
    logo.src = isDarkMode ? 'logo-dark.png' : 'logo-light.png'; // Use correct paths
  }
}

function toggleDarkMode() {
  const toggleButton = document.querySelector(".dark-mode-toggle");
  const isDarkMode = document.body.classList.toggle("dark-mode");
  toggleButton.classList.toggle("active", isDarkMode);

  // Correctly toggle the icon and its rotation
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


  // Save preference to localStorage
  localStorage.setItem("darkMode", isDarkMode ? "true" : "false");
  updateChartsForDarkMode(); // Update chart colors
  updateLogo(isDarkMode); //  update logo
}

function updateChartsForDarkMode() {
  const isDarkMode = document.body.classList.contains('dark-mode');
  const gridColor = isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)";
  const backgroundColor = isDarkMode ? 'rgba(108, 117, 125, 0.7)' : 'rgba(9, 105, 218, 0.2)'; // GitHub-like colors
  const borderColor = isDarkMode ? 'rgba(108, 117, 125, 1)' : 'rgba(9, 105, 218, 1)';
  if (bandwidthChart) {
    bandwidthChart.options.scales.y.grid.color = gridColor;
    bandwidthChart.data.datasets[0].backgroundColor = backgroundColor;
    bandwidthChart.data.datasets[0].borderColor = borderColor;
    bandwidthChart.options.scales.x.ticks.color = isDarkMode ? '#c9d1d9' : '#24292f';
    bandwidthChart.options.scales.y.ticks.color = isDarkMode ? '#c9d1d9' : '#24292f';
    bandwidthChart.options.plugins.tooltip.backgroundColor = isDarkMode ? '#161b22' : '#fff';
    bandwidthChart.options.plugins.tooltip.bodyColor = isDarkMode ? '#c9d1d9' : '#24292f';
    bandwidthChart.options.plugins.tooltip.borderColor = isDarkMode ? '#30363d' : '#d0d7de';
    bandwidthChart.update();
  }

  if (devicePieChart) {
    devicePieChart.options.plugins.legend.labels.color = isDarkMode ? '#c9d1d9' : '#24292f';
    devicePieChart.data.datasets[0].borderColor = isDarkMode ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)';
    devicePieChart.options.plugins.tooltip.backgroundColor = isDarkMode ? '#161b22' : '#fff';
    devicePieChart.options.plugins.tooltip.bodyColor = isDarkMode ? '#c9d1d9' : '#24292f';
    devicePieChart.options.plugins.tooltip.borderColor = isDarkMode ? '#30363d' : '#d0d7de';
    devicePieChart.update();
  }

  //Update category health chart for dark mode
  if (categoryHealthChart) {
    updateCategoryHealthChart(devicesData);
  }
}

function generateLog() {
  const devices = document.getElementById("logDevices").value;
  const startDate = document.getElementById("startDate").value;
  const endDate = document.getElementById("endDate").value;
  const logFormat = document.getElementById("logFormat").value;

  const params = new URLSearchParams();
  if (devices) params.append("devices", devices);
  if (startDate) params.append("start_date", startDate);
  if (endDate) params.append("end_date", endDate);
  params.append("format", logFormat); // Always include format

  fetch(`/export_log?${params.toString()}`)
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`); // Handle HTTP errors
      }
      return response.text();
    })
    .then(text => {
      const blob = new Blob([text], { type: logFormat === "csv" ? "text/csv" : "text/plain" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const now = new Date();
      link.download = `rustPing_log_${now.toISOString().slice(0, 10)}.${logFormat}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    })
    .catch(error => {
      console.error("Error generating log export:", error);
      alert("Error generating log export.  See console for details."); // User-friendly error
    });
}

function handleFilter() {
  const filterText = document.getElementById("filterInput").value.toLowerCase();
  const filteredDevices = devicesData.filter(device =>
    device.name.toLowerCase().includes(filterText) ||
    device.ip.toLowerCase().includes(filterText)
  );
  renderData(filteredDevices);
}


// Event Listeners
document.getElementById("filterButton").addEventListener("click", handleFilter);

document.getElementById("filterInput").addEventListener("keyup", event => {
  if (event.key === "Enter") {
    handleFilter();
  }
});

document.getElementById("clearFilterButton").addEventListener("click", () => {
  document.getElementById("filterInput").value = "";
  renderData(devicesData); // Show all devices
});

document.getElementById("generateLogButton").addEventListener("click", generateLog);

// Table sorting functionality
document.querySelectorAll('#devices-table th.sortable').forEach(header => {
  header.addEventListener('click', () => {
    const sortKey = header.dataset.sort;
    sortOrder[sortKey] = sortOrder[sortKey] === 'asc' ? 'desc' : 'asc'; // Toggle sort order
    sortData(sortKey, sortOrder[sortKey]);
    updateSortIcons(); // Call updateSortIcons after sorting
  });
});

function sortData(key, order) {
  const sortedDevices = [...devicesData].sort((a, b) => {
    const valA = a[key] ?? ''; // Handle undefined/null values
    const valB = b[key] ?? '';

    if (key === 'bandwidth_usage') { // Numerical sort for bandwidth
      return (parseFloat(valA) - parseFloat(valB)) * (order === 'asc' ? 1 : -1);
    }
    if (key === 'ping_status' || key === 'http_status') {
      // Custom sorting for status: OK > Unknown > Fail
      const statusOrder = { 'true': 1, 'undefined': 2, 'false': 3 };
      const orderA = statusOrder[String(valA)]; // Convert to string for consistent lookup
      const orderB = statusOrder[String(valB)];
      return (orderA - orderB) * (order === 'asc' ? 1 : -1);
    }

    return valA.toString().localeCompare(valB.toString()) * (order === 'asc' ? 1 : -1);
  });
  renderData(sortedDevices);
}

// Function to update sort icons
function updateSortIcons() {
  document.querySelectorAll('#devices-table th.sortable').forEach(header => {
    const icon = header.querySelector('i');
    const sortKey = header.dataset.sort;

    // Remove existing sort classes
    icon.classList.remove('fa-sort-up', 'fa-sort-down', 'fa-sort');

    // Add the appropriate class based on the current sort order
    if (sortOrder[sortKey] === 'asc') {
      icon.classList.add('fa-sort-up');
    } else if (sortOrder[sortKey] === 'desc') {
      icon.classList.add('fa-sort-down');
    } else {
      icon.classList.add('fa-sort'); // Default sort icon
    }
  });
}

// Initial setup
document.addEventListener("DOMContentLoaded", () => {
  // Apply dark mode preference.
  const savedDarkMode = localStorage.getItem("darkMode");
  const toggleButton = document.querySelector(".dark-mode-toggle");
  const icon = toggleButton.querySelector("i");

  if (savedDarkMode === "true") {
    document.body.classList.add("dark-mode");
    toggleButton.classList.add("active");
    icon.classList.remove("fa-moon");
    icon.classList.add("fa-sun");
    icon.style.transform = "rotate(180deg)";
  } else {
    // Ensure icon is set to moon if not in dark mode
    icon.classList.remove("fa-sun");
    icon.classList.add("fa-moon");
    icon.style.transform = "rotate(0deg)";
  }

  //logo change
  updateLogo(savedDarkMode === "true");

  // Initialize all charts
  initCategoryHealthChart();

  // Fetch devices and update UI
  fetchDevices();
  setInterval(fetchDevices, 15000); // Fetch data every 15 seconds
  updateSortIcons();

  // Initialize category filter
  const allDevicesBtn = document.querySelector('[data-category="all"]');
  if (allDevicesBtn) {
    allDevicesBtn.onclick = () => filterByCategory('all');
  }

  // Check user role and update UI
  checkUserRole();

  // Update navigation with logout button
  updateNavigation();
});

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
  localStorage.removeItem('currentUser');
  window.location.href = '/static/login.html';
}

function resetPassword() {
  // Show password reset confirmation
  if (confirm("Do you want to reset your password?")) {
    window.location.href = "/static/password-manager.html";
  }
}

async function fetchDeviceStatuses() {
    if (isUpdating) return;
    isUpdating = true;
    showUpdateIndicator();

    try {
        const response = await fetch('/api/devices/status');
        if (!response.ok) throw new Error('Failed to fetch device statuses');
        const newStatuses = await response.json();

        // Only update the UI if there are significant changes
        let hasChanges = false;
        for (const [deviceName, status] of Object.entries(newStatuses)) {
            const lastStatus = deviceStatuses.get(deviceName);
            const hasSignificantChange = !lastStatus || 
                lastStatus.ping_status !== status.ping_status ||
                lastStatus.http_status !== status.http_status ||
                lastStatus.down !== status.down;

            if (hasSignificantChange) {
                hasChanges = true;
                deviceStatuses.set(deviceName, status);
                updateDeviceRow(deviceName, status);
            }
        }

        // Only update charts if there are significant changes
        if (hasChanges) {
            updateBandwidthChart(devicesData);
            updateCategoryHealthChart(devicesData);
        }
    } catch (error) {
        console.error('Error fetching device statuses:', error);
    } finally {
        isUpdating = false;
        hideUpdateIndicator();
    }
}

function updateDeviceRow(deviceName, status) {
    const row = document.querySelector(`tr[data-device="${deviceName}"]`);
    if (!row) return;

    // Update status indicators
    const pingStatus = row.querySelector('.ping-status');
    const httpStatus = row.querySelector('.http-status');
    const bandwidthStatus = row.querySelector('.bandwidth-status');

    // Only update if there's a significant change
    if (pingStatus) {
        const currentPingStatus = pingStatus.textContent.trim();
        if (currentPingStatus !== status.ping_status) {
            pingStatus.textContent = status.ping_status;
            pingStatus.className = `ping-status status-indicator ${status.ping_status.toLowerCase() === 'fail' ? 'status-fail' : 'status-success'}`;
        }
    }

    if (httpStatus) {
        const currentHttpStatus = httpStatus.textContent.trim();
        if (currentHttpStatus !== status.http_status) {
            httpStatus.textContent = status.http_status;
            httpStatus.className = `http-status status-indicator ${status.http_status.toLowerCase() === 'fail' ? 'status-fail' : 'status-success'}`;
        }
    }

    if (bandwidthStatus) {
        const currentBandwidth = bandwidthStatus.textContent.trim();
        if (currentBandwidth !== status.bandwidth_usage) {
            bandwidthStatus.textContent = status.bandwidth_usage;
        }
    }

    // Update row status
    row.classList.toggle('device-down', status.down);
}

// Initialize device statuses
async function initializeDeviceStatuses() {
    try {
        const response = await fetch('/api/devices/status');
        if (!response.ok) throw new Error('Failed to fetch initial device statuses');
        const statuses = await response.json();
        
        for (const [deviceName, status] of Object.entries(statuses)) {
            deviceStatuses.set(deviceName, status);
            updateDeviceRow(deviceName, status);
        }
    } catch (error) {
        console.error('Error initializing device statuses:', error);
    }
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    // Initialize device statuses
    initializeDeviceStatuses();

    // Set up automatic updates
    setInterval(fetchDeviceStatuses, updateInterval);

    // Add click handler for refresh button
    if (refreshButton) {
        refreshButton.addEventListener('click', () => {
            if (!isUpdating) {
                fetchDeviceStatuses();
            }
        });
    }
});

function initCategoryHealthChart() {
  const ctx = document.getElementById('categoryHealthChart');
  if (!ctx) {
    console.error("Category health chart canvas element not found.");
    return;
  }

  if (categoryHealthChart) {
    categoryHealthChart.destroy();
  }
  const isDarkMode = document.body.classList.contains('dark-mode');

  categoryHealthChart = new Chart(ctx, {
    type: 'bar',
    data: categoryHealthData,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y',
      plugins: {
        legend: {
          position: 'top',
          labels: {
            color: isDarkMode ? '#c9d1d9' : '#24292f',
          }
        },
        tooltip: {
          backgroundColor: isDarkMode ? '#161b22' : '#fff',
          bodyColor: isDarkMode ? '#c9d1d9' : '#24292f',
          borderColor: isDarkMode ? '#30363d' : '#d0d7de',
          borderWidth: 1,
          padding: 10,
          callbacks: {
            label: function (context) {
              return context.dataset.label + ': ' + context.raw + ' devices';
            }
          }
        }
      },
      scales: {
        x: {
          stacked: true,
          title: {
            display: true,
            color: isDarkMode ? '#c9d1d9' : '#24292f',
          },
          ticks: {
            color: isDarkMode ? '#c9d1d9' : '#24292f',
          },
          grid: {
            color: isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)",
          }
        },
        y: {
          stacked: true,
          title: {
            display: true,
            color: isDarkMode ? '#c9d1d9' : '#24292f',
          },
          ticks: {
            color: isDarkMode ? '#c9d1d9' : '#24292f',
          },
          grid: {
            color: isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)",
          }
        }
      }
    }
  });
}

function updateCategoryHealthChart(devices) {
  if (!categoryHealthChart) {
    console.warn("Category health chart not initialized.  Initializing now.");
    initCategoryHealthChart();
    return;
  }

  // 1. Reset Data:  *Crucially*, reset the chart data *before* populating it.
  categoryHealthData.labels = [];
  categoryHealthData.datasets.forEach(dataset => {
    dataset.data = [];
  });

  // 2. Group by Category and Status
  const categories = {};
  devices.forEach(device => {
    const category = device.category || "Unknown";
    if (!categories[category]) {
      categories[category] = { up: 0, down: 0, unknown: 0 };
    }
    // Use the consistent ping_status for health.
    if (device.ping_status === true) {
      categories[category].up++;
    } else if (device.ping_status === false) {
      categories[category].down++;
    } else {
      categories[category].unknown++;
    }
  });

  // 3. Prepare Data for Chart
  const categoryLabels = Object.keys(categories);
  const upData = [];
  const downData = [];
  const unknownData = [];

  categoryLabels.forEach(category => {
    upData.push(categories[category].up);
    downData.push(categories[category].down);
    unknownData.push(categories[category].unknown);
  });

  // 4. Update Chart Data
  categoryHealthData.labels = categoryLabels;
  categoryHealthData.datasets[0].data = upData;
  categoryHealthData.datasets[1].data = downData;
  categoryHealthData.datasets[2].data = unknownData;

  // 5. Update Chart Colors and Styles for Dark Mode *BEFORE* updating.
  const isDarkMode = document.body.classList.contains('dark-mode');

  // Define colors based on dark mode
  const upColor = isDarkMode ? 'rgba(40, 167, 69, 0.8)' : 'rgba(34, 139, 34, 0.8)';
  const downColor = isDarkMode ? 'rgba(220, 53, 69, 0.8)' : 'rgba(178, 34, 34, 0.8)';
  const unknownColor = isDarkMode ? 'rgba(255, 193, 7, 0.8)' : 'rgba(255, 165, 0, 0.8)';

  // Update dataset background colors
  categoryHealthChart.data.datasets[0].backgroundColor = upColor;
  categoryHealthChart.data.datasets[1].backgroundColor = downColor;
  categoryHealthChart.data.datasets[2].backgroundColor = unknownColor;

  // Update text and grid colors
  const textColor = isDarkMode ? '#c9d1d9' : '#24292f';
  const gridColor = isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';

  categoryHealthChart.options.scales.x.title.color = textColor;
  categoryHealthChart.options.scales.y.title.color = textColor;
  categoryHealthChart.options.scales.x.ticks.color = textColor;
  categoryHealthChart.options.scales.y.ticks.color = textColor;
  categoryHealthChart.options.scales.x.grid.color = gridColor;
  categoryHealthChart.options.scales.y.grid.color = gridColor;
  categoryHealthChart.options.plugins.legend.labels.color = textColor;

  // Update tooltip colors
  categoryHealthChart.options.plugins.tooltip.backgroundColor = isDarkMode ? '#161b22' : '#fff';
  categoryHealthChart.options.plugins.tooltip.bodyColor = isDarkMode ? '#c9d1d9' : '#24292f';
  categoryHealthChart.options.plugins.tooltip.borderColor = isDarkMode ? '#30363d' : '#d0d7de';


  // 6. *NOW* Update the Chart
  categoryHealthChart.update();
}

// Call updateCategoryHealthChart on initial load and dark mode toggle.
document.addEventListener('DOMContentLoaded', () => {
  // ... other DOMContentLoaded code ...
  initCategoryHealthChart();
  updateCategoryHealthChart(devicesData);

  // Apply dark mode preference.
  const savedDarkMode = localStorage.getItem("darkMode");
  const toggleButton = document.querySelector(".dark-mode-toggle");
  const icon = toggleButton.querySelector("i");

  if (savedDarkMode === "true") {
    document.body.classList.add("dark-mode");
    toggleButton.classList.add("active");
    icon.classList.remove("fa-moon");
    icon.classList.add("fa-sun");
    icon.style.transform = "rotate(180deg)";
  } else {
    // Ensure icon is set to moon if not in dark mode
    icon.classList.remove("fa-sun");
    icon.classList.add("fa-moon");
    icon.style.transform = "rotate(0deg)";
  }
  updateChartsForDarkMode();
});

// Check user role and update UI
function checkUserRole() {
    const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
    const userRole = currentUser.role || 'user';
    const username = currentUser.username || '';

    // Update user profile
    const userAvatar = document.getElementById('userAvatar');
    if (userAvatar) {
        // Generate avatar URL with proper encoding and size
        const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(username)}&background=random&size=128&bold=true&color=fff`;
        userAvatar.src = avatarUrl;
        userAvatar.onerror = function() {
            this.src = 'https://ui-avatars.com/api/?name=User&background=random&size=128&bold=true&color=fff';
        };
    }

    // Update role-based access
    const adminElements = document.querySelectorAll('[data-role="admin"]');
    const userElements = document.querySelectorAll('[data-role="user"]');

    if (userRole === 'admin') {
        adminElements.forEach(el => el.style.display = 'block');
        userElements.forEach(el => el.style.display = 'block');
    } else {
        adminElements.forEach(el => el.style.display = 'none');
        userElements.forEach(el => el.style.display = 'block');
    }

    // Update navigation links
    const manageDevicesButton = document.getElementById('manageDevicesButton');
    const emailConfigButton = document.getElementById('emailConfigButton');
    const adminPanelLink = document.querySelector('a[href="admin-dashboard.html"]');
    
    if (manageDevicesButton) {
        manageDevicesButton.style.display = userRole === 'admin' ? 'inline-flex' : 'none';
    }
    
    if (emailConfigButton) {
        emailConfigButton.style.display = userRole === 'admin' ? 'inline-flex' : 'none';
    }

    if (adminPanelLink) {
        adminPanelLink.style.display = userRole === 'admin' ? 'inline-flex' : 'none';
    }

    // Add click event to avatar for user profile popup
    if (userAvatar) {
        userAvatar.onclick = () => showUserProfilePopup();
    }
}

// Show user profile popup
function showUserProfilePopup() {
    const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
    const popup = document.createElement('div');
    popup.className = 'user-profile-popup';
    popup.innerHTML = `
        <div class="popup-content">
            <div class="popup-header">
                <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(currentUser.username)}&background=random" alt="User Avatar" class="popup-avatar">
                <h3>${currentUser.username}</h3>
                <span class="user-role">${currentUser.role}</span>
            </div>
            <div class="popup-body">
                ${currentUser.role === 'admin' ? `
                    <button onclick="window.location.href='admin-dashboard.html'">
                        <i class="fas fa-user-shield"></i>
                        Access Admin Dashboard
                    </button>
                ` : ''}
                <button onclick="resetPassword()">
                    <i class="fas fa-key"></i>
                    Change Password
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(popup);

    // Close popup when clicking outside
    popup.addEventListener('click', (e) => {
        if (e.target === popup) {
            popup.remove();
        }
    });
}

// Show change password modal
function showChangePasswordModal() {
    // Remove any existing modals
    const existingModal = document.querySelector('.modal');
    if (existingModal) {
        existingModal.remove();
    }

    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.innerHTML = `
        <div class="modal-content">
            <h2>Change Password</h2>
            <form id="changePasswordForm">
                <div class="form-group">
                    <label>Current Password</label>
                    <input type="password" id="currentPassword" required>
                </div>
                <div class="form-group">
                    <label>New Password</label>
                    <input type="password" id="newPassword" required>
                </div>
                <div class="form-group">
                    <label>Confirm New Password</label>
                    <input type="password" id="confirmPassword" required>
                </div>
                <div class="modal-buttons">
                    <button type="button" class="btn-secondary" onclick="this.closest('.modal').remove()">Cancel</button>
                    <button type="submit" class="btn-primary">Change Password</button>
                </div>
            </form>
        </div>
    `;
    document.body.appendChild(modal);

    // Handle form submission
    const form = modal.querySelector('#changePasswordForm');
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const currentPassword = document.getElementById('currentPassword').value;
        const newPassword = document.getElementById('newPassword').value;
        const confirmPassword = document.getElementById('confirmPassword').value;

        if (newPassword !== confirmPassword) {
            alert('New passwords do not match');
            return;
        }

        if (!validatePassword(newPassword)) {
            alert('Password does not meet the requirements');
            return;
        }

        const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
        const users = JSON.parse(localStorage.getItem('users') || '[]');
        const user = users.find(u => u.username === currentUser.username);

        if (!user) {
            alert('User not found');
            return;
        }

        const currentPasswordHash = await hashPassword(currentPassword);
        if (currentPasswordHash !== user.passwordHash) {
            alert('Current password is incorrect');
            return;
        }

        user.passwordHash = await hashPassword(newPassword);
        localStorage.setItem('users', JSON.stringify(users));
        alert('Password changed successfully');
        modal.remove();
    });

    // Close modal when clicking outside
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });
}

// Update navigation to include logout button
function updateNavigation() {
    const navigation = document.querySelector('.navigation');
    if (!navigation) return;

    // Remove existing logout button if any
    const existingLogout = navigation.querySelector('.logout-button');
    if (existingLogout) {
        existingLogout.remove();
    }

    // Add logout button next to dark mode toggle
    const darkModeToggle = document.querySelector('.dark-mode-toggle');
    if (darkModeToggle) {
        const logoutButton = document.createElement('button');
        logoutButton.className = 'nav-button logout-button';
        logoutButton.innerHTML = '<i class="fas fa-sign-out-alt"></i> Logout';
        logoutButton.onclick = logout;
        darkModeToggle.parentNode.insertBefore(logoutButton, darkModeToggle.nextSibling);
    }
}

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

        // Redirect based on role
        if (user.role === 'admin') {
            window.location.href = 'admin-dashboard.html';
        } else {
            window.location.href = 'index.html';
        }
    });
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

// Hash password function
async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
}

// Initialize default admin on page load
document.addEventListener('DOMContentLoaded', () => {
    initializeDefaultAdmin();
    
    // Add login form submit handler
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }
});

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

// Initialize dropdown menu when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    handleDropdownMenu();
});