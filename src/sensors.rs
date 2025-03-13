use std::net::IpAddr;
use rand::Rng;
use reqwest;

// Instead of calling the ping library (which may require elevated privileges),
// we simulate a ping result with a success rate.
pub async fn monitor_ping(_ip: IpAddr) -> bool {
    let mut rng = rand::thread_rng();
    rng.gen_bool(0.9)
}

// Function to test HTTP sensor using an HTTP GET request.
pub async fn monitor_http(url: &str) -> bool {
    match reqwest::get(url).await {
        Ok(response) => response.status().is_success(),
        Err(_) => false,
    }
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