# API Specification: UPnP Explorer

This document specifies the HTTP REST endpoints and real-time streaming interfaces exposed by the `upnp-explorer` Node.js backend.

All endpoints are prefixed with `/api` and return payload responses strictly formatted in JSON.

## 1. System & Real-Time Stream

### Get API Directory Index

* **Method / Route**: `GET /api`
* **Description**: Returns a self-documenting directory map listing all available API resource endpoints.
* **Success Response (200 OK)**:

  ```json
  {
    "message": "Welcome to the UPnP Explorer API",
    "version": "1.2.0",
    "endpoints": {
      "status": "GET /api/status",
      "events": "GET /api/events",
      "devices": "GET /api/devices",
      "discover": "POST /api/discover",
      "serviceSchema": "GET /api/services/schema",
      "executeAction": "POST /api/services/execute"
    }
  }
  ```

### Get Application Status

* **Method / Route**: `GET /api/status`
* **Description**: Simple health check routine verifying runtime reachability.
* **Success Response (200 OK)**:

  ```json
  { "status": "online", "protocol": "SSDP/UPnP" }
  ```

### Live Event Stream (Server-Sent Events)

* **Method / Route**: `GET /api/events`
* **Description**: Established persistent HTTP push channel streaming real-time SSDP discovery notices to web browser clients using native `EventSource`.
* **Response Headers Required**:
  * `Content-Type: text/event-stream`
  * `Cache-Control: no-cache`
  * `Connection: keep-alive`
* **Stream Events Blasted**:
  * `connected`: Fired upon initial handshake sealing.
  * `device-added`: Dispatched when a new unique device finishes its background fetch-and-parse phase. Passes the complete device model object down the pipe.

## 2. Device Discovery (Column 1 & 2)

### Get Discovered Device Registry Cache

* **Method / Route**: `GET /api/devices`
* **Description**: Pulls a complete listing snapshot array of all active tracked devices preserved inside the in-memory cache layer. Ideal for hydration during page load.
* **Success Response (200 OK)**:

  ```json
  [
    {
      "id": "uuid:11111111-2222-3333-4444-555555555555",
      "location": "http://192.168.1.108:1234/ssdp.xml",
      "ip": "192.168.1.100",
      "interface": "192.168.1.123",
      "friendlyName": "Living Room TV",
      "manufacturer": "Sony Corporation",
      "modelName": "BRAVIA 4K",
      "deviceType": "urn:schemas-upnp-org:device:MediaRenderer:1",
      "status": "done",
      "services": [
        {
          "serviceType": "urn:schemas-upnp-org:service:AVTransport:1",
          "serviceId": "urn:upnp-org:serviceId:AVTransport",
          "SCPDURL": "/AVTransportSCPD.xml",
          "controlURL": "/evt/upnp/AVTransport",
          "eventSubURL": "/evt/upnp/AVTransport"
        }
      ]
    }
  ]
  ```

### Force Active Network Rescan

* **Method / Route**: `POST /api/discover`
* **Description**: Flushes the central database cache registries and restarts multi-interface interface UDP sockets to re-broadcast a fresh `M-SEARCH` probe instantly.
* **Success Response (200 OK)**:

  ```json
  { "status": "scan_triggered" }
  ```

## 3. Service Introspection (Column 3)

### Fetch Service Control Protocol Description (SCPD)

* **Method / Route**: `GET /api/services/schema`
* **Description**: Acts as a descriptor abstraction layer proxy. Resolves paths, fetches raw XML from remote local hardware targets, parses schemas, links state variables, and aggregates clean contracts.
* **Query Parameters Expected**:
  * `location`: The target device's base device XML URL configuration.
  * `scpdUrl`: Relative endpoint path leading to the specific service contract definition sheet.
* **Success Response (200 OK)**:

  ```json
  {
    "actions": [
      {
        "name": "SetVolume",
        "arguments": [
          {
            "name": "InstanceID",
            "direction": "in",
            "relatedStateVariable": "A_ARG_TYPE_InstanceID",
            "dataType": "ui4"
          },
          {
            "name": "DesiredVolume",
            "direction": "in",
            "relatedStateVariable": "Volume",
            "dataType": "ui2",
            "allowedValues": null
          }
        ]
      }
    ],
    "stateVariables": {
      "Volume": {
        "dataType": "ui2",
        "allowedValues": null
      }
    }
  }
  ```

## 4. Action Execution Playground (Column 4)

### Execute Live UPnP SOAP Command Request

* **Method / Route**: `POST /api/services/execute`
* **Description**: Dispatches remote command payloads. Converted incoming clean JSON configurations into structured XML envelopes wrapped with mandatory strict quotes `SOAPACTION` HTTP network transport headers.
* **JSON Payload Body Layout**:

  ```json
  {
    "location": "http://192.168.1.100:1234/...",
    "controlUrl": "/evt/upnp/RenderingControl",
    "serviceType": "urn:schemas-upnp-org:service:RenderingControl:1",
    "actionName": "SetVolume",
    "args": {
      "InstanceID": 0,
      "Channel": "Master",
      "DesiredVolume": 20
    }
  }
  ```

* **Success Action Response (200 OK)**:

  ```json
  {
    "SetVolumeResponse": ""
  }
  ```

* **Hardware Rejection / Error Handling (200 OK or 500)**:
  *If a device denies an operation context, a standardized `UPnP SOAP Fault` block maps error contracts cleanly instead of crashing the pipeline stack:*

  ```json
  {
    "error": "UPnP SOAP Fault",
    "code": 402,
    "description": "Invalid Args"
  }
  ```
