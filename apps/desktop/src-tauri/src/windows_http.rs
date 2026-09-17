//! Windows HTTP GET using WinHTTP so corporate proxies get the current
//! logon (same idea as Edge / WinINET), instead of reqwest/curl sending
//! unauthenticated requests that come back as 401 on every host.

use std::ffi::c_void;
use windows::core::{w, HSTRING, PCWSTR};
use windows::Win32::Foundation::GetLastError;
use windows::Win32::Networking::WinHttp::{
    WinHttpAddRequestHeaders, WinHttpCloseHandle, WinHttpConnect, WinHttpOpen, WinHttpOpenRequest,
    WinHttpQueryDataAvailable, WinHttpQueryHeaders, WinHttpReadData, WinHttpReceiveResponse,
    WinHttpSendRequest, WinHttpSetOption, WinHttpSetTimeouts, WINHTTP_ACCESS_TYPE_AUTOMATIC_PROXY,
    WINHTTP_ADDREQ_FLAG_ADD, WINHTTP_AUTOLOGON_SECURITY_LEVEL_LOW, WINHTTP_DECOMPRESSION_FLAG_DEFLATE,
    WINHTTP_DECOMPRESSION_FLAG_GZIP, WINHTTP_FLAG_SECURE, WINHTTP_OPEN_REQUEST_FLAGS,
    WINHTTP_OPTION_AUTOLOGON_POLICY, WINHTTP_OPTION_DECOMPRESSION, WINHTTP_QUERY_FLAG_NUMBER,
    WINHTTP_QUERY_STATUS_CODE,
};

struct Handle(*mut c_void);

impl Drop for Handle {
    fn drop(&mut self) {
        if !self.0.is_null() {
            let _ = unsafe { WinHttpCloseHandle(self.0) };
        }
    }
}

pub(crate) struct ParsedUrl {
    https: bool,
    host: String,
    port: u16,
    path: String,
}

pub(crate) fn parse_http_url(url: &str) -> Result<ParsedUrl, String> {
    let https = if let Some(rest) = url.strip_prefix("https://") {
        (true, rest)
    } else if let Some(rest) = url.strip_prefix("http://") {
        (false, rest)
    } else {
        return Err(format!("{url}: only http(s) urls are allowed"));
    };
    let (https, rest) = https;
    if rest.is_empty() || rest.contains(['\n', '\r', '\0']) {
        return Err(format!("{url}: invalid url"));
    }
    let (hostport, path) = match rest.split_once('/') {
        Some((host, path)) => (host, format!("/{path}")),
        None => (rest, "/".to_string()),
    };
    if hostport.is_empty() || hostport.starts_with('[') {
        return Err(format!("{url}: invalid host"));
    }
    let (host, port) = if let Some((host, port)) = hostport.rsplit_once(':') {
        if host.is_empty() {
            return Err(format!("{url}: invalid host"));
        }
        let port: u16 = port
            .parse()
            .map_err(|_| format!("{url}: invalid port"))?;
        (host.to_string(), port)
    } else {
        (hostport.to_string(), if https { 443 } else { 80 })
    };
    Ok(ParsedUrl {
        https,
        host,
        port,
        path,
    })
}

pub fn get_text(
    url: &str,
    user_agent: &str,
    extra_headers: &[(&str, &str)],
) -> Result<String, String> {
    let bytes = get_bytes(url, user_agent, extra_headers)?;
    String::from_utf8(bytes).map_err(|e| format!("{url}: {e}"))
}

pub fn get_bytes(
    url: &str,
    user_agent: &str,
    extra_headers: &[(&str, &str)],
) -> Result<Vec<u8>, String> {
    let parsed = parse_http_url(url)?;
    unsafe { winhttp_get(&parsed, user_agent, extra_headers, url) }
}

fn last_error(url: &str, what: &str) -> String {
    format!("{url}: WinHTTP {what} failed ({:?})", unsafe { GetLastError() })
}

unsafe fn winhttp_get(
    parsed: &ParsedUrl,
    user_agent: &str,
    extra_headers: &[(&str, &str)],
    url: &str,
) -> Result<Vec<u8>, String> {
    let ua = HSTRING::from(user_agent);
    let session_raw = WinHttpOpen(&ua, WINHTTP_ACCESS_TYPE_AUTOMATIC_PROXY, None, None, 0);
    if session_raw.is_null() {
        return Err(last_error(url, "WinHttpOpen"));
    }
    let session = Handle(session_raw);
    WinHttpSetTimeouts(session.0, 10_000, 10_000, 20_000, 20_000)
        .map_err(|e| format!("{url}: WinHTTP WinHttpSetTimeouts {e}"))?;
    let decomp = (WINHTTP_DECOMPRESSION_FLAG_GZIP | WINHTTP_DECOMPRESSION_FLAG_DEFLATE).to_le_bytes();
    let _ = WinHttpSetOption(
        Some(session.0 as *const c_void),
        WINHTTP_OPTION_DECOMPRESSION,
        Some(&decomp),
    );

    let host = HSTRING::from(parsed.host.as_str());
    let connect_raw = WinHttpConnect(session.0, &host, parsed.port, 0);
    if connect_raw.is_null() {
        return Err(last_error(url, "WinHttpConnect"));
    }
    let connect = Handle(connect_raw);

    let path = HSTRING::from(parsed.path.as_str());
    let flags = if parsed.https {
        WINHTTP_FLAG_SECURE
    } else {
        WINHTTP_OPEN_REQUEST_FLAGS(0)
    };
    let request_raw = WinHttpOpenRequest(
        connect.0,
        w!("GET"),
        &path,
        None,
        None,
        std::ptr::null(),
        flags,
    );
    if request_raw.is_null() {
        return Err(last_error(url, "WinHttpOpenRequest"));
    }
    let request = Handle(request_raw);

    let autologon = WINHTTP_AUTOLOGON_SECURITY_LEVEL_LOW.to_le_bytes();
    let _ = WinHttpSetOption(
        Some(request.0 as *const c_void),
        WINHTTP_OPTION_AUTOLOGON_POLICY,
        Some(&autologon),
    );

    if !extra_headers.is_empty() {
        let joined = extra_headers
            .iter()
            .map(|(k, v)| format!("{k}: {v}"))
            .collect::<Vec<_>>()
            .join("\r\n");
        let header_w: Vec<u16> = joined.encode_utf16().collect();
        WinHttpAddRequestHeaders(request.0, &header_w, WINHTTP_ADDREQ_FLAG_ADD)
            .map_err(|e| format!("{url}: WinHTTP WinHttpAddRequestHeaders {e}"))?;
    }

    WinHttpSendRequest(request.0, None, None, 0, 0, 0)
        .map_err(|e| format!("{url}: WinHTTP WinHttpSendRequest {e}"))?;
    WinHttpReceiveResponse(request.0, std::ptr::null_mut())
        .map_err(|e| format!("{url}: WinHTTP WinHttpReceiveResponse {e}"))?;

    let mut status: u32 = 0;
    let mut status_len = std::mem::size_of::<u32>() as u32;
    WinHttpQueryHeaders(
        request.0,
        WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER,
        PCWSTR::null(),
        Some((&raw mut status).cast()),
        &mut status_len,
        std::ptr::null_mut(),
    )
    .map_err(|e| format!("{url}: WinHTTP WinHttpQueryHeaders {e}"))?;
    if !(200..300).contains(&status) {
        return Err(format!("{url}: WinHTTP HTTP {status}"));
    }

    let mut body = Vec::new();
    loop {
        let mut available: u32 = 0;
        WinHttpQueryDataAvailable(request.0, &mut available)
            .map_err(|e| format!("{url}: WinHTTP WinHttpQueryDataAvailable {e}"))?;
        if available == 0 {
            break;
        }
        let mut chunk = vec![0u8; available as usize];
        let mut read: u32 = 0;
        WinHttpReadData(
            request.0,
            chunk.as_mut_ptr().cast(),
            chunk.len() as u32,
            &mut read,
        )
        .map_err(|e| format!("{url}: WinHTTP WinHttpReadData {e}"))?;
        chunk.truncate(read as usize);
        if chunk.is_empty() {
            break;
        }
        body.extend_from_slice(&chunk);
        if body.len() > 20 * 1024 * 1024 {
            return Err(format!("{url}: WinHTTP response too large"));
        }
    }
    Ok(body)
}

#[cfg(test)]
mod tests {
    use super::parse_http_url;

    #[test]
    fn parses_https_release_json_url() {
        let parsed = parse_http_url(
            "https://fastly.jsdelivr.net/gh/nine-waited/ChestnutEditor@main/resources/chestnut-editor-releases.json",
        )
        .expect("url");
        assert!(parsed.https);
        assert_eq!(parsed.host, "fastly.jsdelivr.net");
        assert_eq!(parsed.port, 443);
        assert_eq!(
            parsed.path,
            "/gh/nine-waited/ChestnutEditor@main/resources/chestnut-editor-releases.json"
        );
    }

    #[test]
    fn parses_github_api_query() {
        let parsed = parse_http_url(
            "https://api.github.com/repos/nine-waited/ChestnutEditor/releases?per_page=30",
        )
        .expect("url");
        assert_eq!(parsed.host, "api.github.com");
        assert_eq!(
            parsed.path,
            "/repos/nine-waited/ChestnutEditor/releases?per_page=30"
        );
    }
}
