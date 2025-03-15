// src/main.rs
extern crate rocket;

mod models;
mod sensors;

use rocket::{get, post, routes, State, response::Redirect};
use rocket::serde::json::Json;
use rocket::fs::{NamedFile, FileServer, relative};
use models::{Device, SensorType};
use log::{info, error};
use sensors::{monitor_ping, monitor_http};
use std::fs::{self, OpenOptions};
use std::io::{Read, Write};
use serde_json::{self, json};
use serde_json::from_str;
use std::path::Path;
use tokio::time::{sleep, Duration};
use rand::Rng;
use std::sync::Arc;
use tokio::sync::Mutex;
use std::collections::HashMap;
use chrono::{NaiveDate, Utc};
use rocket::response::content::RawText;

async fn process_logs(start_date_parsed: Option<NaiveDate>, end_date_parsed: Option<NaiveDate>) -> Vec<String> {
    let mut filtered_logs = Vec::new();
    if let Ok(contents) = fs::read_to_string(LOG_FILE) {
        for line in contents.lines() {
            if let Some((timestamp, rest)) = line.split_once(" - ") {
                let date_str = &timestamp[..10];  // Add & here for string slice reference
                if let Ok(entry_date) = NaiveDate::parse_from_str(date_str, "%Y-%m-%d") {  // date_str is already a &str
                    let mut include = true;
                    
                    if let Some(start) = start_date_parsed {
                        if entry_date < start {
                            include = false;
                        }
                    }
                    if let Some(end) = end_date_parsed {
                        if entry_date > end {
                            include = false;
                        }
                    }
                    if include {
                        filtered_logs.push(format!("{} - {}", timestamp, rest));
                    }
                }
            }
        }
    }
    filtered_logs
}

// Define a struct to track device status.
#[derive(Debug, Clone)]
struct DeviceStatus {
    failed_attempts: u32,
    last_status: bool,
}

impl DeviceStatus {
    fn new() -> Self {
        DeviceStatus {
            failed_attempts: 0,
            last_status: true, // Assume initially up
        }
    }
}

// Use the new DeviceStatus struct in the type alias.
type DeviceStatusMap = Arc<Mutex<HashMap<String, DeviceStatus>>>;

type SharedDevices = Arc<Mutex<Vec<Device>>>;

static LOG_FILE: &str = "rustPing_running.log";

// Serve the dashboard page.  We NO LONGER need this separate route.
// #[get("/")]
// async fn index() -> Option<NamedFile> {
//     NamedFile::open(Path::new("static/index.html")).await.ok()
// }

// Redirect / to /static/index.html (this is now optional, but good for clarity)
#[get("/")]
async fn index() -> Redirect {
    Redirect::to("/static/index.html")
}


// API to add a device.
#[post("/add_device", data = "<device>")]
async fn add_device(device: Json<Device>, devices: &State<SharedDevices>) -> &'static str {
    let mut dev = device.into_inner();
    if dev.sensors.contains(&SensorType::Ping) {
        let status = monitor_ping(&dev.ip).await;  // Borrow dev.ip
        dev.ping_status = Some(status);
    }
    let mut devices_locked = devices.lock().await;
    devices_locked.push(dev);
    "Device added"
}

// API to get the list of devices.
#[get("/devices")]
async fn get_devices(devices: &State<SharedDevices>) -> Json<Vec<Device>> {
    let devices_locked = devices.lock().await;
    Json(devices_locked.clone())
}

/// Export logs filtered by (optional) date range and device names.
#[get("/export_log?<devices>&<start_date>&<end_date>&<format>")]
async fn export_log(
    devices: Option<&str>,
    start_date: Option<&str>,
    end_date: Option<&str>,
    format: Option<&str>
) -> RawText<String> {
    // Read the entire log file.
    let mut file_content = String::new();
    if let Ok(mut file) = OpenOptions::new().read(true).open(LOG_FILE) {
        if let Err(e) = file.read_to_string(&mut file_content) {
            error!("Failed to read log file: {}", e);
            return RawText("Failed to read log file".to_string());
        }
    } else {
        return RawText("Log file not found".to_string());
    }
    
    let lines: Vec<&str> = file_content.lines().collect();
    let mut filtered_lines = Vec::new();

    // Parse optional date filters.
    let start_date_parsed: Option<NaiveDate> =
        start_date.and_then(|s| NaiveDate::parse_from_str(s, "%Y-%m-%d").ok());
    let end_date_parsed: Option<NaiveDate> =
        end_date.and_then(|s| NaiveDate::parse_from_str(s, "%Y-%m-%d").ok());

    // Split and trim device filter names (which could be names or IP addresses).
    let device_filters: Option<Vec<String>> = devices.map(|d| {
        d.split(',')
         .map(|s| s.trim().to_lowercase())
         .collect()
    });
    
    // Process each log line.
    for line in lines {
        // Retain lines starting with "//" (e.g. header lines).
        if line.starts_with("//") {
            filtered_lines.push(line);
            continue;
        }
        if let Some((timestamp, rest)) = line.split_once(" - ") {
            // Extract device name and IP.
            // Assuming rest is like: "Device: Network Switch, 192.168.0.100, Ping: FAIL, HTTP: N/A, Bandwidth: N/A"
            let parts: Vec<&str> = rest.split(',').collect();
            if parts.len() >= 2 {
                let device_part = parts[0].trim(); // "Device: Network Switch"
                let ip_part = parts[1].trim();       // "192.168.0.100"
                let device_name = device_part.trim_start_matches("Device:").trim().to_lowercase();
                let device_ip = ip_part.to_lowercase();
                
                // Filter by date.
                let mut include = true;
                // Extract the date part from timestamp (first 10 characters)
                let date_str = &timestamp[..10];
                if let Ok(entry_date) = NaiveDate::parse_from_str(date_str, "%Y-%m-%d") {
                    if let Some(start) = start_date_parsed {
                        if entry_date < start {
                            include = false;
                        }
                    }
                    if let Some(end) = end_date_parsed {
                        if entry_date > end {
                            include = false;
                        }
                    }
                }
                
                // Apply device/IP filters if provided.
                if let Some(ref filters) = device_filters {
                    let mut found = false;
                    for f in filters {
                        if device_name.contains(f) || device_ip.contains(f) {
                            found = true;
                            break;
                        }
                    }
                    if !found {
                        include = false;
                    }
                }

                if include {
                    filtered_lines.push(line);
                }
            }
        }
    }
    
    // Output formatting
    let output = if let Some(fmt) = format {
        if fmt.to_lowercase() == "csv" {
            // CSV export implementation (e.g., create CSV lines)
            let mut csv_lines = vec!["Timestamp,Device Name,IP Address,Ping,HTTP,Bandwidth".to_string()];
            for line in filtered_lines {
                if line.starts_with("//") { continue; }
                if let Some((timestamp, rest)) = line.split_once(" - ") {
                    // Extract device name, IP, and statuses.
                    let parts: Vec<&str> = rest.split(',').collect();
                    if parts.len() >= 2 {
                        let device_name = parts[0].trim().trim_start_matches("Device:").trim();
                        let device_ip = parts[1].trim();
                        let ping = parts.get(2)
                            .map(|s| s.replace("Ping:", "").trim().to_string())
                            .unwrap_or_else(|| "N/A".to_string());
                        let http = parts.get(3)
                            .map(|s| s.replace("HTTP:", "").trim().to_string())
                            .unwrap_or_else(|| "N/A".to_string());
                        let bandwidth = parts.get(4)
                            .map(|s| s.replace("Bandwidth:", "").trim().to_string())
                            .unwrap_or_else(|| "N/A".to_string());
                        let csv_line = format!("{},{},{},{},{},{}", timestamp, device_name, device_ip, ping, http, bandwidth);
                        csv_lines.push(csv_line);
                    }
                }
            }
            csv_lines.join("\n")
        } else {
            // Plain text output.
            filtered_lines.join("\n")
        }
    } else {
        filtered_lines.join("\n")
    };

    RawText(output)
}

/// New endpoint to expose logs as JSON.
#[get("/logs_json")]
async fn logs_json() -> Json<serde_json::Value> {
    let mut file_content = String::new();
    if let Ok(mut file) = OpenOptions::new().read(true).open(LOG_FILE) {
        if let Err(e) = file.read_to_string(&mut file_content) {
            error!("Failed to read log file: {}", e);
            return Json(json!({"error": "Failed to read log file"}));
        }
    } else {
        return Json(json!({"error": "Log file not found"}));
    }
    let lines: Vec<&str> = file_content.lines().collect();
    let mut entries = Vec::new();
    for line in lines {
        if line.starts_with("//") || line.trim().is_empty() {
            continue;
        }
        if let Some((timestamp, rest)) = line.split_once(" - ") {
            let parts: Vec<&str> = rest.splitn(2, ": ").collect();
            if parts.len() < 2 { continue; }
            let device = parts[0].trim();
            let statuses = parts[1];
            let mut ping = "";
            let mut http = "";
            let mut bandwidth = "";
            for status in statuses.split(", ") {
                if status.starts_with("Ping:") {
                    ping = status.trim_start_matches("Ping:").trim();
                } else if status.starts_with("HTTP:") {
                    http = status.trim_start_matches("HTTP:").trim();
                } else if status.starts_with("Bandwidth:") {
                    bandwidth = status.trim_start_matches("Bandwidth:").trim();
                }
            }
            let down = ping.to_lowercase() == "fail";
            // Split timestamp into date and time.
            let ts_parts: Vec<&str> = timestamp.split(' ').collect();
            let date = ts_parts.get(0).unwrap_or(&"").to_string();
            let time = ts_parts.get(1).unwrap_or(&"").to_string();
            entries.push(json!({
                "timestamp": timestamp,
                "date": date,
                "time": time,
                "device": device,
                "ping": ping,
                "http": http,
                "bandwidth": bandwidth,
                "down": down
            }));
        }
    }
    Json(json!(entries))
}

// Load devices from a JSON file.
async fn add_devices_from_file(file_path: &str, devices: SharedDevices) {
    let data = fs::read_to_string(file_path).expect("Unable to read file");
    let mut file_devices: Vec<Device> = from_str(&data).expect("JSON was not well-formatted");
    for dev in file_devices.iter_mut() {
        dev.ping_status = None;
        dev.bandwidth_usage = None;
        dev.http_status = None;
    }
    let mut devices_locked = devices.lock().await;
    devices_locked.append(&mut file_devices);
}

/// New route for failed logs.
#[get("/failed_logs")]
async fn failed_logs() -> Option<NamedFile> {
    NamedFile::open(Path::new("static/failed_logs.html")).await.ok()
}

use env_logger;

#[tokio::main]
async fn main() {
    // Initialize logger with debug level
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("debug"))
        .init();
    
    info!("Starting RustPing Network Device Monitor...");

    let devices: SharedDevices = Arc::new(Mutex::new(Vec::new()));
    let rocket_instance = rocket::build()
        .manage(devices.clone())
        // Mount FileServer with rank 2.  This is the crucial part.
        .mount("/static", FileServer::from(relative!("static")).rank(2))
        // Mount other routes.  The redirect has a higher rank (default is 0), so it takes precedence.
        .mount("/", routes![index, add_device, get_devices, export_log, logs_json, failed_logs]);


    add_devices_from_file("devices.json", devices.clone()).await;

    // Track last logged date.
    let mut last_log_date = String::new();

    // Spawn a background task.
    let devices_clone = devices.clone();
    let device_status_map: DeviceStatusMap = Arc::new(Mutex::new(HashMap::new()));
    let status_map_clone = device_status_map.clone();

    tokio::spawn(async move {
        loop {
            let indices: Vec<usize> = {
                let locked = devices_clone.lock().await;
                (0..locked.len()).collect()
            };

            for i in indices {
                let (ip, name, sensors, http_path) = {
                    let locked = devices_clone.lock().await;
                    if let Some(dev) = locked.get(i) {
                        (dev.ip.clone(), dev.name.clone(), dev.sensors.clone(), dev.http_path.clone()) // Clone ip
                    } else {
                        continue;
                    }
                };

                let mut ping_status = None;
                if sensors.contains(&SensorType::Ping) {
                    // Perform multiple ping attempts
                    let mut success_count = 0;
                    for _ in 0..5 {
                        if monitor_ping(&ip).await { // Borrow &ip
                            success_count += 1;
                        }
                        sleep(Duration::from_millis(500)).await;
                    }

                    let current_status = success_count >= 3;
                    ping_status = Some(current_status);

                    // Update the status tracking
                    let mut status_map = status_map_clone.lock().await;
                    let device_status = status_map.entry(name.clone()).or_insert_with(DeviceStatus::new);

                    if !current_status {
                        device_status.failed_attempts += 1;
                    } else {
                        device_status.failed_attempts = 0;
                    }
                    device_status.last_status = current_status;
                }

                let bandwidth_usage = if sensors.contains(&SensorType::Http) {
                    Some(rand::thread_rng().gen_range(10.0..1000.0))
                } else {
                    None
                };

                let http_status = if sensors.contains(&SensorType::Http) {
                    if let Some(ref url) = http_path {
                        Some(monitor_http(url).await)
                    } else {
                        None
                    }
                } else {
                    None
                };

                {
                    let mut locked = devices_clone.lock().await;
                    if let Some(dev) = locked.get_mut(i) {
                        dev.ping_status = ping_status;
                        dev.bandwidth_usage = bandwidth_usage;
                        dev.http_status = http_status;
                    }
                }
            }

            // Get current timestamp and date.
            let now = Utc::now();
            let timestamp = now.format("%Y-%m-%d %H:%M:%S").to_string();
            let today = now.format("%Y-%m-%d").to_string();

            // Open the log file for appending.
            if let Ok(mut file) = OpenOptions::new().append(true).create(true).open(LOG_FILE) {
                // Write header if needed
                if last_log_date != today {
                    let header = format!("// {}\n", today);
                    if let Err(e) = file.write_all(header.as_bytes()) {
                        error!("Failed to write header: {}", e);
                    }
                    last_log_date = today.clone();
                }

                let locked = devices_clone.lock().await;
                let _status_map = status_map_clone.lock().await;  //Add _

                for dev in locked.iter() {
                    // Format the log entry
                    let log_entry = format!(
                        "{} - {}: Ping: {}, HTTP: {}, Bandwidth: {}\n",
                        timestamp,
                        dev.name,
                        dev.ping_status.map_or("N/A", |s| if s { "OK" } else { "FAIL" }),
                        dev.http_status.map_or("N/A", |s| if s { "OK" } else { "FAIL" }),
                        dev.bandwidth_usage.map_or("N/A".to_string(), |b| format!("{:.2} Mbps", b))
                    );

                    // Write the log entry
                    if let Err(e) = file.write_all(log_entry.as_bytes()) {
                        error!("Failed to write log entry: {}", e);
                    }
                }
                // Flush
                if let Err(e) = file.flush() {
                    error!("Failed to flush log file: {}", e);
                }
            } else {
                error!("Failed to open log file for writing");
            }
            sleep(Duration::from_secs(5)).await;
        }
    });

    if let Err(e) = rocket_instance.launch().await {
        error!("Failed to launch the web server: {}", e);
    }
}