// src/models.rs
use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)] // Add Eq
pub enum SensorType {
    Ping,
    Http,
    Https,
    Bandwidth,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Device {
    pub name: String,
    pub ip: String,
    pub sensors: Vec<SensorType>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ping_status: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub http_status: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bandwidth_usage: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub http_path: Option<String>
}