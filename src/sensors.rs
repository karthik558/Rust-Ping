use std::process::Command;
use log::{info, error, debug};
use reqwest;

pub async fn monitor_ping(ip: &str) -> bool {
    debug!("Attempting to ping {}", ip);
    
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

            let success = if cfg!(target_os = "macos") || cfg!(target_os = "linux") {
                output.status.success() && !stdout.contains("100.0% packet loss")
            } else {
                output.status.success() && stdout.contains("bytes=")
            };

            if success {
                info!("Successfully pinged {}", ip);
                true
            } else {
                error!("Failed to ping {}: {}", ip, stdout);
                false
            }
        }
        Err(e) => {
            error!("Error executing ping command for {}: {}", ip, e);
            false
        }
    }
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