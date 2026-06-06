/**
 * @file app.js
 * @namespace UPnPExplorer
 *
 * Frontend logic for the UPnP Explorer SPA.
 *
 * @fileoverview Frontend architecture for the 4-column UPnP Explorer SPA.
 * Encapsulated within a tight revealing module pattern namespace.
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

'use strict';

const UPnPExplorer = (() => {
    /* =========================
     * Private State
     * ========================= */
    const state = {
        /** @type {Map<string, Object>} */
        devices: new Map(),
        selectedDeviceLocation: null,
        selectedServiceId: null,
        selectedActionName: null
    };

    /* =========================
     * DOM References
     * ========================= */
    const panels = document.querySelectorAll('.panel');
    const devicesContainer = document.getElementById('devices-container');
    const servicesContainer = document.getElementById('services-container');
    const actionsContainer = document.getElementById('actions-container');
    const playgroundContainer = document.getElementById('playground-container');
    const discoverButton = document.getElementById('btn-discover');

    /* =========================
     * UI & Panel Management
     * ========================= */
    /**
     * Toggles the visually focused column block based on depth level.
     * @param {number} activeIndex 
     */
    function activatePanel(activeIndex) {
        panels.forEach((panel, i) => {
            panel.classList.toggle('active', i === activeIndex);
            panel.classList.toggle('inactive', i !== activeIndex);
        });
    }

    /* =========================
     * History & Navigation Routing
     * ========================= */
    /**
     * Updates browser history and view state seamlessly.
     */
    function pushNavigationState(level, location = null, serviceId = null, actionName = null) {
        const navState = { level, location, serviceId, actionName };
        history.pushState(navState, '', '');
        applyNavigationState(navState);
    }

    /**
     * Orchestrates rendering based on step depth.
     * @param {Object} navState 
     */
    function applyNavigationState(navState) {
        if (!navState) return;

        state.selectedDeviceLocation = navState.location;
        state.selectedServiceId = navState.serviceId;
        state.selectedActionName = navState.actionName;

        activatePanel(navState.level);

        // Reset subordinate columns on backward navigation
        if (navState.level === 0) {
            servicesContainer.innerHTML = '<em>Select a device first</em>';
            actionsContainer.innerHTML = '<em>Select a service first</em>';
            playgroundContainer.innerHTML = '<em>Select an action first</em>';
            return;
        }

        if (navState.level === 1 && navState.location) {
            actionsContainer.innerHTML = '<em>Select a service first</em>';
            playgroundContainer.innerHTML = '<em>Select an action first</em>';
            renderServices(navState.location);
        }
    }

    function bindHistoryEvents() {
        console.log('Init: Binding history navigation events...');
        window.addEventListener('popstate', (e) => applyNavigationState(e.state));
    }

    /* =========================
     * Data Rendering (Columns)
     * ========================= */
    /**
     * Renders list items for Column 1 (Devices).
     */
    function renderDeviceList() {
        console.log('Rendering devices:', state.devices);
        if (state.devices.size === 0) {
            devicesContainer.innerHTML = '<em>No devices discovered yet.</em>';
            return;
        }

        devicesContainer.innerHTML = Array.from(state.devices.values()).map(d => {
            const name = d.friendlyName || 'Unknown Device';
            const ip = d.ip || '0.0.0.0';
            const model = d.modelName || 'Generic';
            const safeId = btoa(d.location).replace(/=/g, '');
            const deviceType = d.deviceType || '';
            const location = d.location || '';

            return `
                <div class="list-item" id="dev-${safeId}" data-location="${d.location}">
                <strong>${name}</strong>
                <small>${model} • ${ip}</small>
                <small>${deviceType}</small>
                <small>${location}</small>
                </div>
            `;
        }).join('');

        // Attach click listeners to device cards
        devicesContainer.querySelectorAll('.list-item').forEach(item => {
            item.onclick = (e) => {
                e.stopPropagation();
                const loc = item.getAttribute('data-location');
                console.log('Device item clicked:', loc);
                pushNavigationState(1, loc);
            };
        });
    }

    /**
     * Populates Column 2 with the services of the selected device.
     * @param {string} location 
     */
    function renderServices(location) {
        const device = state.devices.get(location);
        if (!device || !device.services || device.services.length === 0) {
            servicesContainer.innerHTML = '<em>No services available for this unit.</em>';
            return;
        }

        servicesContainer.innerHTML = device.services.map(s => {
            return `
        <div class="list-item" data-service-id="${s.serviceId}">
          <strong>${s.serviceId}</strong>
          <small>${s.serviceType}</small>
        </div>
      `;
        }).join('');

        // Attach click listeners to service cards
        servicesContainer.querySelectorAll('.list-item').forEach(item => {
            item.onclick = (e) => {
                e.stopPropagation();
                const serviceId = item.getAttribute('data-service-id');
                console.log('Selected service routing triggered for:', serviceId);
                // Next step: pushNavigationState(2, location, serviceId);
            };
        });
    }

    /* =========================
     * Network Pipelines (SSE)
     * ========================= */
    /**
     * Connects to the backend Server-Sent Events (SSE) data stream.
     */
    function initializeSsePipeline() {
        console.log('Init: real-time event stream connection...');
        const eventSource = new EventSource('/api/events');

        eventSource.addEventListener('device-added', (e) => {
            console.log('Received device-added event:', e.data);
            const device = JSON.parse(e.data);
            state.devices.set(device.location, device);
            renderDeviceList();
        });

        eventSource.onerror = () => {
            console.warn('Real-time network event link dropped. Re-establishing connection...');
        };
    }

    /* =========================
     * UI Action Bindings
     * ========================= */
    function bindUIActions() {
        console.log('Init: Binding UI actions...');
        discoverButton.onclick = async (e) => {
            console.log('Discover button clicked. Triggering device scan...');
            e.stopPropagation();
            discoverButton.disabled = true;
            devicesContainer.innerHTML = '<em>Triggering network probe...</em>';

            try {
                // Trigger a fresh active M-SEARCH probe via the backend API
                await fetch('/api/discover', { method: 'POST' });
                console.log('Network rediscovery triggered.');
            } catch (err) {
                console.error('Failed to trigger scan:', err);
            } finally {
                // Re-enable the button after 3 seconds (after the MX time has likely elapsed)
                setTimeout(() => {
                    discoverButton.disabled = false;
                }, 3000);
            }
        };
    }

    /* =========================
     * Public Initialization API
     * ========================= */
    async function init() {
        initializeSsePipeline();
        bindUIActions();
        bindHistoryEvents();

        // Establish default root history profile state
        history.replaceState({ level: 0, location: null, serviceId: null, actionName: null }, '', '');

        // Get devices that the backend has already discovered during startup and render them immediately!
        try {
            const response = await fetch('/api/devices');
            const existingDevices = await response.json();

            existingDevices.forEach(device => {
                // Only add devices that have completed the fetch-and-parse cycle during backend startup
                if (device.status === 'done' || device.friendlyName) {
                    state.devices.set(device.location, device);
                }
            });

            // Render the initial list of devices in Column 1
            renderDeviceList();
        } catch (err) {
            console.error('Failed to load initial cache:', err);
        }
    }

    return { init };
})();

/* =========================
 * Application Bootstrap
 * ========================= */
document.addEventListener('DOMContentLoaded', () => {
    UPnPExplorer.init();
});
