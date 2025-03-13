let selectedDevice = null;
let bandwidthChart;
let devicePieChart;
let devicesData = [];
let isFetching = false;

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
  } finally {
    isFetching = false;
  }
}

function renderData(devices) {
  updateTable(devices);
  updateBandwidthChart(devices);
  if (selectedDevice) {
    const device = devices.find((d) => d.name === selectedDevice.name);
    if (device) {
      updatePieChart(device);
      selectedDevice = device;
    } else {
      clearPieChart();
    }
  } else {
    clearPieChart();
  }
}

function updateTable(devices) {
  const tbody = document.querySelector("#devices-table tbody");
  tbody.innerHTML = "";
  devices.forEach((device) => {
    const tr = document.createElement("tr");
    tr.addEventListener("click", () => {
      selectedDevice = device;
      updatePieChart(device);
    });

    const addCell = (content, isStatus = false) => {
      const td = document.createElement("td");
      if (isStatus) {
        td.innerHTML = content;
      } else {
        td.textContent = content;
      }
      tr.appendChild(td);
    };

    addCell(device.name);
    addCell(device.ip);

    const sensorTd = document.createElement("td");
    if (Array.isArray(device.sensors)) {
      device.sensors.forEach((sensor) => {
        const span = document.createElement("span");
        span.className = "sensor-box";
        span.textContent = sensor;
        sensorTd.appendChild(span);
      });
    } else {
      sensorTd.textContent = "-";
    }
    tr.appendChild(sensorTd);

    let statusContent = `<span class="status-dot ${device.ping_status === true
        ? "green"
        : device.ping_status === false
          ? "red"
          : "yellow"
      }"></span>`;
    statusContent += device.ping_status === true
      ? "OK"
      : device.ping_status === false
        ? "Fail"
        : "Unknown";
    addCell(statusContent, true);

    addCell(device.bandwidth_usage ? device.bandwidth_usage.toFixed(2) : "-");

    let httpStatusContent = `<span class="status-dot ${device.http_status === true
        ? "green"
        : device.http_status === false
          ? "red"
          : "yellow"
      }"></span>`;
    httpStatusContent += device.http_status === true
      ? "OK"
      : device.http_status === false
        ? "Fail"
        : "Unknown";
    addCell(httpStatusContent, true);

    tbody.appendChild(tr);
  });
}

function updateBandwidthChart(devices) {
  const ctx = document.getElementById("bandwidthChart").getContext("2d");
  const labels = devices.map((d) => d.name);
  const data = devices.map((d) => d.bandwidth_usage || 0);
  const backgroundColor = document.body.classList.contains("dark-mode")
    ? "rgba(138, 180, 248, 0.7)"
    : "rgba(0, 122, 255, 0.7)";
  if (bandwidthChart) {
    bandwidthChart.data.labels = labels;
    bandwidthChart.data.datasets[0].data = data;
    bandwidthChart.data.datasets[0].backgroundColor = backgroundColor;
    bandwidthChart.update();
  } else {
    bandwidthChart = new Chart(ctx, {
      type: "bar",
      data: {
        labels: labels,
        datasets: [
          {
            label: "Bandwidth Usage (Mbps)",
            data: data,
            backgroundColor: backgroundColor,
            borderRadius: 4,
            borderWidth: 1,
            borderColor: backgroundColor,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            grid: {
              color: document.body.classList.contains("dark-mode")
                ? "rgba(255,255,255,0.1)"
                : "rgba(0,0,0,0.1)",
            },
          },
          x: { grid: { display: false } },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: document.body.classList.contains("dark-mode")
              ? "#444"
              : "#fff",
            bodyColor: document.body.classList.contains("dark-mode")
              ? "#eee"
              : "#333",
            borderColor: document.body.classList.contains("dark-mode")
              ? "#888"
              : "#ccc",
            borderWidth: 1,
            padding: 10,
          },
        },
      },
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
  const labels = device.sensors;
  const data = device.sensors.map(() => 1);
  const ctx = document.getElementById("devicePieChart").getContext("2d");
  const backgroundColors = [
    "rgba(0, 122, 255, 0.7)",
    "rgba(52, 199, 89, 0.7)",
    "rgba(255, 149, 0, 0.7)",
    "rgba(255, 59, 48, 0.7)",
    "rgba(88, 86, 214, 0.7)",
    "rgba(255, 204, 0, 0.7)",
    "rgba(90, 200, 250, 0.7)",
    "rgba(255, 87, 34, 0.7)",
  ];
  const usedColors = labels.map(
    (_, index) => backgroundColors[index % backgroundColors.length]
  );
  if (devicePieChart) {
    devicePieChart.data.labels = labels;
    devicePieChart.data.datasets[0].data = data;
    devicePieChart.data.datasets[0].backgroundColor = usedColors;
    devicePieChart.update();
  } else {
    devicePieChart = new Chart(ctx, {
      type: "pie",
      data: {
        labels: labels,
        datasets: [
          {
            label: "Sensor Distribution",
            data: data,
            backgroundColor: usedColors,
            borderWidth: 1,
            borderColor: document.body.classList.contains("dark-mode")
              ? "rgba(255,255,255,0.2)"
              : "rgba(0,0,0,0.2)",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: "bottom",
            labels: {
              color: document.body.classList.contains("dark-mode")
                ? "#eee"
                : "#333",
            },
          },
          tooltip: {
            backgroundColor: document.body.classList.contains("dark-mode")
              ? "#444"
              : "#fff",
            bodyColor: document.body.classList.contains("dark-mode")
              ? "#eee"
              : "#333",
            borderColor: document.body.classList.contains("dark-mode")
              ? "#888"
              : "#ccc",
            borderWidth: 1,
            padding: 10,
          },
        },
      },
    });
  }
}

function toggleDarkMode() {
  const toggleButton = document.querySelector(".dark-mode-toggle");
  const isDarkMode = document.body.classList.toggle("dark-mode");
  toggleButton.classList.toggle("active", isDarkMode);
  toggleButton.querySelector("i").style.transform = isDarkMode
    ? "rotate(180deg)"
    : "rotate(0deg)";
  // Save dark mode preference in local storage
  localStorage.setItem("darkMode", isDarkMode ? "true" : "false");
  updateChartsForDarkMode();
}

function updateChartsForDarkMode() {
  const isDarkMode = document.body.classList.contains("dark-mode");
  const gridColor = isDarkMode
    ? "rgba(255,255,255,0.1)"
    : "rgba(0,0,0,0.1)";
  const backgroundColor = isDarkMode
    ? "rgba(138, 180, 248, 0.7)"
    : "rgba(0, 122, 255, 0.7)";
  if (bandwidthChart) {
    bandwidthChart.options.scales.y.grid.color = gridColor;
    bandwidthChart.data.datasets[0].backgroundColor = backgroundColor;
    bandwidthChart.data.datasets[0].borderColor = backgroundColor;
    bandwidthChart.update();
  }
  if (devicePieChart) {
    devicePieChart.options.plugins.legend.labels.color = isDarkMode ? "#eee" : "#333";
    devicePieChart.update();
  }
}

function generateLog() {
  // Gather parameters from the log export form.
  const devices = document.getElementById("logDevices").value;
  const startDate = document.getElementById("startDate").value; // Format: YYYY-MM-DD
  const endDate = document.getElementById("endDate").value;     // Format: YYYY-MM-DD
  const logFormat = document.getElementById("logFormat").value;

  // Build query parameters.
  const params = new URLSearchParams();
  if (devices) params.append("devices", devices);
  if (startDate) params.append("start_date", startDate);
  if (endDate) params.append("end_date", endDate);
  if (logFormat) params.append("format", logFormat);

  // Fetch the log export data.
  fetch(`/export_log?${params.toString()}`)
    .then(response => response.text())
    .then(text => {
      // Create blob and download link.
      const blob = new Blob(
        [text],
        { type: logFormat === "csv" ? "text/csv" : "text/plain" }
      );
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
    });
}

document.getElementById("filterButton").addEventListener("click", () => {
  const filterText = document.getElementById("filterInput").value.toLowerCase();
  const filteredDevices = devicesData.filter((device) =>
    device.name.toLowerCase().includes(filterText) ||
    device.ip.toLowerCase().includes(filterText)
  );
  renderData(filteredDevices);
});

document.getElementById("filterInput").addEventListener("keyup", (event) => {
  if (event.key === "Enter") {
    const filterText = document.getElementById("filterInput").value.toLowerCase();
    const filteredDevices = devicesData.filter((device) =>
      device.name.toLowerCase().includes(filterText) ||
      device.ip.toLowerCase().includes(filterText)
    );
    renderData(filteredDevices);
  }
});

document.getElementById("clearFilterButton").addEventListener("click", () => {
  document.getElementById("filterInput").value = "";
  renderData(devicesData);
});

document.getElementById("generateLogButton").addEventListener("click", generateLog);

document.addEventListener("DOMContentLoaded", () => {
  // Apply dark mode preference from local storage if available.
  if (localStorage.getItem("darkMode") === "true") {
    document.body.classList.add("dark-mode");
    const toggleButton = document.querySelector(".dark-mode-toggle");
    toggleButton.classList.add("active");
    toggleButton.querySelector("i").style.transform = "rotate(180deg)";
  }
  fetchDevices();
  setInterval(fetchDevices, 5000);
});