// src/main.rs
extern crate rocket;

mod models;
mod sensors;
mod email;

use rocket::{get, post, delete, put, routes, State, response::Redirect, catch, catchers};
use rocket::serde::json::Json;
use rocket::fs::{NamedFile, FileServer, relative};
use models::{Device as ModelDevice, SensorType};
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
use chrono::{NaiveDate, Local, DateTime};
use rocket::response::content::RawText;
use rocket::http::{Status};
use rocket::request::{self, Request, FromRequest};
use rocket::outcome::Outcome;
use serde::Deserialize;
use rocket::serde::Serialize;
use email::EmailService;
use std::sync::atomic::{AtomicPtr, Ordering};
use serde_json::Value;
use rocket::http::ContentType;

static AUTH_CONFIG: AtomicPtr<serde_json::Value> = AtomicPtr::new(std::ptr::null_mut());

fn init_auth_config() {
    if let Ok(content) = fs::read_to_string("static/config.js") {
        if let Some(config_str) = content.strip_prefix("const AUTH_CONFIG = ") {
            if let Ok(config) = serde_json::from_str::<serde_json::Value>(config_str) {
                let config_ptr = Box::into_raw(Box::new(config));
                let old_ptr = AUTH_CONFIG.swap(config_ptr, Ordering::SeqCst);
                if !old_ptr.is_null() {
                    unsafe {
                        drop(Box::from_raw(old_ptr));
                    }
                }
            }
        }
    }
}

async fn process_logs(start_date_parsed: Option<NaiveDate>, end_date_parsed: Option<NaiveDate>) -> Vec<String> {
    let mut filtered_logs = Vec::new();
    if let Ok(contents) = fs::read_to_string(LOG_FILE) {
        for line in contents.lines() {
            if let Some((timestamp, rest)) = line.split_once(" - ") {
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
    ping_status: Option<bool>,
    http_status: Option<bool>,
    bandwidth_usage: Option<f64>,
    last_update: DateTime<Local>,
    changed_at: DateTime<Local>,
}

impl DeviceStatus {
    fn new() -> Self {
        let now = Local::now();
        Self {
            ping_status: None,
            http_status: None,
            bandwidth_usage: None,
            last_update: now,
            changed_at: now,
        }
    }

    fn update_ping(&mut self, new_status: bool) -> bool {
        let changed = self.ping_status != Some(new_status);
        if changed {
            self.ping_status = Some(new_status);
            self.changed_at = Local::now();
        }
        self.last_update = Local::now();
        changed
    }
}

// Use the new DeviceStatus struct in the type alias.
type DeviceStatusMap = Arc<Mutex<HashMap<String, DeviceStatus>>>;
type SharedDevices = Arc<Mutex<Vec<ModelDevice>>>;
type DeviceList = Arc<Mutex<Vec<WebDevice>>>;

static LOG_FILE: &str = "rustPing_running.log";

// Redirect / to /static/index.html (this is now optional, but good for clarity)
#[get("/")]
async fn index() -> Redirect {
    Redirect::to("/static/login.html")
}

#[get("/login")]
async fn login_page() -> Option<NamedFile> {
    NamedFile::open(Path::new("static/login.html")).await.ok()
}

// API to add a device.
#[post("/add_device", data = "<device>")]
async fn add_model_device(device: Json<ModelDevice>, devices: &State<SharedDevices>) -> &'static str {
    let mut dev = device.into_inner();
    if dev.sensors.contains(&SensorType::Ping) {
        let status = monitor_ping(&dev.ip).await;
        dev.ping_status = Some(status);
    }
    let mut devices_locked = devices.lock().await;
    devices_locked.push(dev);
    "Device added"
}

// API to get the list of devices.
#[get("/devices")]
async fn get_devices(_auth: Auth, devices: &State<SharedDevices>) -> Json<Vec<ModelDevice>> {
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
    let mut file_devices: Vec<ModelDevice> = from_str(&data).expect("JSON was not well-formatted");
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

// Add this struct for authentication
struct Auth;

#[derive(Debug)]
enum AuthError {
    Missing,
    Invalid,
}

// Implement request guard for Auth
#[rocket::async_trait]
impl<'r> FromRequest<'r> for Auth {
    type Error = AuthError;

    async fn from_request(request: &'r Request<'_>) -> request::Outcome<Self, Self::Error> {
        let cookies = request.cookies();
        
        match cookies.get("auth") {
            Some(cookie) if cookie.value() == "true" => Outcome::Success(Auth),
            _ => Outcome::Forward(Status::Unauthorized)
        }
    }
}

// Add catch handler for unauthorized requests
#[catch(401)]
fn unauthorized() -> Redirect {
    Redirect::to("/static/login.html")
}

// Protected routes
#[get("/static/index.html")]
async fn protected_index(_auth: Auth) -> Option<NamedFile> {
    NamedFile::open(Path::new("static/index.html")).await.ok()
}

#[get("/static/failed_logs.html")]
async fn protected_failed_logs(_auth: Auth) -> Option<NamedFile> {
    NamedFile::open(Path::new("static/failed_logs.html")).await.ok()
}

#[get("/static/log_view.html")]
async fn protected_log_view(_auth: Auth) -> Option<NamedFile> {
    NamedFile::open(Path::new("static/log_view.html")).await.ok()
}

#[get("/static/password-manager.html")]
async fn protected_password(_auth: Auth) -> Option<NamedFile> {
    NamedFile::open(Path::new("static/password-manager.html")).await.ok()
}

#[get("/static/manage-devices.html")]
async fn manage_device(_auth: Auth) -> Option<NamedFile> {
    NamedFile::open(Path::new("static/manage-devices.html")).await.ok()
}

#[derive(Deserialize)]
struct PasswordUpdate {
    hash: String,
}

#[post("/update-password", data = "<update>")]
async fn update_password(_auth: Auth, update: Json<PasswordUpdate>) -> Status {
    // Update the password hash in config.js
    let config_path = Path::new("static/config.js");
    let config_content = format!(
        "const AUTH_CONFIG = {{\n    username: 'admin',\n    passwordHash: '{}'\n}};",
        update.hash
    );
    
    match fs::write(config_path, config_content) {
        Ok(_) => Status::Ok,
        Err(_) => Status::InternalServerError,
    }
}

// Web Device struct - this is separate from the model Device
#[derive(Serialize, Deserialize, Clone)]
struct WebDevice {
    name: String,
    ip: String,
    category: String,
    sensors: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    http_path: Option<String>,
}

// Add this validation function
fn validate_device(device: &WebDevice, devices: &[WebDevice], exclude_index: Option<usize>) -> Result<(), &'static str> {
    // Check for empty or invalid values
    if device.name.trim().is_empty() {
        return Err("Device name cannot be empty");
    }
    if device.ip.trim().is_empty() {
        return Err("IP address cannot be empty");
    }
    if device.category.trim().is_empty() {
        return Err("Category cannot be empty");
    }
    if device.sensors.is_empty() {
        return Err("At least one sensor must be selected");
    }

    // Check for duplicates (excluding the current device if updating)
    for (index, existing) in devices.iter().enumerate() {
        if let Some(exclude) = exclude_index {
            if index == exclude {
                continue;
            }
        }
        if existing.name == device.name {
            return Err("Device name already exists");
        }
    }

    Ok(())
}

// Add this implementation before the add_web_device function
impl From<WebDevice> for ModelDevice {
    fn from(web_device: WebDevice) -> Self {
        ModelDevice {
            name: web_device.name,
            ip: web_device.ip,
            category: web_device.category,
            sensors: web_device.sensors.iter()
                .map(|s| match s.as_str() {
                    "Ping" => SensorType::Ping,
                    "Http" => SensorType::Http,
                    "Https" => SensorType::Https,
                    _ => SensorType::Ping
                })
                .collect(),
            http_path: web_device.http_path,
            ping_status: None,
            http_status: None,
            bandwidth_usage: None,
        }
    }
}

// Then modify the add_web_device function to use the conversion
#[post("/devices", data = "<device>")]
async fn add_web_device(device: &str, devices: &State<SharedDevices>) -> Status {
    let new_device: WebDevice = match serde_json::from_str(device) {
        Ok(dev) => dev,
        Err(e) => {
            error!("Failed to parse device JSON: {}", e);
            return Status::BadRequest;
        }
    };

    // Read and validate against existing devices
    let file_path = "devices.json";
    let content = match fs::read_to_string(file_path) {
        Ok(content) => content,
        Err(e) => {
            error!("Failed to read devices.json: {}", e);
            return Status::InternalServerError;
        }
    };

    let mut file_devices: Vec<WebDevice> = match serde_json::from_str(&content) {
        Ok(devices) => devices,
        Err(e) => {
            error!("Failed to parse devices.json: {}", e);
            return Status::InternalServerError;
        }
    };

    // Validate new device
    if let Err(e) = validate_device(&new_device, &file_devices, None) {
        error!("Validation failed: {}", e);
        return Status::BadRequest;
    }

    // Add device and write to file atomically
    file_devices.push(new_device.clone());
    if let Ok(json) = serde_json::to_string_pretty(&file_devices) {
        let temp_path = format!("{}.tmp", file_path);
        if let Err(e) = fs::write(&temp_path, &json) {
            error!("Failed to write temporary file: {}", e);
            return Status::InternalServerError;
        }
        if let Err(e) = fs::rename(&temp_path, file_path) {
            error!("Failed to rename temporary file: {}", e);
            return Status::InternalServerError;
        }
    } else {
        return Status::InternalServerError;
    }

    // Update in-memory state using From trait
    let mut devices_locked = devices.lock().await;
    devices_locked.push(ModelDevice::from(new_device.clone()));

    Status::Ok
}

#[delete("/devices/<index>")]
async fn delete_web_device(index: usize) -> Status {
    let file_path = "devices.json";
    
    // Read existing devices
    let content = match fs::read_to_string(file_path) {
        Ok(content) => content,
        Err(e) => {
            error!("Failed to read devices.json: {}", e);
            return Status::InternalServerError;
        }
    };
    
    let mut devices: Vec<WebDevice> = match serde_json::from_str(&content) {
        Ok(devices) => devices,
        Err(e) => {
            error!("Failed to parse devices.json: {}", e);
            return Status::InternalServerError;
        }
    };
    
    // Check if index is valid
    if index >= devices.len() {
        return Status::NotFound;
    }
    
    // Remove device at the specified index
    devices.remove(index);
    
    // Write updated devices back to file
    match serde_json::to_string_pretty(&devices) {
        Ok(json) => {
            if let Err(e) = fs::write(file_path, json) {
                error!("Failed to write devices.json: {}", e);
                return Status::InternalServerError;
            }
        },
        Err(e) => {
            error!("Failed to serialize devices: {}", e);
            return Status::InternalServerError;
        }
    }
    
    Status::Ok
}

// Update the update_device endpoint
#[put("/devices/<id>", data = "<device>")]
async fn update_device(id: usize, device: &str, devices: &State<SharedDevices>) -> Status {
    let updated_device: WebDevice = match serde_json::from_str(device) {
        Ok(dev) => dev,
        Err(e) => {
            error!("Failed to parse device JSON: {}", e);
            return Status::BadRequest;
        }
    };

    // Read current devices from file
    let file_path = "devices.json";
    let content = match fs::read_to_string(file_path) {
        Ok(content) => content,
        Err(e) => {
            error!("Failed to read devices.json: {}", e);
            return Status::InternalServerError;
        }
    };

    let mut file_devices: Vec<WebDevice> = match serde_json::from_str(&content) {
        Ok(devices) => devices,
        Err(e) => {
            error!("Failed to parse devices.json: {}", e);
            return Status::InternalServerError;
        }
    };

    // Check if index is valid
    if id >= file_devices.len() {
        error!("Device index {} out of bounds", id);
        return Status::NotFound;
    }

    // Check for duplicates (excluding current device)
    if file_devices.iter().enumerate().any(|(i, d)| 
        i != id && (d.name == updated_device.name || d.ip == updated_device.ip)
    ) {
        error!("Device with same name or IP already exists");
        return Status::Conflict;
    }

    // Update device in file array
    file_devices[id] = updated_device.clone();

    // Write to file atomically
    let temp_path = format!("{}.tmp", file_path);
    if let Ok(json) = serde_json::to_string_pretty(&file_devices) {
        if let Err(e) = fs::write(&temp_path, &json) {
            error!("Failed to write temporary file: {}", e);
            return Status::InternalServerError;
        }
        if let Err(e) = fs::rename(&temp_path, file_path) {
            error!("Failed to rename temporary file: {}", e);
            return Status::InternalServerError;
        }
    } else {
        return Status::InternalServerError;
    }

    // Update in-memory device
    let mut devices_locked = devices.lock().await;
    if id < devices_locked.len() {
        devices_locked[id] = ModelDevice {
            name: updated_device.name,
            ip: updated_device.ip,
            category: updated_device.category,
            sensors: updated_device.sensors.iter()
                .map(|s| match s.as_str() {
                    "Ping" => SensorType::Ping,
                    "Http" => SensorType::Http,
                    "Https" => SensorType::Https,
                    _ => SensorType::Ping
                })
                .collect(),
            http_path: updated_device.http_path,
            ping_status: None,
            http_status: None,
            bandwidth_usage: None,
        };
    }

    Status::Ok
}

// Add this function to reload devices from file
async fn reload_devices_from_file(file_path: &str, devices: SharedDevices) {
    match fs::read_to_string(file_path) {
        Ok(data) => {
            match from_str::<Vec<ModelDevice>>(&data) {
                Ok(mut file_devices) => {
                    // Initialize device status fields to None
                    for dev in file_devices.iter_mut() {
                        dev.ping_status = None;
                        dev.bandwidth_usage = None;
                        dev.http_status = None;
                    }
                    
                    // Update the shared devices list
                    let mut devices_locked = devices.lock().await;
                    *devices_locked = file_devices;
                    info!("Devices reloaded from file: {}", file_path);
                },
                Err(e) => error!("Failed to parse devices file: {}", e)
            }
        },
        Err(e) => error!("Failed to read devices file: {}", e)
    }
}

use env_logger;

#[get("/api/email/config")]
async fn get_email_config(email_service: &State<Arc<EmailService>>) -> Json<serde_json::Value> {
    let config = email_service.get_config().await;
    Json(json!(config))
}

#[post("/api/email/config", data = "<config>")]
async fn update_email_config(
    email_service: &State<Arc<EmailService>>,
    config: Json<email::EmailConfig>,
) -> Result<Json<serde_json::Value>, Status> {
    match email_service.update_config(config.into_inner()).await {
        Ok(_) => Ok(Json(json!({
            "status": "success",
            "message": "Email configuration updated successfully"
        }))),
        Err(e) => {
            error!("Failed to update email config: {}", e);
            Err(Status::InternalServerError)
        }
    }
}

#[derive(Deserialize)]
struct TestEmailRequest {
    test_email: String,
}

#[post("/api/email/config/test", data = "<request>")]
async fn send_test_email(
    email_service: &State<Arc<EmailService>>,
    request: Json<TestEmailRequest>,
) -> Result<Json<serde_json::Value>, Json<serde_json::Value>> {
    match email_service.send_test_email(&request.test_email).await {
        Ok(_) => Ok(Json(json!({
            "status": "success",
            "message": "Test email sent successfully"
        }))),
        Err(e) => {
            error!("Failed to send test email: {}", e);
            Err(Json(json!({
                "status": "error",
                "message": e.to_string()
            })))
        }
    }
}

#[get("/static/email_config.html")]
async fn email_config_page(_auth: Auth) -> Option<NamedFile> {
    NamedFile::open(Path::new("static/email_config.html")).await.ok()
}

#[post("/update-config", data = "<data>")]
async fn update_config(data: Json<serde_json::Value>) -> Status {
    if let Some(content) = data.get("content").and_then(|c| c.as_str()) {
        let config_path = Path::new("static/config.js");
        match fs::write(config_path, content) {
            Ok(_) => {
                // Also update the in-memory AUTH_CONFIG
                if let Ok(config_content) = content.parse::<String>() {
                    if let Some(config_str) = config_content.strip_prefix("const AUTH_CONFIG = ") {
                        if let Ok(config) = serde_json::from_str::<Value>(config_str) {
                            // Update the global AUTH_CONFIG
                            let new_config = Box::new(config);
                            let old_ptr = AUTH_CONFIG.swap(Box::into_raw(new_config), Ordering::SeqCst);
                            if !old_ptr.is_null() {
                                unsafe {
                                    drop(Box::from_raw(old_ptr));
                                }
                            }
                        }
                    }
                }
                Status::Ok
            }
            Err(e) => {
                eprintln!("Error updating config file: {}", e);
                Status::InternalServerError
            }
        }
    } else {
        Status::BadRequest
    }
}

#[tokio::main]
async fn main() {
    // Initialize AUTH_CONFIG
    init_auth_config();
    
    // Initialize logger with debug level
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("debug"))
        .init();
    
    info!("Starting RustPing Network Device Monitor...");

    let devices: SharedDevices = Arc::new(Mutex::new(Vec::new()));
    let email_service = Arc::new(EmailService::new());
    
    let rocket_instance = rocket::build()
        .manage(devices.clone())
        .manage(email_service.clone())
        .mount("/static", FileServer::from(relative!("static")).rank(2))
        .mount("/", routes![
            index,
            login_page,
            protected_index,
            protected_failed_logs,
            protected_log_view,
            add_model_device,
            get_devices,
            export_log,
            logs_json,
            failed_logs,
            protected_password,
            update_password,
            add_web_device,
            delete_web_device,
            manage_device,
            update_device,
            get_email_config,
            update_email_config,
            send_test_email,
            email_config_page,
            update_config,
        ])
        .register("/", catchers![unauthorized]);

    add_devices_from_file("devices.json", devices.clone()).await;

    // Spawn a periodic task to reload devices
    let devices_for_reload = devices.clone();
    tokio::spawn(async move {
        loop {
            // Wait for 30 seconds
            sleep(Duration::from_secs(30)).await;
            
            // Reload devices
            reload_devices_from_file("devices.json", devices_for_reload.clone()).await;
        }
    });

    // Spawn a background task.
    let devices_clone = devices.clone();
    let email_service_clone = email_service.clone();

    tokio::spawn(async move {
        let mut device_statuses: HashMap<String, DeviceStatus> = HashMap::new();
        
        loop {
            let devices_to_monitor: Vec<ModelDevice> = {
                let locked = devices_clone.lock().await;
                locked.clone()
            };

            let mut status_changed = false;

            for dev in devices_to_monitor {
                let status = device_statuses.entry(dev.ip.clone())
                    .or_insert_with(DeviceStatus::new);
                
                // First check ping
                let ping_result = monitor_ping(&dev.ip).await;
                if status.update_ping(ping_result) {
                    status_changed = true;
                }

                // Update device in shared state
                let mut devices_locked = devices_clone.lock().await;
                if let Some(device) = devices_locked.iter_mut().find(|d| d.ip == dev.ip) {
                    device.ping_status = status.ping_status;
                    
                    // Check HTTP and bandwidth if configured and ping is successful
                    if device.ping_status == Some(true) {
                        if device.sensors.contains(&SensorType::Http) || 
                           device.sensors.contains(&SensorType::Https) {
                            if let Some(ref url) = device.http_path {
                                match monitor_http(url).await {
                                    true => {
                                        device.http_status = Some(true);
                                        // Simulate bandwidth measurement only for successful HTTP connections
                                        device.bandwidth_usage = Some(rand::thread_rng().gen_range(10.0..1000.0));
                                        status_changed = true;
                                    },
                                    false => {
                                        device.http_status = Some(false);
                                        device.bandwidth_usage = None;
                                        status_changed = true;
                                    }
                                }
                            }
                        }
                    } else {
                        // If ping fails, mark HTTP as down and clear bandwidth
                        if device.sensors.contains(&SensorType::Http) || 
                           device.sensors.contains(&SensorType::Https) {
                            device.http_status = Some(false);
                            device.bandwidth_usage = None;
                            status_changed = true;
                        }
                    }
                }
            }

            // Write to log file when status changes
            if status_changed {
                if let Ok(mut file) = OpenOptions::new().append(true).create(true).open(LOG_FILE) {
                    let now = Local::now();
                    let devices_locked = devices_clone.lock().await;
                    
                    for dev in devices_locked.iter() {
                        let status = device_statuses.get(&dev.ip)
                            .cloned()
                            .unwrap_or_else(DeviceStatus::new);
                        
                        // Format HTTP status and bandwidth based on sensor configuration
                        let http_status = if dev.sensors.contains(&SensorType::Http) || 
                                           dev.sensors.contains(&SensorType::Https) {
                            dev.http_status.map_or("FAIL", |s| if s { "OK" } else { "FAIL" })
                        } else {
                            "N/A"
                        };
                        
                        let bandwidth = if (dev.sensors.contains(&SensorType::Http) || 
                                         dev.sensors.contains(&SensorType::Https)) && 
                                         dev.http_status == Some(true) {
                            dev.bandwidth_usage.map_or("N/A".to_string(), |b| format!("{:.2} Mbps", b))
                        } else {
                            "N/A".to_string()
                        };
                        
                        let ping_status_str = status.ping_status.map_or("N/A", |s| if s { "OK" } else { "FAIL" });
                        
                        let log_entry = format!(
                            "{} - {} ({}): Ping: {}, HTTP: {}, Bandwidth: {}\n",
                            now.format("%Y-%m-%d %H:%M:%S"),
                            dev.name,
                            dev.ip,
                            ping_status_str,
                            http_status,
                            bandwidth
                        );
                        
                        if let Err(e) = file.write_all(log_entry.as_bytes()) {
                            error!("Failed to write log entry: {}", e);
                        }
                        
                        // Send email notification if ping or HTTP status is FAIL
                        if ping_status_str == "FAIL" || http_status == "FAIL" {
                            // Create LogData for email
                            let log_data = email::LogData {
                                date: now.format("%Y-%m-%d").to_string(),
                                time: now.format("%H:%M:%S").to_string(),
                                ping_status: ping_status_str.to_string(),
                                http_status: http_status.to_string(),
                                bandwidth: bandwidth.clone(),
                            };
                            
                            // Send email notification in a separate task to avoid blocking
                            let device_name = dev.name.clone();
                            let email_service_clone = email_service_clone.clone();
                            tokio::spawn(async move {
                                if let Err(e) = email_service_clone.send_email(&device_name, &log_data).await {
                                    error!("Failed to send email notification: {}", e);
                                }
                            });
                        }
                    }
                }
            }

            sleep(Duration::from_secs(5)).await;
        }
    });

    if let Err(e) = rocket_instance.launch().await {
        error!("Failed to launch the web server: {}", e);
    }
}