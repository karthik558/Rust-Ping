use std::process::Command;
use log::{info, error, debug};
use reqwest;
use tokio::time::{sleep, Duration};

pub async fn monitor_ping(ip: &str) -> bool {
    debug!("Attempting to ping {} (10 requests)", ip);
    
    let mut success_count = 0;
    
    // Send 10 ping requests
    for attempt in 1..=10 {
        debug!("Ping attempt {} of 10 for {}", attempt, ip);
        
        let output = if cfg!(target_os = "macos") || cfg!(target_os = "linux") {
            Command::new("ping")
                .arg("-c")
                .arg("1")
                .arg("-W")
                .arg("2")
                .arg(ip)
                .output()
        } else {
            Command::new("ping")
                .arg("-n")
                .arg("1")
                .arg(ip)
                .output()
        };

        match output {
            Ok(output) => {
                let stdout = String::from_utf8_lossy(&output.stdout);
                let stderr = String::from_utf8_lossy(&output.stderr);
                
                debug!("Ping stdout: {}", stdout);
                if !stderr.is_empty() {
                    debug!("Ping stderr: {}", stderr);
                }

                let ping_success = if cfg!(target_os = "macos") || cfg!(target_os = "linux") {
                    output.status.success() && !stdout.contains("100.0% packet loss")
                } else {
                    output.status.success() && stdout.contains("bytes=")
                };

                if ping_success {
                    success_count += 1;
                }
            }
            Err(e) => {
                error!("Error executing ping command for {}: {}", ip, e);
            }
        }

        // Add a small delay between pings to prevent flooding
        sleep(Duration::from_millis(200)).await;
    }

    // Calculate success rate (consider up if 70% or more pings successful)
    let success_rate = (success_count as f32 / 10.0) * 100.0;
    let is_up = success_rate >= 70.0;

    if is_up {
        info!("Device {} is UP ({}% success rate)", ip, success_rate);
    } else {
        error!("Device {} is DOWN ({}% success rate)", ip, success_rate);
    }

    is_up
}

pub async fn monitor_http(url: &str) -> bool {
    debug!("Checking HTTP status for {}", url);
    
    match reqwest::get(url).await {
        Ok(response) => {
            let status = response.status();
            let success = status.is_success();
            if success {
                info!("HTTP check successful for {}: {}", url, status);
            } else {
                error!("HTTP check failed for {}: {}", url, status);
            }
            success
        },
        Err(e) => {
            error!("HTTP request failed for {}: {}", url, e);
            false
        }
    }
}