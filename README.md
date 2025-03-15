# 🚀 RustPing: Real-time Network Monitoring

[![Rust](https://img.shields.io/badge/Rust-1.56+-orange.svg?style=for-the-badge&logo=rust)](https://www.rust-lang.org/)
[![Rocket](https://img.shields.io/badge/Rocket-0.5+-red.svg?style=for-the-badge&logo=rocket)](https://rocket.rs/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)
[![Build Status](https://img.shields.io/github/actions/workflow/status/karthik558/Rust-Ping/rust.yml?branch=main&style=for-the-badge)](https://github.com/karthik558/Rust-Ping/actions)


RustPing is a powerful, real-time network monitoring tool built with Rust and the Rocket web framework. It provides an interactive dashboard to monitor your network devices using Ping, HTTP checks, and bandwidth monitoring, all with a focus on speed, reliability, and ease of use.

## ✨ Features

*   **🔍 Real-time Device Monitoring:** Keep an eye on your network devices with live updates.
*   **📊 Interactive Dashboard:** Visualize your network's health with intuitive charts and tables.
*   **🌐 Multiple Sensors:**
    *   **Ping:** Check device availability.
    *   **HTTP:** Monitor website status and response times.
    *   **Bandwidth:** Track network usage.
*   **📝 Detailed Logging:**  Get comprehensive logs for troubleshooting and analysis.
*   **🔄 Automatic Retry:**  Handles intermittent network issues gracefully.
*   **📈 Visual Status Indicators:** Quickly identify problems with clear visual cues.
*   **🌙 / ☀️  Dark/Light Mode:** Choose the theme that suits your preference.
*   **📅 Log Export:** Export logs in CSV or TXT format for offline analysis.
*   **🔐 User Authentication:** Secure access with a login system (and planned role-based access).

## 🚧 Roadmap

These features are planned for future development:

*   **🔴 Upcoming: New Sensors (TCP, UDP, etc.):**  Expand monitoring capabilities.
*   **🔴 Upcoming: Email/SMS Notifications:**  Get alerts for critical device status changes.
*   **✅ Upcoming: User authentication and role-based access control:**  Control access and permissions.
*   **🔴 Upcoming: Docker Support:** Simplify deployment and portability.
*   **🔴 Upcoming: Mobile App:** Monitor your network on the go.

## 📸 Screenshots

| Dark Mode                                  | Light Mode                                    |
| :----------------------------------------- | :-------------------------------------------- |
| ![Dashboard-Dark](screenshots/dashboardHome-dark.png) | ![Dashboard-Light](screenshots/dashboardHome-light.png) |
| ![Live-Log-Dark](screenshots/liveLog-dark.png)     | ![Live-Log-Light](screenshots/liveLog-light.png)     |
| ![Fail-Log-Dark](screenshots/failedLog-dark.png)   | ![Fail-Log-Light](screenshots/failedLog-light.png)   |
| ![Login-Dark](screenshots/loginDark.png)        | ![Login-Light](screenshots/loginLight.png)          |
| ![Pass-Reset-Dark](screenshots/passReset-dark.png) | ![Pass-Reset-Light](screenshots/passReset-light.png)  |

## 📖 Table of Contents

*   [Prerequisites](#-prerequisites)
*   [Installation](#-installation)
    *   [Linux/MacOS](#installation-linuxmacos)
    *   [Windows](#installation-windows)
*   [Default Password](#-default-password-for-webui)
*   [Configuration](#-configuration)
*   [Usage](#-usage)
*   [API Endpoints](#-api-endpoints)
*   [Contributing](#-contributing)
*   [License](#-license)

## ⚙️ Prerequisites

*   **Rust:**  1.56 or higher.  Install from [rustup.rs](https://rustup.rs/).
*   **Cargo:**  The Rust package manager (automatically installed with Rust).
*   **Network Access:**  RustPing needs network access to monitor your devices.

## 🛠️ Installation

### Installation (Linux/MacOS)

1.  **Clone the Repository:**

    ```bash
    git clone https://github.com/karthik558/Rust-Ping.git
    cd Rust-Ping
    ```

2.  **Build the Project (Release Mode):**

    ```bash
    cargo build --release
    ```
    This creates an optimized executable in the `target/release` directory.

3.  **Run the Application:**

    ```bash
    ./target/release/Rust-Ping  # Run the compiled executable directly
    ```
     Alternatively use cargo:
    ```bash
     cargo run
    ```

4.  **Access the Dashboard:** Open your web browser and navigate to `http://127.0.0.1:8000/static/index.html`.

### Installation (Windows)

1.  **Clone the Repository:**
    ```bash
    git clone https://github.com/karthik558/Rust-Ping.git
    cd Rust-Ping
    ```

2.  **Install MSYS2:**  Follow the instructions on the [MSYS2 website](https://www.msys2.org/) to install it.  This provides the necessary build tools.

3. **Rust Installation (if not already installed):** Follow the instructions on [Rust website](https://www.rust-lang.org/tools/install) to install Rust.

4. **Alternative MinGW Installation (if msys2 not working):** Download and install MinGW-w64 from [MinGW-w64 installer](https://github.com/Vuniverse0/mingwInstaller/releases/download/1.2.1/mingwInstaller.exe)

5. **Add MinGW to PATH:** Ensure the `bin` directory of your MinGW-w64 installation is added to your system's PATH environment variable. It should look similar to this: `C:\Program Files\mingw-w64\x86_64-8.1.0-posix-seh-rt_v6-rev0\mingw64\bin`

6.  **Set Rustup Default (Important!):**
   ```bash
   rustup default stable-x86_64-pc-windows-gnu
   ```
   Verify with:
   ```bash
   rustup show
   ```

7.  **Open a *New* Command Prompt:** Open a new command prompt or PowerShell window *after* installing MSYS2 and setting the Rustup default. This ensures the environment variables are loaded correctly. Navigate to project directory:
    ```bash
     cd Rust-Ping
    ```

8.  **Build the Project:**

    ```bash
    cargo build --release
    ```

9.  **Run the Application:**

    ```bash
     cargo run
    ```
    or (better for deployment):
    ```bash
    .\target\release\Rust-Ping.exe
    ```

10. **Access the Dashboard:** Open your web browser and navigate to `http://127.0.0.1:8000/`.  (Note the trailing `/` might be needed if you're directly running the executable).

## 🔑 Default Password for WebUI

*   **Username:** `admin`
*   **Password:** `admin@123`

**Important:** Change the default password immediately after your first login for security reasons!

## ⚙️ Configuration

The `devices.json` file in the project's root directory controls which devices are monitored.  Edit this file to add, remove, or modify devices.  The file uses JSON format:

```json
[
  {
    "name": "Router",
    "ip": "192.168.1.1",
    "sensors": ["Ping", "Http"],
    "http_path": "http://192.168.1.1"
  },
  {
    "name": "NAS",
    "ip": "192.168.1.2",
    "sensors": ["Ping"]
  },
  {
    "name": "Example Website",
    "ip": "www.example.com",
    "sensors": ["Http"],
    "http_path": "https://www.example.com"
  }
]
```

*   **`name`:**  A descriptive name for the device.
*   **`ip`:** The IP address or hostname of the device.
*   **`sensors`:**  An array of sensors to use ("Ping", "Http", "Bandwidth").
*   **`http_path`:**  (Required for "Http" sensor) The full URL to check (e.g., `http://192.168.1.1` or `https://www.example.com`).

## 🚀 Usage

1.  **Access the Dashboard:** Open `http://127.0.0.1:8000/` (or `/static/index.html`) in your web browser.
2.  **Configure Devices:** Edit the `devices.json` file as described above.
3.  **Automatic Refresh:** The dashboard automatically refreshes every 5 seconds to display the latest device status.
4.  **View Details:** Click on entries in the tables to see more detailed information.
5. **Export Logs:** Use the log export form to generate CSV or TXT files of your monitoring data.

## 📡 API Endpoints

RustPing provides a REST API for interacting with the application programmatically.

| Method | Endpoint                     | Description                                      |
| :----- | :--------------------------- | :----------------------------------------------- |
| `GET`  | `/`                          | Serves the main dashboard HTML.                |
| `GET`  | `/static/index.html`          | Serves the main dashboard HTML.                |
| `GET`  | `/api/devices`               | Returns a JSON array of all monitored devices.   |
| `POST` | `/api/devices`               | Adds a new device to the `devices.json` file.   |
| `GET`  | `/export_log`              | Initiates a download of monitoring logs.      |
| `GET`  | `/log_json`                  | Returns logs in JSON format.                   |
| `GET`  | `/failed_log`                 | Returns logs for failed pings/HTTP checks.    |
| `POST`  | `/update-password`           | Updates the user's password.                   |
| `POST` | `/login` | For user login. |
| `GET`    | `/logout`                     | Logs the current user out.                      |

## 🤝 Contributing

Contributions are always welcome!  Here's how you can help:

1.  **Fork the Repository:** Create a copy of the repository on your GitHub account.
2.  **Create a Branch:**  Make your changes in a new branch: `git checkout -b my-feature-branch`
3.  **Make Changes:** Implement your feature or fix the bug.
4.  **Write Tests:**  Add tests to ensure your code works correctly and doesn't break existing functionality.
5.  **Commit Changes:**  `git commit -m "Add a descriptive commit message"`
6.  **Push to Your Fork:** `git push origin my-feature-branch`
7.  **Submit a Pull Request:**  Open a pull request from your branch to the main RustPing repository.

Please follow the [Rust style guidelines](https://doc.rust-lang.org/style-guide/).

## 📄 License

This project is licensed under the [MIT License](LICENSE).