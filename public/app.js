/**
 * @file app.js
 * @namespace UPnPExplorer
 * @description
 *   Frontend SPA for UPnP devices.
 *   Panel-based UI: Devices → Services → Actions
 *   Supports:
 *     - Device discovery (cached + full SSDP rescan)
 *     - Rendering services for selected device
 *     - Panel navigation and History API back/forward
 *     - Encapsulated state management
 *     - UI bindings for toolbar actions
 *
 * @dependencies
 *   - Socket.io client
 *   - Modern browser with History API
 */

const UPnPExplorer = (() => {
  'use strict';

  /** @type {SocketIOClient.Socket} */
  const socket = io();

  /** Application state */
  const state = {
    devices: [],
    selectedDevice: null,
    selectedService: null
  };

  /** DOM elements */
  const panels = document.querySelectorAll('.panel');
  const devicesContainer = document.querySelector('[data-panel="0"] .panel-content');
  const servicesContainer = document.getElementById('services');
  const actionsContainer = document.getElementById('actions');
  const discoverButton = document.querySelector('[data-panel="0"] .toolbar button');

  // =========================
  // Panel Navigation
  // =========================

  /**
   * Bind clicks on panel headers (horizontal accordion)
   * Clicking a panel (that is not active) pushes its level to history.
   */
  function bindPanelNavigation() {
    panels.forEach((panel, index) => {
      const header = panel.querySelector('.panel-header');
      if (!header) return;

      header.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!panel.classList.contains('active')) {
          pushNavigationState(index, state.selectedDevice, state.selectedService);
        }
      });
    });
  }

  function activatePanel(index) {
    panels.forEach((panel, i) => {
      panel.classList.toggle('active', i === index);
      panel.classList.toggle('inactive', i !== index);
    });
  }

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
        if (state.selectedDevice) {
          servicesContainer.innerHTML = `<em>Loading services…</em>`;
          socket.emit('services', state.selectedDevice);
        }
        break;
      case 2:
        activatePanel(2);
        if (state.selectedDevice && state.selectedService) {
          actionsContainer.innerHTML = `<em>Loading actions…</em>`;
          socket.emit('actions', { deviceUdn: state.selectedDevice, serviceId: state.selectedService });
        }
        break;
    }
  }

  function bindHistoryEvents() {
    window.addEventListener('popstate', (event) => {
      applyNavigationState(event.state);
    });
  }

  // =========================
  // Devices Panel
  // =========================

  function requestDevices() {
    devicesContainer.innerHTML = `<em>Fetching devices…</em>`;
    socket.emit('devices');
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

    devicesContainer.innerHTML = devices.map(d => {
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
          <small>${manufacturer}${modelDescription ? " | " + modelDescription : ""}${modelName ? " | " + modelName : ""}${modelNumber ? " | " + modelNumber : ""}</small>
          <small>${ipAddress} | ${location}</small>
          <small>${deviceType}</small>
        </div>`;
    }).join('');

    bindDeviceSelection();
    activatePanel(0);
  }

  function bindDeviceSelection() {
    document.querySelectorAll('[data-device-id]').forEach(item => {
      item.addEventListener('click', () => {
        const deviceUdn = item.dataset.deviceId;
        state.selectedDevice = deviceUdn;
        state.selectedService = null;

        servicesContainer.innerHTML = `<em>Loading services…</em>`;
        pushNavigationState(1, deviceUdn);
        socket.emit('services', deviceUdn);
      });
    });
  }

  // =========================
  // Services Panel
  // =========================

  function renderServices(payload) {
    if (!payload || !Array.isArray(payload.service) || payload.service.length === 0) {
      servicesContainer.innerHTML = `<em>No services available</em>`;
      return;
    }

    servicesContainer.innerHTML = payload.service.map(s => {
      const serviceId = s.serviceId?.[0] || '';
      const serviceType = s.serviceType?.[0] || '';
      const controlURL = s.controlURL?.[0] || '-';
      const eventSubURL = s.eventSubURL?.[0] || '-';
      const SCPDURL = s.SCPDURL?.[0] || '-';

      return `
        <div class="list-item" data-service-id="${serviceId}" data-scpcurl="${SCPDURL}">
          ${serviceType}
          <small>Control URL: ${controlURL} | Event URL: ${eventSubURL}</small>
        </div>`;
    }).join('');

    bindServiceSelection();
    activatePanel(1);
  }

  function bindServiceSelection() {
    document.querySelectorAll('[data-service-id]').forEach(item => {
      item.addEventListener('click', () => {
        const serviceId = item.dataset.serviceId;
        const SCPDURL = item.dataset.scpcurl;
        state.selectedService = serviceId;

        actionsContainer.innerHTML = `<em>Loading actions…</em>`;
        pushNavigationState(2, state.selectedDevice, serviceId);
        socket.emit('actions', { deviceUdn: state.selectedDevice, serviceId, SCPDURL });
      });
    });
  }

  // =========================
  // Actions Panel
  // =========================

  function renderActions(actions) {
    if (!actions) {
      actionsContainer.innerHTML = `<em>No actions available</em>`;
      return;
    }
    actionsContainer.innerHTML = `<pre>${JSON.stringify(actions, null, 2)}</pre>`;
    activatePanel(2);
  }

  // =========================
  // Socket Event Bindings
  // =========================

  function bindSocketEvents() {
    socket.on('connect', requestDevices);
    socket.on('devices', devices => { state.devices = devices; renderDevices(devices); });
    socket.on('services', data => renderServices(data)); // backend: { service: [...] }
    socket.on('actions', renderActions);
  }

  // =========================
  // UI Actions
  // =========================

  function bindUIActions() {
    if (discoverButton) discoverButton.addEventListener('click', discoverDevices);
  }

  // =========================
  // Init
  // =========================

  function init() {
    bindPanelNavigation();
    bindSocketEvents();
    bindUIActions();
    bindHistoryEvents();

    history.replaceState({ level: 0, deviceUdn: null, serviceId: null }, '', '');
    devicesContainer.innerHTML = `<em>Waiting for connection…</em>`;
  }

  return { init };
})();

// Bootstrap
document.addEventListener('DOMContentLoaded', () => UPnPExplorer.init());
