# Technical Stack Description (2026 ready)

This document details the architectural choices, tools, and constraints adopted for the reboot of the `test-ssdp` project in 2026.

The guiding principle of this stack is **Zero-Build, Pure JavaScript, and Dependency Minimization**.

## Backend Environment

- **Runtime**: Node.js v24+ (Targeting native standards)
- **Module System**: Native ES Modules (ESM). Configured via `"type": "module"` in `package.json`. All files use standard `.js` extensions.
- **Transpilation**: None. No TypeScript compiler, Babel, or bundling layer.
- **Type Safety & Autocomplete**: Achieved cleanly using **JSDoc** syntax interpreted directly by modern IDEs (e.g., VS Code).

### Core Node.js API Utilizations

- **Network I/O**: `node:dgram` for handling UDP unicast and multicast sockets.
- **HTTP Server**: `node:http` wrapped by Express for the static frontend and real-time Server-Sent Events (SSE).
- **File System/Paths**: `node:path` and `node:url` using `import.meta.url` for location path resolutions.
- **Testing**: Native **Node.js Test Runner** (`node --test`) coupled with `node:assert/strict`. No external testing suites (Jest/Mocha) are required.
- **Dev Workflow**: Node's native watch flag (`node --watch`) handles hot reloading automatically.

## External Dependencies (Minimal)

1. **`express`** (~v4.22)
   - *Purpose*: Minimalistic routing layer to serve static content from `/public` and handle internal REST API actions.
2. **`fast-xml-parser`** (~v5.8)
   - *Purpose*: A performance-optimized XML validator and parser. Essential for converting UPnP Device Descriptions (Root XML) and Service Descriptions (SCPD XML) cleanly into JSON without adding bloat.

## Client-Side Stack (No-Build Frontend)

To preserve instant start-up speeds and avoid a modern frontend dependency-hell, the client relies entirely on modern browser standards:

- **JavaScript**: Native Vanilla ES Modules (`<script type="module">`). Code is modularized using standard `import` statements natively understood by 2026 web browsers.
- **CSS**: Plain CSS leveraging native **CSS Nesting**, modern variable definitions (`--var`), and native Grid/Flexbox layouts. No Sass, Less, or Tailwind compilation.
- **Real-time Data Communication**: **Server-Sent Events (SSE)** via `EventSource`. This replaces heavier abstractions like `Socket.IO`, allowing the backend to push newly discovered local devices seamlessly down an open HTTP stream.
