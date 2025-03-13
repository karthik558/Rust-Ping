extern crate rocket;

mod models;
mod sensors;

use rocket::{get, post, routes, State};
use rocket::serde::json::Json;
use rocket::fs::{NamedFile, FileServer, relative};
use models::{Device, SensorType};
use log::{info, error};
use sensors::{monitor_ping, monitor_http, PingStatus};
use std::fs::{self, OpenOptions};
use std::io::{Read, Write};
use serde_json::{self, json};
use serde_json::from_str;
use std::path::Path;
use tokio::time::{sleep, Duration};
use rand::Rng;
use std::sync::Arc;
use tokio::sync::Mutex;
use chrono::{Utc, NaiveDate};
use rocket::response::content::RawText;
use std::collections::HashMap;

type DeviceStatusMap = Arc<Mutex<HashMap<String, PingStatus>>>;

type SharedDevices = Arc<Mutex<Vec<Device>>>;

static LOG_FILE: &str = "rustPing_running.log";

// Serve the dashboard page.
#[get("/")]
async fn index() -> Option<NamedFile> {
    NamedFile::open(Path::new("static/index.html")).await.ok()
}

// API to add a device.
#[post("/add_device", data = "<device>")]
async fn add_device(device: Json<Device>, devices: &State<SharedDevices>) -> &'static str {
    let mut dev = device.into_inner();
    if dev.sensors.contains(&SensorType::Ping) {
        let status = monitor_ping(dev.ip).await;
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
/// Query parameters:
/// - devices: comma separated device names (exact match, case-insensitive). Leave empty for all.
/// - start_date: date string in "YYYY-MM-DD" format
/// - end_date: date string in "YYYY-MM-DD" format
/// - format: "csv" or "txt" (default is txt)
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

    // Split and trim device filter names, if provided.
    let device_filters: Option<Vec<String>> = devices.map(|d| {
        d.split(',')
         .map(|s| s.trim().to_lowercase())
         .collect()
    });

    // Process each log line.
    // Log lines expected in format:
    // "YYYY-MM-DD HH:MM:SS - DeviceName: Ping: OK, HTTP: OK, Bandwidth: 123.45 Mbps"
    for line in lines {
        // Skip header lines starting with "//" unless needed for CSV header.
        if line.starts_with("//") {
            filtered_lines.push(line);
            continue;
        }
        // Split the line to extract timestamp and device name.
        if let Some((timestamp, rest)) = line.split_once(" - ") {
            // Extract date portion (first 10 characters).
            let date_str = &timestamp[..10];
            if let Ok(entry_date) = NaiveDate::parse_from_str(date_str, "%Y-%m-%d") {
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
                // Extract device name from remainder (before the first colon).
                if let Some((device_name, _)) = rest.split_once(":") {
                    let device_name_trim = device_name.trim().to_lowercase();
                    if let Some(ref filters) = device_filters {
                        // Only include if one of the filters exactly matches the device name.
                        let mut found = false;
                        for f in filters {
                            if device_name_trim == *f {
                                found = true;
                                break;
                            }
                        }
                        if !found {
                            include = false;
                        }
                    }
                }
                if include {
                    filtered_lines.push(line);
                }
            }
        }
    }

    let output = if let Some(fmt) = format {
        if fmt.to_lowercase() == "csv" {
            // Build CSV header and convert log entries.
            let mut csv_lines = vec!["Timestamp,Device,Ping,HTTP,Bandwidth".to_string()];
            for line in filtered_lines {
                if line.starts_with("//") {
                    continue;
                }
                // Expected format: "YYYY-MM-DD HH:MM:SS - DeviceName: Ping: OK, HTTP: OK, Bandwidth: 123.45 Mbps"
                if let Some((timestamp, rest)) = line.split_once(" - ") {
                    if let Some((device_part, statuses)) = rest.split_once(": ") {
                        let cols: Vec<&str> = statuses.split(", ").collect();
                        let ping = cols.get(0).unwrap_or(&"").replace("Ping: ", "");
                        let http = cols.get(1).unwrap_or(&"").replace("HTTP: ", "");
                        let bandwidth = cols.get(2).unwrap_or(&"").replace("Bandwidth: ", "");
                        let csv_line = format!("{},{},{},{},{}", timestamp, device_part, ping, http, bandwidth);
                        csv_lines.push(csv_line);
                    }
                }
            }
            csv_lines.join("\n")
        } else {
            // Default plain text output.
            filtered_lines.join("\n")
        }
    } else {
        filtered_lines.join("\n")
    };

    RawText(output)
}

/// New endpoint to expose logs as JSON.
/// It reads the log file, skips header lines, and parses each log entry.
///
/// Expected log entry format:
/// "YYYY-MM-DD HH:MM:SS - DeviceName: Ping: OK, HTTP: OK, Bandwidth: 123.45 Mbps"
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
        // Expects format: "YYYY-MM-DD HH:MM:SS - DeviceName: Ping: OK, HTTP: OK, Bandwidth: 123.45 Mbps"
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

/// # New route for failed logs.
#[get("/failed_logs")]
async fn failed_logs() -> Option<NamedFile> {
    NamedFile::open(Path::new("static/failed_logs.html")).await.ok()
}

#[rocket::main]
async fn main() {
    env_logger::init();
    info!("Starting RustPing Network Device Monitor...");

    let devices: SharedDevices = Arc::new(Mutex::new(Vec::new()));
    let rocket_instance = rocket::build()
        .manage(devices.clone())
        .mount("/", routes![index, add_device, get_devices, export_log, logs_json, failed_logs])
        .mount("/static", FileServer::from(relative!("static")));

    add_devices_from_file("devices.json", devices.clone()).await;

    // Track last logged date so that a new header is inserted once per day.
    let mut last_log_date = String::new();

    // Spawn a background task to update device status and log the status every 5 seconds.
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
                        (dev.ip, dev.name.clone(), dev.sensors.clone(), dev.http_path.clone())
                    } else {
                        continue;
                    }
                };

                let mut ping_status = None;
                if sensors.contains(&SensorType::Ping) {
                    // Perform multiple ping attempts
                    let mut success_count = 0;
                    let mut failure_count = 0;
                    for _ in 0..5 {  // Try 5 times
                        if monitor_ping(ip).await {
                            success_count += 1;
                        } else {
                            failure_count += 1;
                        }
                        sleep(Duration::from_millis(500)).await;  // 500ms between pings
                    }
                    
                    // Consider it a success if at least 3 out of 5 pings succeeded
                    let current_status = success_count >= 3;
                    ping_status = Some(current_status);

                    // Update the status tracking
                    let mut status_map = status_map_clone.lock().await;
                    let device_status = status_map.entry(name.clone()).or_insert_with(PingStatus::new);
                    
                    if !current_status {
                        device_status.failed_attempts += 1;
                    } else {
                        device_status.failed_attempts = 0;
                    }
                    device_status.last_status = current_status;
                }

                // Rest of the monitoring code remains the same
                let bandwidth_usage = if sensors.contains(&SensorType::Http) || sensors.contains(&SensorType::Https) {
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
                // If no header written for today, write one.
                if last_log_date != today {
                    let header = format!("// {}\n", today);
                    if let Err(e) = file.write_all(header.as_bytes()) {
                        error!("Failed to write header: {}", e);
                    }
                    last_log_date = today.clone();
                }

                let locked = devices_clone.lock().await;
                let status_map = status_map_clone.lock().await;
                
                for dev in locked.iter() {
                    if let Some(device_status) = status_map.get(&dev.name) {
                        // Only log if we have 8 or more consecutive failures
                        let ping_critical = device_status.failed_attempts >= 8;
                        let http_failed = dev.http_status == Some(false);
                        
                        if ping_critical || http_failed {
                            let log_line = format!(
                                "{} - {}: Ping: {} (Failed attempts: {}), HTTP: {}, Bandwidth: {}{}\n",
                                timestamp,
                                dev.name,
                                match dev.ping_status {
                                    Some(true) => "OK",
                                    Some(false) => "FAIL",
                                    None => "Unknown",
                                },
                                device_status.failed_attempts,
                                match dev.http_status {
                                    Some(true) => "OK",
                                    Some(false) => "FAIL",
                                    None => "Unknown",
                                },
                                match dev.bandwidth_usage {
                                    Some(val) => format!("{:.2} Mbps", val),
                                    None => "-".to_string(),
                                },
                                ""
                            );
                            if let Err(e) = file.write_all(log_line.as_bytes()) {
                                error!("Failed to write log: {}", e);
                            }
                        }
                    }
                }
            } else {
                error!("Cannot open log file for appending.");
            }
            sleep(Duration::from_secs(5)).await;
        }
    });

    if let Err(e) = rocket_instance.launch().await {
        error!("Failed to launch the web server: {}", e);
    }
}