/**
 * @file app.js
 * @namespace UPnPExplorer
 * @description
 *   Frontend logic for the UPnP Explorer SPA.
 *   Handles:
 *     - Device discovery (cached and full SSDP rescan)
 *     - Rendering Devices, Services, and Actions panels
 *     - Panel navigation including browser Back/Forward via History API
 *     - Encapsulated state management (selected device, selected service)
 *     - UI bindings for toolbar actions (Discover, Filter, etc.)
 *
 * @architecture
 *   - Single Page Application (SPA)
 *   - Panel-based UI (Devices → Services → Actions)
 *   - Navigation levels:
 *       0: Devices
 *       1: Services (selected device)
 *       2: Actions (selected service)
 *   - State stored in `UPnPExplorer.state` and mirrored in history stack
 *
 * @usage
 *   Include socket.io client and this script in HTML:
 *     <script src="/socket.io/socket.io.js"></script>
 *     <script src="app.js"></script>
 *   The script automatically initializes on DOMContentLoaded.
 *
 * @dependencies
 *   - Socket.io client
 *   - Modern browser supporting History API
 *
 * @events
 *   Frontend emits:
 *     - 'devices'   : Fetch cached devices
 *     - 'discover'  : Trigger full SSDP discovery
 *     - 'services'  : Request services for a selected device (next step)
 *   Frontend listens:
 *     - 'devices'   : Array of UPnP devices { ssdp, device, ip }
 *     - 'services'  : Array of UPnP services (to be implemented)
 */

const UPnPExplorer = (() => {
  'use strict';

  // =========================
  // Socket
  // =========================
  const socket = io();

  // =========================
  // State
  // =========================
  const state = {
    devices: [],
    selectedDevice: null,
    selectedService: null
  };

  // =========================
  // DOM
  // =========================
  const panels = document.querySelectorAll('.panel');
  const devicesContainer = document.querySelector('[data-panel="0"] .panel-content');
  const servicesContainer = document.getElementById('services');
  const actionsContainer = document.getElementById('actions');
  const discoverButton = document.querySelector('[data-panel="0"] .toolbar button');

  // =========================
  // Panel Management
  // =========================
  function activatePanel(index) {
    panels.forEach((panel, i) => {
      panel.classList.toggle('active', i === index);
      panel.classList.toggle('inactive', i !== index);
    });
  }

  function bindPanelNavigation() {
    panels.forEach((panel, index) => {
      panel.addEventListener('click', () => {
        if (!panel.classList.contains('active')) {
          pushNavigationState(index, state.selectedDevice, state.selectedService);
        }
      });
    });
  }

  // =========================
  // History Navigation
  // =========================
  function pushNavigationState(level, deviceUdn = null, serviceId = null) {
    const navState = { level, deviceUdn, serviceId };
    history.pushState(navState, '', '');
    applyNavigationState(navState);
  }

  function applyNavigationState(navState) {
    if (!navState) return;

    state.selectedDevice = navState.deviceUdn;
    state.selectedService = navState.serviceId;

    switch (navState.level) {
      case 0:
        activatePanel(0);
        break;
      case 1:
        activatePanel(1);
        servicesContainer.innerHTML ||= `<em>Select a device</em>`;
        break;
      case 2:
        activatePanel(2);
        actionsContainer.innerHTML ||= `<em>Select a service</em>`;
        break;
    }
  }

  function bindHistoryEvents() {
    window.addEventListener('popstate', (event) => {
      applyNavigationState(event.state);
    });
  }

  // =========================
  // Devices Handling
  // =========================
  function requestDevices() {
    devicesContainer.innerHTML = `<em>Fetching devices…</em>`;
    socket.emit('devices'); // get cached devices
  }

  function discoverDevices() {
    if (discoverButton) discoverButton.disabled = true;
    devicesContainer.innerHTML = `<em>Rescanning devices…</em>`;
    socket.emit('discover');

    socket.once('devices', (devices) => {
      if (discoverButton) discoverButton.disabled = false;
      state.devices = devices;
      renderDevices(devices);
    });
  }

  function renderDevices(devices) {
    if (!Array.isArray(devices) || devices.length === 0) {
      devicesContainer.innerHTML = `<em>No devices discovered</em>`;
      return;
    }

    devicesContainer.innerHTML = devices
      .map(d => {
        const deviceId = d.device.UDN?.[0] || d.ssdp.LOCATION;
        const friendlyName = d.device.friendlyName?.[0] || 'Unknown Device';
        const manufacturer = d.device.manufacturer?.[0] || '';
        const modelDescription = d.device.modelDescription?.[0] || '';
        const modelName = d.device.modelName?.[0] || '';
        const modelNumber = d.device.modelNumber?.[0] || '';
        const deviceType = d.device.deviceType?.[0] || '';
        const ipAddress = d.ip?.address || 'unknown';
        const location = d.ssdp.LOCATION || '';

        return `
          <div class="list-item" data-device-id="${deviceId}">
            ${friendlyName}
            <small>
              ${manufacturer}${modelDescription ? " | " + modelDescription : ""}${modelName ? " | " + modelName : ""}${modelNumber ? " | " + modelNumber : ""}
            </small>
            <small>
              ${ipAddress} | ${location}
            </small>
            <small>
              ${deviceType}
            </small>
          </div>
        `;
      })
      .join('');

    bindDeviceSelection();
  }

  function bindDeviceSelection() {
    document.querySelectorAll('[data-device-id]').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();

        const deviceUdn = item.dataset.deviceId;
        state.selectedDevice = deviceUdn;
        state.selectedService = null;

        servicesContainer.innerHTML = `<em>Loading services…</em>`;

        pushNavigationState(1, deviceUdn);
        socket.emit('services', deviceUdn); // placeholder for next step
      });
    });
  }

  // =========================
  // Socket Events
  // =========================
  function bindSocketEvents() {
    socket.on('connect', () => {
      requestDevices();
    });

    socket.on('devices', (devices) => {
      state.devices = devices;
      renderDevices(devices);
    });

    // Placeholder for services/actions
    // socket.on('services', renderServices);
  }

  // =========================
  // UI Actions
  // =========================
  function bindUIActions() {
    if (discoverButton) {
      discoverButton.addEventListener('click', (e) => {
        e.stopPropagation();
        discoverDevices();
      });
    }
  }

  // =========================
  // Init
  // =========================
  function init() {
    bindPanelNavigation();
    bindSocketEvents();
    bindUIActions();
    bindHistoryEvents();

    // Initial history state
    history.replaceState({ level: 0, deviceUdn: null, serviceId: null }, '', '');

    devicesContainer.innerHTML = `<em>Waiting for connection…</em>`;
  }

  return {
    init
  };
})();

// Bootstrap
document.addEventListener('DOMContentLoaded', () => {
  UPnPExplorer.init();
});
