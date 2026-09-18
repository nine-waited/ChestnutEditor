//! Windows HTTP GET using WinINET current-user settings, then IE/PAC-aware WinHTTP.
//! Corporate PCs often block direct connects (WinHTTP 0x80072EFD) while
//! reqwest + env proxy returns 401 on every host without default logon.

use std::ffi::c_void;
use windows::core::{w, HSTRING, PCWSTR, PWSTR};
use windows::Win32::Foundation::{GetLastError, GlobalFree, HGLOBAL};
use windows::Win32::Networking::WinHttp::{
    WinHttpAddRequestHeaders, WinHttpCloseHandle, WinHttpConnect,
    WinHttpGetIEProxyConfigForCurrentUser, WinHttpGetProxyForUrl, WinHttpOpen, WinHttpOpenRequest,
    WinHttpQueryDataAvailable, WinHttpQueryHeaders, WinHttpReadData, WinHttpReceiveResponse,
    WinHttpSendRequest, WinHttpSetOption, WinHttpSetTimeouts, WINHTTP_ACCESS_TYPE,
    WINHTTP_ACCESS_TYPE_AUTOMATIC_PROXY, WINHTTP_ACCESS_TYPE_NAMED_PROXY, WINHTTP_ADDREQ_FLAG_ADD,
    WINHTTP_AUTOPROXY_AUTO_DETECT, WINHTTP_AUTOPROXY_CONFIG_URL, WINHTTP_AUTOPROXY_OPTIONS,
    WINHTTP_AUTO_DETECT_TYPE_DHCP, WINHTTP_AUTO_DETECT_TYPE_DNS_A,
    WINHTTP_CURRENT_USER_IE_PROXY_CONFIG, WINHTTP_DECOMPRESSION_FLAG_DEFLATE,
    WINHTTP_DECOMPRESSION_FLAG_GZIP, WINHTTP_FLAG_SECURE, WINHTTP_OPEN_REQUEST_FLAGS,
    WINHTTP_OPTION_DECOMPRESSION, WINHTTP_PROXY_INFO, WINHTTP_QUERY_FLAG_NUMBER,
    WINHTTP_QUERY_STATUS_CODE,
};
use windows::Win32::Networking::WinInet::{
    HttpQueryInfoW, InternetCloseHandle, InternetOpenUrlW, InternetOpenW, InternetReadFile,
    InternetSetOptionW, HTTP_QUERY_FLAG_NUMBER, HTTP_QUERY_PROXY_AUTHENTICATE, HTTP_QUERY_SERVER,
    HTTP_QUERY_STATUS_CODE, HTTP_QUERY_VIA, HTTP_QUERY_WWW_AUTHENTICATE,
    INTERNET_FLAG_KEEP_CONNECTION, INTERNET_FLAG_NO_CACHE_WRITE, INTERNET_FLAG_RELOAD,
    INTERNET_OPEN_TYPE_PRECONFIG, INTERNET_OPTION_CONNECT_TIMEOUT, INTERNET_OPTION_HTTP_DECODING,
    INTERNET_OPTION_RECEIVE_TIMEOUT, INTERNET_OPTION_SEND_TIMEOUT,
};

struct WinHttpHandle(*mut c_void);
impl Drop for WinHttpHandle {
    fn drop(&mut self) {
        if !self.0.is_null() {
            let _ = unsafe { WinHttpCloseHandle(self.0) };
        }
    }
}

struct WinInetHandle(*mut c_void);
impl Drop for WinInetHandle {
    fn drop(&mut self) {
        if !self.0.is_null() {
            let _ = unsafe { InternetCloseHandle(self.0 as *const c_void) };
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
        let port: u16 = port.parse().map_err(|_| format!("{url}: invalid port"))?;
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
    get_bytes_with_progress(url, user_agent, extra_headers, |_| {})
}

pub fn get_bytes_with_progress(
    url: &str,
    user_agent: &str,
    extra_headers: &[(&str, &str)],
    mut on_progress: impl FnMut(u64),
) -> Result<Vec<u8>, String> {
    let parsed = parse_http_url(url)?;
    let mut errors = Vec::new();
    match unsafe { wininet_get(url, user_agent, extra_headers, &mut on_progress) } {
        Ok(body) => return Ok(body),
        Err(err) => errors.push(err),
    }
    match unsafe {
        winhttp_get_with_ie_proxy(&parsed, user_agent, extra_headers, url, &mut on_progress)
    } {
        Ok(body) => return Ok(body),
        Err(err) => errors.push(err),
    }
    Err(errors.join(" | "))
}

fn last_error(url: &str, what: &str) -> String {
    format!("{url}: {what} failed ({:?})", unsafe { GetLastError() })
}

fn header_wide(extra_headers: &[(&str, &str)]) -> Option<Vec<u16>> {
    if extra_headers.is_empty() {
        return None;
    }
    let joined = extra_headers
        .iter()
        .map(|(k, v)| format!("{k}: {v}"))
        .collect::<Vec<_>>()
        .join("\r\n");
    Some(joined.encode_utf16().collect())
}

fn pwstr_to_string(p: PWSTR) -> Option<String> {
    if p.is_null() {
        return None;
    }
    unsafe { p.to_string().ok() }.filter(|s| !s.is_empty())
}

fn global_free_pwstr(p: PWSTR) {
    if !p.is_null() {
        let _ = unsafe { GlobalFree(Some(HGLOBAL(p.0 as *mut c_void))) };
    }
}

fn set_inet_timeout(handle: *mut c_void, option: u32, ms: u32) {
    let value = ms;
    let _ = unsafe {
        InternetSetOptionW(
            Some(handle as *const c_void),
            option,
            Some((&raw const value).cast()),
            std::mem::size_of::<u32>() as u32,
        )
    };
}

unsafe fn wininet_header(handle: *const c_void, query: u32) -> Option<String> {
    let mut buf = [0u16; 512];
    let mut len = (buf.len() * std::mem::size_of::<u16>()) as u32;
    HttpQueryInfoW(handle, query, Some(buf.as_mut_ptr().cast()), &mut len, None).ok()?;
    let units = (len as usize / std::mem::size_of::<u16>()).min(buf.len());
    let value = String::from_utf16_lossy(&buf[..units])
        .trim_end_matches('\0')
        .trim()
        .to_string();
    (!value.is_empty()).then_some(value)
}

unsafe fn wininet_http_diagnostics(handle: *const c_void) -> String {
    [
        ("server", wininet_header(handle, HTTP_QUERY_SERVER)),
        ("via", wininet_header(handle, HTTP_QUERY_VIA)),
        (
            "www-authenticate",
            wininet_header(handle, HTTP_QUERY_WWW_AUTHENTICATE),
        ),
        (
            "proxy-authenticate",
            wininet_header(handle, HTTP_QUERY_PROXY_AUTHENTICATE),
        ),
    ]
    .into_iter()
    .filter_map(|(key, value)| value.map(|value| format!("{key}={value}")))
    .collect::<Vec<_>>()
    .join(", ")
}

unsafe fn wininet_get(
    url: &str,
    user_agent: &str,
    extra_headers: &[(&str, &str)],
    on_progress: &mut dyn FnMut(u64),
) -> Result<Vec<u8>, String> {
    let ua = HSTRING::from(user_agent);
    let session_raw = InternetOpenW(&ua, INTERNET_OPEN_TYPE_PRECONFIG.0, None, None, 0);
    if session_raw.is_null() {
        return Err(last_error(url, "WinINET InternetOpen"));
    }
    let session = WinInetHandle(session_raw);
    set_inet_timeout(session.0, INTERNET_OPTION_CONNECT_TIMEOUT, 10_000);
    set_inet_timeout(session.0, INTERNET_OPTION_SEND_TIMEOUT, 20_000);
    set_inet_timeout(session.0, INTERNET_OPTION_RECEIVE_TIMEOUT, 20_000);
    let decode: i32 = 1;
    let _ = InternetSetOptionW(
        Some(session.0 as *const c_void),
        INTERNET_OPTION_HTTP_DECODING,
        Some((&raw const decode).cast()),
        std::mem::size_of::<i32>() as u32,
    );

    let url_w = HSTRING::from(url);
    let headers = header_wide(extra_headers);
    let flags = INTERNET_FLAG_RELOAD | INTERNET_FLAG_NO_CACHE_WRITE | INTERNET_FLAG_KEEP_CONNECTION;
    let request_raw = InternetOpenUrlW(
        session.0 as *const c_void,
        &url_w,
        headers.as_deref(),
        flags,
        None,
    );
    if request_raw.is_null() {
        return Err(last_error(url, "WinINET InternetOpenUrl"));
    }
    let request = WinInetHandle(request_raw);

    let mut status: u32 = 0;
    let mut status_len = std::mem::size_of::<u32>() as u32;
    HttpQueryInfoW(
        request.0 as *const c_void,
        HTTP_QUERY_STATUS_CODE | HTTP_QUERY_FLAG_NUMBER,
        Some((&raw mut status).cast()),
        &mut status_len,
        None,
    )
    .map_err(|e| format!("{url}: WinINET HttpQueryInfo {e}"))?;
    if !(200..300).contains(&status) {
        let diagnostics = wininet_http_diagnostics(request.0 as *const c_void);
        return Err(if diagnostics.is_empty() {
            format!("{url}: WinINET HTTP {status}")
        } else {
            format!("{url}: WinINET HTTP {status} ({diagnostics})")
        });
    }

    let mut body = Vec::new();
    loop {
        let mut chunk = vec![0u8; 16 * 1024];
        let mut read: u32 = 0;
        InternetReadFile(
            request.0 as *const c_void,
            chunk.as_mut_ptr().cast(),
            chunk.len() as u32,
            &mut read,
        )
        .map_err(|e| format!("{url}: WinINET InternetReadFile {e}"))?;
        if read == 0 {
            break;
        }
        body.extend_from_slice(&chunk[..read as usize]);
        on_progress(body.len() as u64);
        if body.len() > 48 * 1024 * 1024 {
            return Err(format!("{url}: WinINET response too large"));
        }
    }
    Ok(body)
}

unsafe fn winhttp_get_with_ie_proxy(
    parsed: &ParsedUrl,
    user_agent: &str,
    extra_headers: &[(&str, &str)],
    url: &str,
    on_progress: &mut dyn FnMut(u64),
) -> Result<Vec<u8>, String> {
    let mut ie = WINHTTP_CURRENT_USER_IE_PROXY_CONFIG::default();
    WinHttpGetIEProxyConfigForCurrentUser(&mut ie)
        .map_err(|e| format!("{url}: WinHTTP GetIEProxyConfig {e}"))?;
    let auto_detect = ie.fAutoDetect.as_bool();
    let auto_url = pwstr_to_string(ie.lpszAutoConfigUrl);
    let proxy = pwstr_to_string(ie.lpszProxy);
    let bypass = pwstr_to_string(ie.lpszProxyBypass);
    global_free_pwstr(ie.lpszAutoConfigUrl);
    global_free_pwstr(ie.lpszProxy);
    global_free_pwstr(ie.lpszProxyBypass);

    if let Some(proxy) = proxy {
        let proxy_h = HSTRING::from(proxy.as_str());
        let bypass_h = bypass.as_ref().map(|s| HSTRING::from(s.as_str()));
        return winhttp_get(
            parsed,
            user_agent,
            extra_headers,
            url,
            WINHTTP_ACCESS_TYPE_NAMED_PROXY,
            Some(&proxy_h),
            bypass_h.as_ref(),
            on_progress,
        );
    }

    if !auto_detect && auto_url.is_none() {
        return Err(format!("{url}: WinHTTP no IE proxy configured"));
    }

    let ua = HSTRING::from(user_agent);
    let resolver = WinHttpOpen(&ua, WINHTTP_ACCESS_TYPE_AUTOMATIC_PROXY, None, None, 0);
    if resolver.is_null() {
        return Err(last_error(url, "WinHTTP PAC WinHttpOpen"));
    }
    let resolver = WinHttpHandle(resolver);
    let auto_url_h = auto_url.as_ref().map(|s| HSTRING::from(s.as_str()));
    let mut opts = WINHTTP_AUTOPROXY_OPTIONS {
        dwFlags: 0,
        dwAutoDetectFlags: 0,
        lpszAutoConfigUrl: PCWSTR::null(),
        lpvReserved: std::ptr::null_mut(),
        dwReserved: 0,
        fAutoLogonIfChallenged: true.into(),
    };
    if auto_detect {
        opts.dwFlags |= WINHTTP_AUTOPROXY_AUTO_DETECT;
        opts.dwAutoDetectFlags = WINHTTP_AUTO_DETECT_TYPE_DHCP | WINHTTP_AUTO_DETECT_TYPE_DNS_A;
    }
    if let Some(auto_url_h) = auto_url_h.as_ref() {
        opts.dwFlags |= WINHTTP_AUTOPROXY_CONFIG_URL;
        opts.lpszAutoConfigUrl = PCWSTR(auto_url_h.as_ptr());
    }
    let url_h = HSTRING::from(url);
    let mut info = WINHTTP_PROXY_INFO::default();
    WinHttpGetProxyForUrl(resolver.0, &url_h, &mut opts, &mut info)
        .map_err(|e| format!("{url}: WinHTTP WinHttpGetProxyForUrl {e}"))?;
    let resolved_proxy = pwstr_to_string(info.lpszProxy);
    let resolved_bypass = pwstr_to_string(info.lpszProxyBypass);
    global_free_pwstr(info.lpszProxy);
    global_free_pwstr(info.lpszProxyBypass);
    let proxy_h = resolved_proxy.as_ref().map(|s| HSTRING::from(s.as_str()));
    let bypass_h = resolved_bypass.as_ref().map(|s| HSTRING::from(s.as_str()));
    winhttp_get(
        parsed,
        user_agent,
        extra_headers,
        url,
        info.dwAccessType,
        proxy_h.as_ref(),
        bypass_h.as_ref(),
        on_progress,
    )
}

unsafe fn winhttp_open(
    ua: &HSTRING,
    access: WINHTTP_ACCESS_TYPE,
    proxy: Option<&HSTRING>,
    bypass: Option<&HSTRING>,
) -> *mut c_void {
    match (proxy, bypass) {
        (Some(p), Some(b)) => WinHttpOpen(ua, access, p, b, 0),
        (Some(p), None) => WinHttpOpen(ua, access, p, None, 0),
        (None, Some(b)) => WinHttpOpen(ua, access, None, b, 0),
        (None, None) => WinHttpOpen(ua, access, None, None, 0),
    }
}

unsafe fn winhttp_get(
    parsed: &ParsedUrl,
    user_agent: &str,
    extra_headers: &[(&str, &str)],
    url: &str,
    access: WINHTTP_ACCESS_TYPE,
    proxy: Option<&HSTRING>,
    bypass: Option<&HSTRING>,
    on_progress: &mut dyn FnMut(u64),
) -> Result<Vec<u8>, String> {
    let ua = HSTRING::from(user_agent);
    let session_raw = winhttp_open(&ua, access, proxy, bypass);
    if session_raw.is_null() {
        return Err(last_error(url, "WinHTTP WinHttpOpen"));
    }
    let session = WinHttpHandle(session_raw);
    WinHttpSetTimeouts(session.0, 10_000, 10_000, 20_000, 20_000)
        .map_err(|e| format!("{url}: WinHTTP WinHttpSetTimeouts {e}"))?;
    let decomp =
        (WINHTTP_DECOMPRESSION_FLAG_GZIP | WINHTTP_DECOMPRESSION_FLAG_DEFLATE).to_le_bytes();
    let _ = WinHttpSetOption(
        Some(session.0 as *const c_void),
        WINHTTP_OPTION_DECOMPRESSION,
        Some(&decomp),
    );

    let host = HSTRING::from(parsed.host.as_str());
    let connect_raw = WinHttpConnect(session.0, &host, parsed.port, 0);
    if connect_raw.is_null() {
        return Err(last_error(url, "WinHTTP WinHttpConnect"));
    }
    let connect = WinHttpHandle(connect_raw);

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
        return Err(last_error(url, "WinHTTP WinHttpOpenRequest"));
    }
    let request = WinHttpHandle(request_raw);

    if let Some(header_w) = header_wide(extra_headers) {
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
        on_progress(body.len() as u64);
        if body.len() > 48 * 1024 * 1024 {
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
