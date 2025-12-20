/**
 * public/app.js
 *
 * Client-side UI glue for the `test-ssdp` demo application.
 *
 * Responsibilities:
 * - Connect to the server via `socket.io` and request discovered devices.
 * - Render devices, services and actions into the simple three-panel UI.
 * - Manage shallow navigation state with the History API so panels may
 *   be activated via clicks or browser back/forward.
 *
 * Key DOM hooks:
 * - Devices panel: `[data-panel="0"] .panel-content`
 * - Services panel: `#services`
 * - Actions panel: `#actions`
 * - Discover button: `[data-panel="0"] .toolbar button`
 *
 * Socket API used:
 * - Emit `devices` to request the current discovered devices.
 * - Emit `services` with a device UDN to request service list.
 * - Listen for `devices` (array) and render results.
 *
 * Initialization:
 * - Call `UPnPExplorer.init()` after DOMContentLoaded (happens below).
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

    const devicesContainer = document.querySelector(
        '[data-panel="0"] .panel-content'
    );
    const servicesContainer = document.getElementById('services');
    const actionsContainer = document.getElementById('actions');

    const discoverButton = document.querySelector(
        '[data-panel="0"] .toolbar button'
    );

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
    // Devices
    // =========================
    function requestDevices() {
        devicesContainer.innerHTML = `<em>Discovering devices…</em>`;
        socket.emit('devices');
    }

    function renderDevices(devices) {
        if (!Array.isArray(devices) || devices.length === 0) {
            devicesContainer.innerHTML = `<em>No devices discovered</em>`;
            return;
        }

        devicesContainer.innerHTML = devices
            .map(device => `
        <div class="list-item" data-device-id="${device.udn}">
          ${device.friendlyName || 'Unknown Device'}
          <small>
            ${device.address || 'unknown'} • ${device.deviceType}
          </small>
        </div>
      `)
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
                socket.emit('services', deviceUdn);
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

        // Placeholder for next step
        // socket.on('services', renderServices);
    }

    // =========================
    // UI Actions
    // =========================
    function bindUIActions() {
        if (discoverButton) {
            discoverButton.addEventListener('click', (e) => {
                e.stopPropagation();
                requestDevices();
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

        history.replaceState(
            { level: 0, deviceUdn: null, serviceId: null },
            '',
            ''
        );

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
