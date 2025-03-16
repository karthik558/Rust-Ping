use std::process::Command;
use log::{info, error, debug};
use reqwest;
use tokio::time::{sleep, Duration};

pub async fn monitor_ping(ip: &str) -> bool {
    debug!("Pinging {}", ip);
    
    let mut success_count = 0;
    let attempts = 3; // Try 3 times before deciding status

    for i in 1..=attempts {
        let output = if cfg!(target_os = "macos") || cfg!(target_os = "linux") {
            Command::new("ping")
                .arg("-c")
                .arg("1")
                .arg("-t")  // Use -t for macOS timeout
                .arg("2")   // 2 second timeout
                .arg(ip)
                .output()
        } else {
            Command::new("ping")
                .arg("-n")
                .arg("1")
                .arg("-w")
                .arg("2000")
                .arg(ip)
                .output()
        };

        match output {
            Ok(output) => {
                if output.status.success() {
                    success_count += 1;
                    debug!("Ping attempt {} successful for {}", i, ip);
                } else {
                    debug!("Ping attempt {} failed for {}", i, ip);
                }
            }
            Err(e) => {
                error!("Ping attempt {} error for {}: {}", i, ip, e);
            }
        }

        // Short delay between attempts
        sleep(Duration::from_millis(200)).await;
    }

    // Consider it up if more than 50% attempts succeeded
    let status = success_count > attempts / 2;
    if status {
        info!("Ping UP for {} ({}/{} successful)", ip, success_count, attempts);
    } else {
        error!("Ping DOWN for {} ({}/{} failed)", ip, attempts - success_count, attempts);
    }
    
    status
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