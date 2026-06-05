# SSDP Protocol Cheat Sheet

This document serves as a technical reference for the Simple Service Discovery Protocol (SSDP) network packets sent and received by this application. SSDP uses HTTPU (HTTP over UDP) on multicast address `239.255.255.250` via port `1900`.

## 1. Outbound Discovery: The M-SEARCH Packet

To actively discover UPnP devices, our application transmits a UDP multicast packet. The payload must use `\r\n` (CRLF) line endings and must end with an extra empty line.

### Raw Request Template

```text
M-SEARCH * HTTP/1.1\r\n
HOST: 239.255.255.250:1900\r\n
MAN: "ssdp:discover"\r\n
MX: 3\r\n
ST: ssdp:all\r\n
\r\n
```

### Outbound Key Headers Explained

* **`MAN: "ssdp:discover"`**: Required by UPnP specification. Must include quotes.
* **`MX`**: Maximum wait time in seconds for a response. Devices stagger their replies randomly within this window to prevent network congestion.
* **`ST`**: Search Target. We use `ssdp:all` to find every UPnP-capable device. Alternatives include `upnp:rootdevice` or specific schemas.

---

## 2. Inbound Unicast Responses (M-SEARCH Replies)

When a device hears our `M-SEARCH`, it replies directly to our ephemeral UDP port with an HTTP-like status message.

### Example Incoming Packet

```text
HTTP/1.1 200 OK
CACHE-CONTROL: max-age=1800
DATE: Fri, 05 Jun 2026 21:00:00 GMT
EXT:
LOCATION: http://192.168.1
SERVER: Linux/3.14 UPnP/1.0 Product/1.0
ST: upnp:rootdevice
USN: uuid:11111111-2222-3333-4444-555555555555::upnp:rootdevice
```

### Crucial Inbound Headers to Parse

* **`LOCATION`**: The absolute URL to the UPnP XML Device Description. This is the holy grail for Column 1.
* **`CACHE-CONTROL`**: Contains `max-age` (in seconds). Tells us how long we can cache the device before declaring it dead.
* **`USN`**: Unique Service Name. Combines the device UUID and service type. We use this as the primary database key in `lib/store.js` to avoid duplicate entries.

---

## 3. Inbound Passive Notifications (NOTIFY)

Devices also broadcast alive or dying states spontaneously to the multicast group. Our socket must listen to these to detect new devices or clean up departed ones.

### Device Entering Network (ssdp:alive)

```text
NOTIFY * HTTP/1.1
HOST: 239.255.255.250:1900
CACHE-CONTROL: max-age=1800
LOCATION: http://192.168.1
NTS: ssdp:alive
NT: upnp:rootdevice
USN: uuid:11111111-2222-3333-4444-555555555555::upnp:rootdevice
```

### Device Leaving Network (ssdp:byebye)

```text
NOTIFY * HTTP/1.1
HOST: 239.255.255.250:1900
NTS: ssdp:byebye
NT: upnp:rootdevice
USN: uuid:11111111-2222-3333-4444-555555555555::upnp:rootdevice
```

### Key Notification Headers Explained

* **`NTS`**: Notification Sub-Type. Can be `ssdp:alive` (add/refresh device) or `ssdp:byebye` (remove device from Column 1 immediately).
* **`NT`**: Notification Type (acts exactly like `ST` in M-SEARCH requests).
