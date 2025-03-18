use anyhow::Result;
use lettre::{
    transport::smtp::authentication::Credentials,
    AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::RwLock;
use std::fs;
use std::path::Path;
use log::{info, error};

const CONFIG_FILE: &str = "email_config.json";

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

pub struct EmailService {
    config: Arc<RwLock<EmailConfig>>,
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

    pub async fn send_email(&self, device_name: &str, log_data: &LogData) -> Result<()> {
        let config = self.config.read().await;
        
        if config.recipients.is_empty() {
            return Err(anyhow::anyhow!("No recipients configured"));
        }
        
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

        let creds = Credentials::new(
            config.sender_email.clone(),
            config.sender_password.clone(),
        );

        let mailer = AsyncSmtpTransport::<Tokio1Executor>::relay(&config.smtp_server)?
            .port(config.smtp_port)
            .credentials(creds)
            .build();

        mailer.send(email).await?;
        info!("Alert email sent to {} recipients for device {}", config.recipients.len(), device_name);
        Ok(())
    }

    pub async fn send_test_email(&self, test_email: &str) -> Result<()> {
        let config = self.config.read().await;
        
        if config.sender_email.is_empty() || config.sender_password.is_empty() {
            return Err(anyhow::anyhow!("Sender email or password not configured"));
        }
        
        let email = Message::builder()
            .from(config.sender_email.parse()?)
            .to(test_email.parse()?)
            .subject("RustPing Test Email")
            .header(lettre::message::header::ContentType::TEXT_PLAIN)
            .body("This is a test email from RustPing. If you're receiving this, your email configuration is working correctly!".to_string())?;

        let creds = Credentials::new(
            config.sender_email.clone(),
            config.sender_password.clone(),
        );

        let mailer = AsyncSmtpTransport::<Tokio1Executor>::relay(&config.smtp_server)?
            .port(config.smtp_port)
            .credentials(creds)
            .build();

        mailer.send(email).await?;
        info!("Test email sent to {}", test_email);
        Ok(())
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