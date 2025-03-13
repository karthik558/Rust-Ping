use serde::{Serialize, Deserialize};
use std::net::IpAddr;

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct Device {
    pub name: String,
    pub ip: IpAddr,
    pub sensors: Vec<SensorType>,
    // Optional ping status: Some(true) if ping is OK, Some(false) if failed, None if not checked yet.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ping_status: Option<bool>,
    // Optional bandwidth usage in Mbps.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bandwidth_usage: Option<f32>,
    // Optional HTTP status: Some(true) if HTTP is OK, Some(false) if failed, None if not checked yet.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub http_status: Option<bool>,
    // Optional HTTP path for testing HTTP sensor.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub http_path: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "PascalCase")]
pub enum SensorType {
    Ping,
    Http,
    Https,
    CpuStatus,
    DiskStatus,
}

pub struct PingStatus {
    pub failed_attempts: u8,
    pub last_status: bool,
}

impl PingStatus {
    pub fn new() -> Self {
        Self {
            failed_attempts: 0,
            last_status: true,
        }
    }
}