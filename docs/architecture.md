# Architectural Design: Test SSDP (UPnP Playground)

This document outlines the architecture and data flow for the Test SSDP project, a 4-column interactive UPnP Developer Playground.

## Core Concepts

The application serves two main purposes:

1. **Network Discovery (M-SEARCH & NOTIFY)**: Continuously listening to and probing the local network for UPnP-capable devices.
2. **Device Introspection**: Progressively fetching XML schemas to let developers browse and test remote device capabilities directly from a web UI.

## The 4-Column Frontend Flow

The client interface is designed around a single-screen, progressive disclosure pattern divided into four columns:

```text
+------------------+------------------+------------------+------------------+
| Column 1:        | Column 2:        | Column 3:        | Column 4:        |
| Servers/Devices  | Services         | Actions          | Playground       |
+------------------+------------------+------------------+------------------+
| [Sonos Speaker]  | > AVTransport    | > SetAVTransport | Input Form:      |
| [Hue Bridge]     | ConnectionMgr    | GetTransport     | [ InstanceID: 0 ]|
|                  | ContentDirect    | Pause / Play     | [ Speed: 1 ]     |
|                  |                  |                  |                  |
|                  |                  |                  | [ Execute POST ] |
+------------------+------------------+------------------+------------------+
```

### Data Pipeline & Network Interactions

```txt
[ Client UI ] [ Node.js Backend ] [ UPnP Device ]
|                         |                              |
|--- (SSE Connection)---->|                              |
|                         |---- UDP Multicast M-SEARCH ->|
|                         |<--- UDP Unicast Response ----|
|                         |                              |
|                         |---- HTTP GET (Root XML) ---->|
|                         |<--- HTTP XML Response -------|
|<-- Live Device JSON ----|                              |
|                         |                              |
|-- Click Device -------> |                              |
|<-- Return Services -----|                              |
|                         |                              |
|-- Click Service ------->|---- HTTP GET (SCPD XML) ---->|
|                         |<--- HTTP XML Response -------|
|<-- Return Actions ------|                              |
|                         |                              |
|-- Execute Action (JSON)>|---- HTTP POST (SOAP XML) --->|
|                         |<--- HTTP XML Response -------|
|<-- JSON Result ---------|                              |
```

## System Modules (Backend)

- **`index.js`**: The orchestrator. Starts the Express server and triggers the UDP subsystem.
- **`lib/socket.js`**: Manages the native `node:dgram` UDP socket. Binds to port `1900` for multicast discovery and processes incoming network buffers.
- **`lib/parser.js`**: Stateless utility module. Responsible for parsing raw HTTPU/SSDP text headers into clean JavaScript objects, and converting complex UPnP XML schemas to JSON.
- **`lib/store.js`**: An in-memory cache to manage active discovered devices, track lifetimes (`CACHE-CONTROL: max-age`), and prevent flooding the frontend with duplicate SSE events.
