use std::net::{IpAddr, SocketAddr, ToSocketAddrs};
use std::sync::Arc;

use reqwest::dns::{Addrs, Name, Resolve, Resolving};

/// True if `ip` is not routable on the public internet (loopback, private,
/// link-local — including the 169.254.169.254 cloud metadata range —
/// unspecified, or multicast). Used to block SSRF: `fetch_url_b64`/
/// `fetch_url_text` fetch URLs taken straight from an opened document's
/// content, server-side, with no user confirmation, so a malicious document
/// must not be able to make this app's backend reach internal-only services.
fn is_blocked(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => {
            v4.is_loopback()
                || v4.is_private()
                || v4.is_link_local()
                || v4.is_unspecified()
                || v4.is_multicast()
                || v4.is_broadcast()
                || v4.octets()[0] == 0 // 0.0.0.0/8 ("this network")
        }
        IpAddr::V6(v6) => {
            if v6.is_loopback() || v6.is_unspecified() || v6.is_multicast() {
                return true;
            }
            if let Some(v4) = v6.to_ipv4_mapped() {
                return is_blocked(IpAddr::V4(v4));
            }
            let seg0 = v6.segments()[0];
            (seg0 & 0xfe00) == 0xfc00 // unique local: fc00::/7
                || (seg0 & 0xffc0) == 0xfe80 // link-local unicast: fe80::/10
        }
    }
}

/// True if `url`'s host is an IP literal (`http://127.0.0.1/...`,
/// `http://169.254.169.254/...`) that names a blocked address. Hostname-based
/// SSRF is caught by `SsrfSafeResolver` below, but reqwest/hyper's connector
/// never invokes a custom `Resolve` when the host is already an IP literal —
/// there's nothing to resolve — so it would otherwise connect straight there,
/// completely bypassing the resolver-based guard. Must be checked explicitly
/// against both the initial request URL and every redirect target.
pub fn url_host_is_blocked(url: &reqwest::Url) -> bool {
    // Url::host(), not host_str() + parse::<IpAddr>(): host_str() returns an
    // IPv6 literal's host bracketed ("[::1]"), which IpAddr::from_str rejects
    // outright — silently defeating the check for exactly the case (IPv6
    // loopback) it most needs to catch. Host::Ipv6/Ipv4 sidestep the string
    // round-trip entirely.
    match url.host() {
        Some(url::Host::Ipv4(v4)) => is_blocked(IpAddr::V4(v4)),
        Some(url::Host::Ipv6(v6)) => is_blocked(IpAddr::V6(v6)),
        _ => false,
    }
}

/// A `reqwest::dns::Resolve` that performs ordinary DNS resolution and then
/// rejects the result if any resolved address is non-public. Since reqwest
/// re-resolves through this same resolver on every redirect hop, this also
/// blocks a public hostname that redirects to an internal address. Does
/// *not* cover IP-literal hosts — see `url_host_is_blocked` above.
#[derive(Debug, Default)]
struct SsrfSafeResolver;

impl Resolve for SsrfSafeResolver {
    fn resolve(&self, name: Name) -> Resolving {
        Box::pin(async move {
            let host = name.as_str().to_string();
            let addrs: Vec<SocketAddr> = tauri::async_runtime::spawn_blocking(move || {
                // Port 0 is the documented placeholder for `Resolve` impls — the
                // caller substitutes the real port (from the URL or the scheme's
                // default) before connecting.
                (host.as_str(), 0u16).to_socket_addrs()
            })
            .await
            .map_err(|e| -> Box<dyn std::error::Error + Send + Sync> {
                format!("DNS lookup task failed: {e}").into()
            })?
            .map_err(|e| -> Box<dyn std::error::Error + Send + Sync> {
                format!("DNS lookup failed: {e}").into()
            })?
            .collect();

            if addrs.is_empty() {
                return Err("DNS lookup returned no addresses".into());
            }
            if let Some(blocked) = addrs.iter().find(|a| is_blocked(a.ip())) {
                return Err(format!(
                    "refusing to connect to non-public address {}",
                    blocked.ip()
                )
                .into());
            }

            Ok(Box::new(addrs.into_iter()) as Addrs)
        })
    }
}

/// Builds an HTTP client for fetching URLs taken from document content
/// (remote image embeds, "Import from URL"). DNS resolution — including on
/// every redirect hop — rejects loopback/private/link-local targets; the
/// redirect policy additionally rejects a redirect straight to an IP literal,
/// which never goes through DNS resolution at all. Callers must still check
/// `url_host_is_blocked` against the *initial* request URL themselves — the
/// redirect policy only ever sees hop 2 onward.
pub fn build_ssrf_safe_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .dns_resolver(Arc::new(SsrfSafeResolver))
        .redirect(reqwest::redirect::Policy::custom(|attempt| {
            if url_host_is_blocked(attempt.url()) {
                attempt.error("refusing to redirect to a non-public address")
            } else {
                attempt.follow()
            }
        }))
        .build()
        .map_err(|e| format!("client error: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn blocks_loopback_private_and_link_local() {
        for addr in [
            "127.0.0.1", "127.53.0.1", "169.254.169.254", "10.0.0.1", "172.16.0.1",
            "192.168.1.1", "0.0.0.0", "::1", "fe80::1", "fc00::1",
        ] {
            let ip: IpAddr = addr.parse().unwrap();
            assert!(is_blocked(ip), "{addr} should be blocked");
        }
    }

    #[test]
    fn allows_public_addresses() {
        for addr in ["8.8.8.8", "1.1.1.1", "93.184.216.34", "2606:4700:4700::1111"] {
            let ip: IpAddr = addr.parse().unwrap();
            assert!(!is_blocked(ip), "{addr} should be allowed");
        }
    }

    #[test]
    fn blocks_ip_literal_urls_that_never_reach_the_dns_resolver() {
        for url in [
            "http://127.0.0.1/",
            "http://127.0.0.1:8998/fixture.md",
            "http://169.254.169.254/latest/meta-data/",
            "http://[::1]/",
            "https://10.0.0.5/internal",
        ] {
            let parsed = reqwest::Url::parse(url).unwrap();
            assert!(url_host_is_blocked(&parsed), "{url} should be blocked");
        }
    }

    #[test]
    fn allows_public_hostname_and_ip_urls() {
        for url in ["https://raw.githubusercontent.com/x", "https://8.8.8.8/"] {
            let parsed = reqwest::Url::parse(url).unwrap();
            assert!(!url_host_is_blocked(&parsed), "{url} should be allowed");
        }
    }
}
