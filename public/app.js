/**
 * @file app.js
 * @namespace UPnPExplorer
 *
 * Frontend logic for the UPnP Explorer SPA.
 *
 * DESIGN PRINCIPLES
 * -----------------
 * - Single source of truth: browser history state
 * - UI clicks ONLY push navigation state
 * - Socket emits happen ONLY when navigation state is applied
 * - No socket emits directly from click handlers
 *
 * Panels:
 *   0 = Devices
 *   1 = Services (per device)
 *   2 = Actions  (per service)
 */

const UPnPExplorer = (() => {
    'use strict';

    /* =========================
     * Socket
     * ========================= */
    const socket = io();

    /* =========================
     * State
     * ========================= */
    const state = {
        devices: [],
        services: [],
        selectedDevice: null,
        selectedService: null
    };

    /* =========================
     * DOM References
     * ========================= */
    const panels = document.querySelectorAll('.panel');

    const devicesContainer =
        document.querySelector('[data-panel="0"] .panel-content');

    const servicesContainer =
        document.getElementById('services');

    const actionsContainer =
        document.getElementById('actions');

    const discoverButton =
        document.querySelector('[data-panel="0"] .toolbar button');

    /* =========================
     * Panel Management
     * ========================= */
    function activatePanel(index) {
        panels.forEach((panel, i) => {
            panel.classList.toggle('active', i === index);
            panel.classList.toggle('inactive', i !== index);
        });
    }

    /* =========================
     * History / Navigation
     * ========================= */
    function pushNavigationState(level, deviceUdn = null, serviceId = null) {
        const navState = { level, deviceUdn, serviceId };
        history.pushState(navState, '', '');
        applyNavigationState(navState);
    }

    function applyNavigationState(navState) {
        if (!navState) return;

        state.selectedDevice = navState.deviceUdn;
        state.selectedService = navState.serviceId;

        activatePanel(navState.level);

        /* Panel 0: Devices */
        if (navState.level === 0) {
            return;
        }

        /* Panel 1: Services */
        if (navState.level === 1 && navState.deviceUdn) {
            servicesContainer.innerHTML = `<em>Loading services…</em>`;
            socket.emit('services', navState.deviceUdn);
            return;
        }

        /* Panel 2: Actions */
        if (
            navState.level === 2 &&
            navState.deviceUdn &&
            navState.serviceId
        ) {
            actionsContainer.innerHTML = `<em>Loading actions…</em>`;
            socket.emit('actions', { deviceUdn: navState.deviceUdn, serviceId: navState.serviceId });
        }
    }

    function bindHistoryEvents() {
        window.addEventListener('popstate', (e) => {
            applyNavigationState(e.state);
        });
    }

    /* =========================
     * Devices
     * ========================= */
    function requestDevices() {
        devicesContainer.innerHTML = `<em>Fetching devices…</em>`;
        socket.emit('devices');
    }

    function discoverDevices() {
        discoverButton.disabled = true;
        devicesContainer.innerHTML = `<em>Rescanning devices…</em>`;
        socket.emit('discover');

        socket.once('devices', (devices) => {
            discoverButton.disabled = false;
            state.devices = devices;
            renderDevices(devices);
        });
    }

    function renderDevices(devices) {
        if (!devices.length) {
            devicesContainer.innerHTML = `<em>No devices discovered</em>`;
            return;
        }

        devicesContainer.innerHTML = devices.map(d => {
            const udn = d.device?.UDN?.[0];
            const name = d.device?.friendlyName?.[0] || 'Unknown Device';
            const ip = d.ip?.address || 'unknown';
            const type = d.device?.deviceType?.[0] || '';

            return `
        <div class="list-item" data-device-id="${udn}">
          ${name}
          <small>${ip}</small>
          <small>${type}</small>
        </div>
      `;
        }).join('');

        bindDeviceSelection();
    }

    function bindDeviceSelection() {
        document.querySelectorAll('[data-device-id]').forEach(item => {
            item.onclick = (e) => {
                e.stopPropagation();

                const deviceUdn = item.dataset.deviceId;
                state.selectedService = null;

                pushNavigationState(1, deviceUdn);
            };
        });
    }

    /* =========================
     * Services (Panel 2)
     * ========================= */
    function renderServices(payload) {
        const services = payload?.service || [];
        state.services = services;

        if (!services.length) {
            servicesContainer.innerHTML = `<em>No services found</em>`;
            return;
        }

        servicesContainer.innerHTML = services.map(s => {
            const id = s.serviceId?.[0];
            const type = s.serviceType?.[0];

            return `
        <div class="list-item" data-service-id="${id}">
          ${id}
          <small>${type}</small>
        </div>
      `;
        }).join('');

        bindServiceSelection();
    }

    function bindServiceSelection() {
        document.querySelectorAll('[data-service-id]').forEach(item => {
            item.onclick = (e) => {
                e.stopPropagation();

                const serviceId = item.dataset.serviceId;
                pushNavigationState(2, state.selectedDevice, serviceId);
            };
        });
    }

    /* =========================
     * Actions (Panel 3)
     * ========================= */
    /**
 * Render actions / SCPD XML for the selected service.
 *
 * @param {string} xml
 *   Raw SCPD XML received from the backend.
 */
    function renderActions(xml) {
        if (!xml || typeof xml !== 'string') {
            actionsContainer.innerHTML = `<em>No action data available</em>`;
            return;
        }

        actionsContainer.innerHTML = `
    <div class="scp-container">
      <pre class="scp-xml"></pre>
    </div>
  `;

        // Use textContent to avoid HTML/XML injection issues
        actionsContainer
            .querySelector('.scp-xml')
            .textContent = xml;
    }


    /* =========================
     * Socket Events
     * ========================= */
    function bindSocketEvents() {
        socket.on('connect', requestDevices);

        socket.on('devices', (devices) => {
            state.devices = devices;
            renderDevices(devices);
        });

        socket.on('services', renderServices);

        socket.on('actions', renderActions);
    }

    /* =========================
     * UI Events
     * ========================= */
    function bindUIActions() {
        discoverButton.onclick = (e) => {
            e.stopPropagation();
            discoverDevices();
        };
    }

    /* =========================
     * Init
     * ========================= */
    function init() {
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

    return { init };
})();

/* =========================
 * Bootstrap
 * ========================= */
document.addEventListener('DOMContentLoaded', () => {
    UPnPExplorer.init();
});
