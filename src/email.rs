use anyhow::Result;
use lettre::{
    transport::smtp::authentication::Credentials,
    AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor,
    transport::smtp::client::SmtpConnection,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::RwLock;
use std::fs;
use std::path::Path;
use log::{info, error, debug};
use tokio::time::timeout;
use std::time::Duration;
use std::error::Error;
use chrono::Utc;
use std::collections::HashMap;

const CONFIG_FILE: &str = "email_config.json";
const SMTP_TIMEOUT: Duration = Duration::from_secs(30); // Increased timeout to 30 seconds
const NOTIFICATION_INTERVAL: Duration = Duration::from_secs(1800); // 30 minutes
const LOG_COLLECTION_PERIOD: Duration = Duration::from_secs(1800); // 30 minutes

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EmailConfig {
    pub smtp_server: String,
    pub smtp_port: u16,
    pub sender_email: String,
    pub sender_password: String,
    pub recipients: Vec<String>,
    pub email_subject: String,
    pub email_body: String,
}

impl Default for EmailConfig {
    fn default() -> Self {
        Self {
            smtp_server: "smtp.gmail.com".to_string(),
            smtp_port: 587,
            sender_email: String::new(),
            sender_password: String::new(),
            recipients: Vec::new(),
            email_subject: "Failed Log Alert - {device_name}".to_string(),
            email_body: "Device {device_name} failed at {date} {time}\nPing Status: {ping_status}\nHTTP Status: {http_status}\nBandwidth: {bandwidth}".to_string(),
        }
    }
}

#[derive(Debug, Clone)]
pub struct DeviceStatus {
    pub name: String,
    pub status: String,
    pub timestamp: String,
    pub ping_status: String,
    pub http_status: String,
    pub bandwidth: String,
    pub failure_count: u32,
    pub last_failure: Option<String>,
}

pub struct EmailService {
    config: Arc<RwLock<EmailConfig>>,
    mailer: Arc<RwLock<Option<AsyncSmtpTransport<Tokio1Executor>>>>,
    pending_notifications: Arc<RwLock<Vec<DeviceStatus>>>,
    last_notification: Arc<RwLock<chrono::DateTime<Utc>>>,
    device_status_history: Arc<RwLock<HashMap<String, Vec<DeviceStatus>>>>,
}

impl EmailService {
    pub fn new() -> Self {
        let initial_config = Self::load_config_from_file()
            .unwrap_or_else(|_| {
                info!("No email configuration file found, using defaults");
                EmailConfig::default()
            });
            
        Self {
            config: Arc::new(RwLock::new(initial_config)),
            mailer: Arc::new(RwLock::new(None)),
            pending_notifications: Arc::new(RwLock::new(Vec::new())),
            last_notification: Arc::new(RwLock::new(Utc::now())),
            device_status_history: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    fn load_config_from_file() -> Result<EmailConfig> {
        let config_path = Path::new(CONFIG_FILE);
        if !config_path.exists() {
            return Err(anyhow::anyhow!("Configuration file does not exist"));
        }

        let config_str = fs::read_to_string(config_path)?;
        let config: EmailConfig = serde_json::from_str(&config_str)?;
        Ok(config)
    }

    async fn save_config_to_file(&self) -> Result<()> {
        let config = self.config.read().await;
        
        // Validate required fields
        if config.smtp_server.is_empty() || config.smtp_port == 0 {
            return Err(anyhow::anyhow!("SMTP server and port are required"));
        }
        
        if config.sender_email.is_empty() || config.sender_password.is_empty() {
            return Err(anyhow::anyhow!("Sender email and password are required"));
        }
        
        if config.recipients.is_empty() {
            return Err(anyhow::anyhow!("At least one recipient is required"));
        }
        
        let config_json = serde_json::to_string_pretty(&*config)?;
        
        // Write to a temporary file first to ensure atomic update
        let temp_path = format!("{}.tmp", CONFIG_FILE);
        fs::write(&temp_path, config_json)?;
        
        // Rename the temp file to the actual config file
        fs::rename(&temp_path, CONFIG_FILE)?;
        
        info!("Email configuration saved successfully");
        Ok(())
    }

    pub async fn update_config(&self, new_config: EmailConfig) -> Result<()> {
        // Validate the new configuration
        if new_config.smtp_server.is_empty() || new_config.smtp_port == 0 {
            return Err(anyhow::anyhow!("SMTP server and port are required"));
        }
        
        if new_config.sender_email.is_empty() || new_config.sender_password.is_empty() {
            return Err(anyhow::anyhow!("Sender email and password are required"));
        }
        
        if new_config.recipients.is_empty() {
            return Err(anyhow::anyhow!("At least one recipient is required"));
        }
        
        {
            let mut config = self.config.write().await;
            *config = new_config;
        }
        
        // Save the updated config to file
        self.save_config_to_file().await?;
        Ok(())
    }

    pub async fn get_config(&self) -> EmailConfig {
        self.config.read().await.clone()
    }

    async fn create_mailer(&self) -> Result<AsyncSmtpTransport<Tokio1Executor>> {
        let config = self.config.read().await;
        
        debug!("Creating SMTP connection to {}:{}", config.smtp_server, config.smtp_port);
        
        let creds = Credentials::new(
            config.sender_email.clone(),
            config.sender_password.clone(),
        );

        let mailer = AsyncSmtpTransport::<Tokio1Executor>::relay(&config.smtp_server)?
            .port(config.smtp_port)
            .credentials(creds)
            .timeout(Some(SMTP_TIMEOUT))
            .tls(lettre::transport::smtp::client::Tls::Required(
                lettre::transport::smtp::client::TlsParameters::new(config.smtp_server.clone())?
            ))
            .build();

        // Test the connection
        debug!("Testing SMTP connection...");
        mailer.test_connection().await?;
        debug!("SMTP connection test successful");

        Ok(mailer)
    }

    async fn get_mailer(&self) -> Result<AsyncSmtpTransport<Tokio1Executor>> {
        let mut mailer_lock = self.mailer.write().await;
        if mailer_lock.is_none() {
            debug!("Creating new SMTP connection");
            *mailer_lock = Some(self.create_mailer().await?);
        } else {
            debug!("Reusing existing SMTP connection");
        }
        Ok(mailer_lock.as_ref().unwrap().clone())
    }

    pub async fn add_notification(&self, device_name: &str, status: &str, log_data: &LogData) -> Result<()> {
        let device_status = DeviceStatus {
            name: device_name.to_string(),
            status: status.to_string(),
            timestamp: format!("{} {}", log_data.date, log_data.time),
            ping_status: log_data.ping_status.clone(),
            http_status: log_data.http_status.clone(),
            bandwidth: log_data.bandwidth.clone(),
            failure_count: 0,
            last_failure: None,
        };

        // Update device status history
        let mut history = self.device_status_history.write().await;
        let device_history = history.entry(device_name.to_string()).or_insert_with(Vec::new);
        device_history.push(device_status.clone());

        // Keep only the last 30 minutes of history
        let cutoff_time = Utc::now() - chrono::Duration::seconds(LOG_COLLECTION_PERIOD.as_secs() as i64);
        device_history.retain(|status| {
            if let Ok(timestamp) = chrono::NaiveDateTime::parse_from_str(&status.timestamp, "%Y-%m-%d %H:%M:%S") {
                timestamp >= cutoff_time.naive_utc()
            } else {
                false
            }
        });

        // Add to pending notifications if status is not OK
        if status != "OK" {
            let mut notifications = self.pending_notifications.write().await;
            notifications.push(device_status);
        }

        // Check if we should send notifications
        let last_notification = *self.last_notification.read().await;
        let now = Utc::now();
        let time_diff = (now - last_notification).num_seconds();
        if time_diff >= NOTIFICATION_INTERVAL.as_secs() as i64 {
            self.send_batch_notification().await?;
            *self.last_notification.write().await = now;
        }

        Ok(())
    }

    async fn send_batch_notification(&self) -> Result<()> {
        let notifications = self.pending_notifications.read().await;
        let history = self.device_status_history.read().await;
        if notifications.is_empty() && history.is_empty() {
            return Ok(());
        }

        let config = self.config.read().await;
        let now = Utc::now();
        let date = now.format("%Y-%m-%d %H:%M:%S").to_string();

        // Calculate statistics
        let total_devices = history.len();
        let ok_devices = history.values().filter(|h| h.last().map_or(false, |s| s.status == "OK")).count();
        let failed_devices = total_devices - ok_devices;
        let health_percentage = if total_devices > 0 {
            (ok_devices as f64 / total_devices as f64 * 100.0).round()
        } else {
            0.0
        };

        let health_class = if health_percentage >= 95.0 { "good" } else if health_percentage >= 80.0 { "warning" } else { "critical" };

        let html_body = format!(
            r#"
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body {{
                        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                        line-height: 1.6;
                        color: #2c3e50;
                        max-width: 1000px;
                        margin: 0 auto;
                        padding: 20px;
                        background-color: #f8f9fa;
                    }}
                    .container {{
                        background: white;
                        border-radius: 12px;
                        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                        padding: 30px;
                        margin-bottom: 20px;
                    }}
                    .header {{
                        background: linear-gradient(135deg, #007bff, #0056b3);
                        color: white;
                        padding: 25px;
                        border-radius: 8px;
                        margin-bottom: 25px;
                        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                    }}
                    .header h1 {{
                        margin: 0;
                        font-size: 28px;
                        font-weight: 600;
                    }}
                    .header p {{
                        margin: 10px 0 0;
                        opacity: 0.9;
                        font-size: 16px;
                    }}
                    .stats-container {{
                        display: grid;
                        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                        gap: 20px;
                        margin-bottom: 30px;
                    }}
                    .stat-card {{
                        background: white;
                        padding: 20px;
                        border-radius: 8px;
                        box-shadow: 0 2px 4px rgba(0,0,0,0.05);
                        text-align: center;
                    }}
                    .stat-value {{
                        font-size: 24px;
                        font-weight: 600;
                        margin: 10px 0;
                    }}
                    .stat-label {{
                        color: #6c757d;
                        font-size: 14px;
                    }}
                    .status-table {{
                        width: 100%;
                        border-collapse: separate;
                        border-spacing: 0;
                        margin-top: 20px;
                        background: white;
                        border-radius: 8px;
                        overflow: hidden;
                        box-shadow: 0 2px 4px rgba(0,0,0,0.05);
                    }}
                    .status-table th, .status-table td {{
                        padding: 15px;
                        text-align: left;
                        border-bottom: 1px solid #eee;
                    }}
                    .status-table th {{
                        background: #f8f9fa;
                        font-weight: 600;
                        color: #495057;
                    }}
                    .status-table tr:last-child td {{
                        border-bottom: none;
                    }}
                    .status-table tr:hover {{
                        background-color: #f8f9fa;
                    }}
                    .status-ok {{
                        color: #28a745;
                        font-weight: 500;
                    }}
                    .status-fail {{
                        color: #dc3545;
                        font-weight: 500;
                    }}
                    .footer {{
                        margin-top: 30px;
                        padding-top: 20px;
                        border-top: 1px solid #eee;
                        color: #6c757d;
                        font-size: 14px;
                        text-align: center;
                    }}
                    .health-indicator {{
                        display: inline-block;
                        width: 12px;
                        height: 12px;
                        border-radius: 50%;
                        margin-right: 8px;
                    }}
                    .health-good {{
                        background-color: #28a745;
                    }}
                    .health-warning {{
                        background-color: #ffc107;
                    }}
                    .health-critical {{
                        background-color: #dc3545;
                    }}
                    .status-details {{
                        font-size: 12px;
                        color: #6c757d;
                        margin-top: 4px;
                    }}
                    .bandwidth-value {{
                        font-family: monospace;
                        font-size: 13px;
                    }}
                    .history-chart {{
                        background: white;
                        padding: 20px;
                        border-radius: 8px;
                        box-shadow: 0 2px 4px rgba(0,0,0,0.05);
                        margin: 20px 0;
                    }}
                    .history-table {{
                        width: 100%;
                        border-collapse: separate;
                        border-spacing: 0;
                        margin-top: 10px;
                        font-size: 12px;
                    }}
                    .history-table th, .history-table td {{
                        padding: 8px;
                        text-align: left;
                        border-bottom: 1px solid #eee;
                    }}
                    .history-table th {{
                        background: #f8f9fa;
                        font-weight: 600;
                    }}
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>RustPing Status Report</h1>
                        <p>Generated on: {date}</p>
                    </div>

                    <div class="stats-container">
                        <div class="stat-card">
                            <div class="stat-value">{health_percentage}%</div>
                            <div class="stat-label">System Health</div>
                            <div class="health-indicator health-{health_class}"></div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-value">{total_devices}</div>
                            <div class="stat-label">Total Devices</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-value">{ok_devices}</div>
                            <div class="stat-label">Healthy Devices</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-value">{failed_devices}</div>
                            <div class="stat-label">Failed Devices</div>
                        </div>
                    </div>

                    <div class="history-chart">
                        <h3>Device Status History (Last 30 Minutes)</h3>
                        <table class="history-table">
                            <thead>
                                <tr>
                                    <th>Device</th>
                                    <th>Status</th>
                                    <th>Last Check</th>
                                    <th>Ping Status</th>
                                    <th>HTTP Status</th>
                                    <th>Bandwidth</th>
                                    <th>Details</th>
                                </tr>
                            </thead>
                            <tbody>
                                {history_rows}
                            </tbody>
                        </table>
                    </div>

                    <div class="status-table">
                        <h3>Current Status</h3>
                        <table>
                            <thead>
                                <tr>
                                    <th>Device Name</th>
                                    <th>Status</th>
                                    <th>Last Check</th>
                                    <th>Ping Status</th>
                                    <th>HTTP Status</th>
                                    <th>Bandwidth</th>
                                    <th>Details</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div class="footer">
                    <p>This is an automated message from RustPing monitoring system.</p>
                    <p>For more details, please visit the RustPing dashboard.</p>
                </div>
            </body>
            </html>
            "#,
            history_rows = history.iter().map(|(name, statuses)| {
                let latest = statuses.last().unwrap();
                let status_details = if latest.status == "OK" {
                    "All systems operational".to_string()
                } else {
                    format!("Last failure: {}", latest.last_failure.as_deref().unwrap_or("Unknown"))
                };
                format!(
                    r#"
                    <tr>
                        <td>{name}</td>
                        <td class="status-{status_class}">{status}</td>
                        <td>{timestamp}</td>
                        <td class="status-{ping_class}">{ping_status}</td>
                        <td class="status-{http_class}">{http_status}</td>
                        <td class="bandwidth-value">{bandwidth}</td>
                        <td>
                            <div class="status-details">
                                {status_details}
                            </div>
                        </td>
                    </tr>
                    "#,
                    name = name,
                    status = latest.status,
                    status_class = if latest.status == "OK" { "good" } else { "critical" },
                    timestamp = latest.timestamp,
                    ping_status = latest.ping_status,
                    ping_class = if latest.ping_status.contains("OK") { "good" } else if latest.ping_status.contains("Warning") { "warning" } else { "critical" },
                    http_status = latest.http_status,
                    http_class = if latest.http_status.contains("200") { "good" } else if latest.http_status.contains("3") { "warning" } else { "critical" },
                    bandwidth = latest.bandwidth,
                    status_details = status_details
                )
            }).collect::<Vec<_>>().join("\n"),
            rows = notifications.iter().map(|n| {
                let status_details = if n.status == "OK" {
                    "All systems operational".to_string()
                } else {
                    format!("Failure count: {}", n.failure_count)
                };
                format!(
                    r#"
                    <tr>
                        <td>{name}</td>
                        <td class="status-{status_class}">{status}</td>
                        <td>{timestamp}</td>
                        <td class="status-{ping_class}">{ping_status}</td>
                        <td class="status-{http_class}">{http_status}</td>
                        <td class="bandwidth-value">{bandwidth}</td>
                        <td>
                            <div class="status-details">
                                {status_details}
                            </div>
                        </td>
                    </tr>
                    "#,
                    name = n.name,
                    status = n.status,
                    status_class = if n.status == "OK" { "good" } else { "critical" },
                    timestamp = n.timestamp,
                    ping_status = n.ping_status,
                    ping_class = if n.ping_status.contains("OK") { "good" } else if n.ping_status.contains("Warning") { "warning" } else { "critical" },
                    http_status = n.http_status,
                    http_class = if n.http_status.contains("200") { "good" } else if n.http_status.contains("3") { "warning" } else { "critical" },
                    bandwidth = n.bandwidth,
                    status_details = status_details
                )
            }).collect::<Vec<_>>().join("\n")
        );

        let mut email_builder = Message::builder()
            .from(config.sender_email.parse()?)
            .subject(format!("RustPing Status Report - {}", date))
            .header(lettre::message::header::ContentType::TEXT_HTML);

        // Add all recipients
        for recipient in &config.recipients {
            email_builder = email_builder.to(recipient.parse()?);
        }

        let email = email_builder.body(html_body)?;

        debug!("Getting SMTP connection");
        let mailer = self.get_mailer().await?;

        debug!("Sending batch notification email...");
        match timeout(SMTP_TIMEOUT, mailer.send(email)).await {
            Ok(Ok(_)) => {
                info!("Batch notification email sent successfully to {} recipients", config.recipients.len());
                // Clear pending notifications after successful send
                let mut notifications = self.pending_notifications.write().await;
                notifications.clear();
                Ok(())
            }
            Ok(Err(e)) => {
                error!("Failed to send batch notification email: {}", e);
                if let Some(io_error) = e.source().and_then(|s| s.downcast_ref::<std::io::Error>()) {
                    error!("IO error details: {}", io_error);
                }
                Err(anyhow::anyhow!("Failed to send batch notification email: {}", e))
            }
            Err(_) => {
                error!("Batch notification email send timed out after {} seconds", SMTP_TIMEOUT.as_secs());
                Err(anyhow::anyhow!("Batch notification email send timed out after {} seconds", SMTP_TIMEOUT.as_secs()))
            }
        }
    }

    pub async fn send_email(&self, device_name: &str, log_data: &LogData) -> Result<()> {
        let config = self.config.read().await;
        
        if config.recipients.is_empty() {
            return Err(anyhow::anyhow!("No recipients configured"));
        }
        
        if config.sender_email.is_empty() || config.sender_password.is_empty() {
            return Err(anyhow::anyhow!("Sender email or password not configured"));
        }
        
        debug!("Preparing alert email for device {}", device_name);
        
        let subject = config.email_subject
            .replace("{device_name}", device_name)
            .replace("{date}", &log_data.date)
            .replace("{time}", &log_data.time);

        let body = config.email_body
            .replace("{device_name}", device_name)
            .replace("{date}", &log_data.date)
            .replace("{time}", &log_data.time)
            .replace("{ping_status}", &log_data.ping_status)
            .replace("{http_status}", &log_data.http_status)
            .replace("{bandwidth}", &log_data.bandwidth);

        let mut email_builder = Message::builder()
            .from(config.sender_email.parse()?)
            .subject(subject)
            .header(lettre::message::header::ContentType::TEXT_PLAIN);
            
        // Add all recipients
        for recipient in &config.recipients {
            email_builder = email_builder.to(recipient.parse()?);
        }
        
        let email = email_builder.body(body)?;

        debug!("Getting SMTP connection");
        let mailer = self.get_mailer().await?;

        debug!("Sending alert email...");
        match timeout(SMTP_TIMEOUT, mailer.send(email)).await {
            Ok(Ok(_)) => {
                info!("Alert email sent successfully to {} recipients for device {}", config.recipients.len(), device_name);
                Ok(())
            }
            Ok(Err(e)) => {
                error!("Failed to send alert email: {}", e);
                // Log more details about the error
                if let Some(io_error) = e.source().and_then(|s| s.downcast_ref::<std::io::Error>()) {
                    error!("IO error details: {}", io_error);
                }
                Err(anyhow::anyhow!("Failed to send alert email: {}", e))
            }
            Err(_) => {
                error!("Alert email send timed out after {} seconds", SMTP_TIMEOUT.as_secs());
                Err(anyhow::anyhow!("Alert email send timed out after {} seconds", SMTP_TIMEOUT.as_secs()))
            }
        }
    }

    pub async fn send_test_email(&self, test_email: &str) -> Result<()> {
        let config = self.config.read().await;
        
        if config.sender_email.is_empty() || config.sender_password.is_empty() {
            return Err(anyhow::anyhow!("Sender email or password not configured"));
        }
        
        if test_email.is_empty() {
            return Err(anyhow::anyhow!("Test email address is required"));
        }
        
        debug!("Preparing test email to {}", test_email);
        
        let email = Message::builder()
            .from(config.sender_email.parse()?)
            .to(test_email.parse()?)
            .subject("RustPing Test Email")
            .header(lettre::message::header::ContentType::TEXT_PLAIN)
            .body("This is a test email from RustPing. If you're receiving this, your email configuration is working correctly!".to_string())?;

        debug!("Getting SMTP connection");
        let mailer = self.get_mailer().await?;

        debug!("Sending test email...");
        match timeout(SMTP_TIMEOUT, mailer.send(email)).await {
            Ok(Ok(_)) => {
                info!("Test email sent successfully to {}", test_email);
                Ok(())
            }
            Ok(Err(e)) => {
                error!("Failed to send test email: {}", e);
                // Log more details about the error
                if let Some(io_error) = e.source().and_then(|s| s.downcast_ref::<std::io::Error>()) {
                    error!("IO error details: {}", io_error);
                }
                Err(anyhow::anyhow!("Failed to send test email: {}", e))
            }
            Err(_) => {
                error!("Test email send timed out after {} seconds", SMTP_TIMEOUT.as_secs());
                Err(anyhow::anyhow!("Test email send timed out after {} seconds", SMTP_TIMEOUT.as_secs()))
            }
        }
    }
}

#[derive(Debug)]
pub struct LogData {
    pub date: String,
    pub time: String,
    pub ping_status: String,
    pub http_status: String,
    pub bandwidth: String,
} 