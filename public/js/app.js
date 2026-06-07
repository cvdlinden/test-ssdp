/**
 * @file app.js
 * @namespace UPnPExplorer
 * @fileoverview Frontend architecture for the 4-column UPnP Explorer SPA.
 * Encapsulated within a tight revealing module pattern namespace.
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
 *   3 = Playground (dynamic form generation based on action schema)
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
        selectedActionName: null,
        currentActionsSchema: []
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
        const serviceType = navState.serviceType || null;
        console.log('Applying navigation state:', navState);

        activatePanel(navState.level);

        // Level 0: Device overview (Reset everything else)
        if (navState.level === 0) {
            console.log('At root level: rendering device list overview.');
            servicesContainer.innerHTML = '<em>Select a device first</em>';
            actionsContainer.innerHTML = '<em>Select a service first</em>';
            playgroundContainer.innerHTML = '<em>Select an action first</em>';
            return;
        }

        // Level 1: Device selected -> Render services, reset actions/playground
        if (navState.level === 1 && navState.location) {
            console.log(`Device selected: ${navState.location}. Rendering services...`);
            actionsContainer.innerHTML = '<em>Select a service first</em>';
            playgroundContainer.innerHTML = '<em>Select an action first</em>';
            renderServices(navState.location);
            return;
        }

        // Level 2: Service selected -> Render actions, reset playground
        if (navState.level === 2 && navState.location && navState.serviceId) {
            console.log(`Service selected: ${navState.serviceId}. Rendering actions...`);
            playgroundContainer.innerHTML = '<em>Select an action first</em>';
            const device = state.devices.get(navState.location);
            const srv = device.services.find(s => s.serviceId === navState.serviceId);
            fetchAndRenderActions(navState.location, navState.serviceId, srv.SCPDURL);
            return;
        }

        // Level 3: Action selected -> Render playground form
        if (navState.level === 3 && navState.location && navState.serviceId && navState.actionName && serviceType) {
            console.log(`Action selected: ${navState.actionName}. Rendering playground form...`);
            renderPlaygroundForm(navState.location, navState.serviceId, navState.actionName, serviceType);
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
        console.log('Rendering devices:', state.devices.size);
        if (state.devices.size === 0) {
            devicesContainer.innerHTML = '<em>No devices discovered yet.</em>';
            return;
        }

        // Convert the Map values to an array and sort alphabetically by friendlyName
        const sortedDevices = Array.from(state.devices.values()).sort((a, b) => {
            const locA = a.location || '';
            const locB = b.location || '';
            return locA.localeCompare(locB, undefined, { numeric: true, sensitivity: 'base' });
        });

        devicesContainer.innerHTML = sortedDevices.map(d => {
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

                // Remove 'selected' class from all items, then add to the clicked one
                devicesContainer.querySelectorAll('.list-item').forEach(el => el.classList.remove('selected'));
                item.classList.add('selected');

                const loc = item.getAttribute('data-location');
                console.log('Device item clicked:', loc);
                pushNavigationState(1, loc);
            };
        });
    }

    /**
     * Populates Column 2 with detailed device metadata and a clickable list of its services.
     * 
     * @param {string} location - The unique SSDP LOCATION URL of the selected device.
     */
    function renderServices(location) {
        const device = state.devices.get(location);
        if (!device) {
            servicesContainer.innerHTML = '<em>Device data missing from local state.</em>';
            return;
        }
        console.log('Rendering services for device:', device);

        // 1. Build the Device Information Header Block
        const metaBlockHtml = `
        <div class="device-info-block" style="padding: 10px; border: 1px dashed var(--border); border-radius: 4px; background: rgba(255,255,255,0.01); margin-bottom: 16px;">
            <div style="font-size: 11px; text-transform: uppercase; color: var(--accent); font-weight: bold; margin-bottom: 6px;">Device Specifications</div>
            <div><strong>Name:</strong> ${device.friendlyName || 'Unknown Device'}</div>
            <div><strong>Manufacturer:</strong> ${device.manufacturer || 'Unknown'}</div>
            <div><strong>Model:</strong> ${device.modelName || 'Generic'}</div>
            <div style="font-size: 12px; color: var(--muted); word-break: break-all;"><strong>IP Address:</strong> ${device.ip || '0.0.0.0'}</div>
            <div style="font-size: 12px; color: var(--muted); word-break: break-all;"><strong>Type:</strong> ${device.deviceType || 'N/A'}</div>
            <div style="font-size: 12px; color: var(--muted); word-break: break-all;"><strong>Id:</strong> ${device.id || 'N/A'}</div>
            <div style="font-size: 11px; color: var(--muted); margin-top: 6px; word-break: break-all;"><strong>Descriptor:</strong> <a href="${device.location}" target="_blank" style="color: var(--accent); text-decoration: none;">${device.location} ↗</a></div>
        </div>
        <div style="font-size: 12px; font-weight: 600; margin-bottom: 8px; color: var(--text);">Available Services:</div>
        `;

        // 2. Build the Clickable Services List
        if (!device.services || device.services.length === 0) {
            servicesContainer.innerHTML = metaBlockHtml + '<em>No services discovered for this hardware profile.</em>';
            return;
        }

        const servicesListHtml = device.services.map(s => {
            // Use serviceId as the main label, fallback to type
            const id = s.serviceId || 'Unknown ID';
            const type = s.serviceType || 'Unknown Type';

            return `
        <div class="list-item service-item" data-service-id="${id}" data-scpd-url="${s.SCPDURL}">
          <strong>${id}</strong>
          <small>${type}</small>
        </div>
      `;
        }).join('');

        // Inject both components cleanly into Column 2
        servicesContainer.innerHTML = metaBlockHtml + servicesListHtml;

        // 3. Attach interactive click listeners to the service items
        servicesContainer.querySelectorAll('.service-item').forEach(item => {
            item.onclick = (e) => {
                e.stopPropagation();

                // Remove 'selected' class from all services, then add to the clicked one
                servicesContainer.querySelectorAll('.service-item').forEach(el => el.classList.remove('selected'));
                item.classList.add('selected');

                const serviceId = item.getAttribute('data-service-id');
                const scpdUrl = item.getAttribute('data-scpd-url');

                console.log(`Routing to Service: ${serviceId} -> Schema URL path: ${scpdUrl}`);

                // Push state to trigger Column 3 routing
                pushNavigationState(2, location, serviceId, scpdUrl);
            };
        });
    }

    /**
     * Fetches the actions schema from the backend proxy and renders Column 3 with sorted service headers and data types.
     */
    async function fetchAndRenderActions(location, serviceId, scpdUrl) {
        actionsContainer.innerHTML = '<em>Loading service actions...</em>';
        console.log('Fetching service description schema for:', { location, serviceId, scpdUrl });

        try {
            const response = await fetch(`/api/services/schema?location=${encodeURIComponent(location)}&scpdUrl=${encodeURIComponent(scpdUrl)}`);
            if (!response.ok) throw new Error('Proxy communication failure');

            const data = await response.json(); // Data contains { actions: [], stateVariables: {} }

            // Resolve the absolute URL to the SCPD XML for the direct link
            const baseUrl = new URL(location);
            const absoluteScpdUrl = new URL(scpdUrl, baseUrl).href;

            // 1. Build a clear Header Block for the active service context including the raw XML link
            const serviceHeaderHtml = `
                <div class="service-info-header" style="padding: 10px; border: 1px dashed var(--border); border-radius: 4px; background: rgba(4, 211, 97, 0.03); margin-bottom: 16px;">
                <div style="font-size: 11px; text-transform: uppercase; color: var(--accent); font-weight: bold; margin-bottom: 4px;">Active Auditing Target</div>
                <div style="font-size: 15px; font-weight: bold; color: var(--text); word-break: break-all; margin-bottom: 6px;">${serviceId}</div>
                <div style="font-size: 11px; color: var(--muted); border-top: 1px solid var(--border); padding-top: 6px; margin-top: 4px; word-break: break-all;">
                    <strong>Schema:</strong> <a href="${absoluteScpdUrl}" target="_blank" style="color: var(--accent); text-decoration: none;">Service XML ↗</a>
                </div>
                </div>
                <div style="font-size: 12px; font-weight: 600; margin-bottom: 8px; color: var(--text);">Available Actions & Parameters:</div>
            `;

            if (data.actions.length === 0) {
                actionsContainer.innerHTML = serviceHeaderHtml + '<em>This service contains no exposed actions.</em>';
                return;
            }

            // Sort actions alphabetically by their name property
            const sortedActions = [...data.actions].sort((a, b) => {
                const nameA = (a.name || '').toUpperCase();
                const nameB = (b.name || '').toUpperCase();
                return nameA.localeCompare(nameB);
            });

            // 2. Generate the actions list using the sorted array
            const actionsListHtml = sortedActions.map(act => {
                let argsHtml = '';

                if (!act.arguments || act.arguments.length === 0) {
                    argsHtml = '<div style="color: var(--muted); font-style: italic; margin-top: 4px;">No arguments required</div>';
                } else {
                    // Map each argument to its own clean, dedicated line layout
                    argsHtml = act.arguments.map(a => {
                        const isInput = a.direction.toLowerCase() === 'in';
                        const labelColor = isInput ? '#ff9f43' : '#10ac84';
                        const labelText = isInput ? '[In]' : '[Out]';

                        let typeMeta = a.dataType;
                        if (a.allowedValues) {
                            typeMeta += ` (${a.allowedValues.join(', ')})`;
                        }

                        return `
                            <div style="margin-top: 4px; display: flex; gap: 6px; align-items: baseline;">
                                <span style="color: ${labelColor}; font-weight: bold; min-width: 38px; display: inline-block;">${labelText}</span>
                                <span style="color: var(--text); font-weight: 500;">${a.name}</span>
                                <span style="color: var(--muted); font-size: 11px;">[${typeMeta}]</span>
                            </div>
                        `;
                    }).join('');
                }

                return `
                    <div class="list-item action-item" data-action-name="${act.name}">
                        <strong style="color: var(--text); font-size: 14px; display: block; border-bottom: 1px solid rgba(255,255,255,0.03); padding-bottom: 4px;">${act.name}</strong>
                        <div style="font-size: 12px; margin-top: 4px; display: flex; flex-direction: column;">
                        ${argsHtml}
                        </div>
                    </div>
                `;
            }).join('');

            // Inject the context header + the parsed rich content list
            actionsContainer.innerHTML = serviceHeaderHtml + actionsListHtml;

            // 3. Attach click listeners to actions for Column 4 hook integration
            actionsContainer.querySelectorAll('.action-item').forEach(item => {
                item.onclick = (e) => {
                    e.stopPropagation();

                    // Remove 'selected' class from all items, then add to the clicked one
                    actionsContainer.querySelectorAll('.action-item').forEach(el => el.classList.remove('selected'));
                    item.classList.add('selected');

                    const actionName = item.getAttribute('data-action-name');
                    const device = state.devices.get(location);
                    const serviceMeta = device.services.find(s => s.serviceId === serviceId);
                    console.log(`Routing to Playground execution layout for: ${actionName}`, serviceMeta);

                    pushNavigationState(3, location, serviceId, actionName, serviceMeta.serviceType);
                };
            });

        } catch (err) {
            console.error('Failed to parse active action schema layout:', err);
            actionsContainer.innerHTML = '<em style="color: #ff6b6b;">Failed to load actions from this device interface.</em>';
        }
    }

    /**
     * Dynamically renders input elements for Column 4 based on the action argument contracts.
     */
    function renderPlaygroundForm(location, serviceId, actionName, serviceType) {
        const actionSchema = state.currentActionsSchema.find(a => a.name === actionName);
        if (!actionSchema) {
            playgroundContainer.innerHTML = '<em>Failed to resolve action specification.</em>';
            return;
        }
        console.log('Rendering playground for action:', { actionName, actionSchema });

        const device = state.devices.get(location);
        const serviceMeta = device.services.find(s => s.serviceId === serviceId);

        // Filter only for [In] arguments to build out our submission form
        const inputArgs = actionSchema.arguments ? actionSchema.arguments.filter(a => a.direction.toLowerCase() === 'in') : [];

        let formFieldsHtml = '';
        if (inputArgs.length === 0) {
            formFieldsHtml = '<p style="color: var(--muted); font-style: italic; margin-bottom: 16px;">This action requires no parameters. Ready to fire.</p>';
        } else {
            formFieldsHtml = inputArgs.map(arg => {
                let inputHtml = '';

                // If allowed values enum is present, render a clean dropdown selector input box
                if (arg.allowedValues) {
                    inputHtml = `
                        <select class="playground-input" data-arg-name="${arg.name}" style="width:100%; padding:8px; background:#020617; border:1px solid var(--border); color:var(--text); border-radius:4px; font-size:13px;">
                        ${arg.allowedValues.map(v => `<option value="${v}">${v}</option>`).join('')}
                        </select>
                    `;
                } else {
                    const placeholder = arg.dataType === 'boolean' ? '0 (False) or 1 (True)' : arg.dataType;
                    inputHtml = `
                        <input type="text" class="playground-input" data-arg-name="${arg.name}" placeholder="${placeholder}" style="width:100%; padding:8px; background:#020617; border:1px solid var(--border); color:var(--text); border-radius:4px; font-size:13px;" />
                    `;
                }

                return `
                    <div style="margin-bottom: 14px;">
                        <label style="display:block; font-size:12px; font-weight:bold; margin-bottom:6px; color:var(--text);">${arg.name} <span style="color:var(--muted); font-weight:normal;">[${arg.dataType}]</span></label>
                        ${inputHtml}
                    </div>
                `;
            }).join('');
        }

        playgroundContainer.innerHTML = `
            <div class="playground-card" style="padding: 4px; border-radius: 4px;">
                <div style="padding: 10px; border: 1px dashed var(--border); border-radius: 4px; background: rgba(255, 159, 67, 0.03); margin-bottom: 16px;">
                <div style="font-size: 11px; text-transform: uppercase; color: #ff9f43; font-weight: bold; margin-bottom: 4px;">Playground Target</div>
                <div style="font-size: 15px; font-weight: bold; color: var(--text); word-break: break-all;">${actionName}</div>
                </div>
                
                <form id="soap-form">
                ${formFieldsHtml}
                <button type="submit" id="btn-soap-submit" style="width:100%; padding:10px; background:var(--accent); border:none; color:#0f172a; font-weight:bold; border-radius:4px; cursor:pointer; font-size:13px; transition: opacity 0.2s;">Execute SOAP Post 🚀</button>
                </form>

                <div style="margin-top: 20px; font-size: 12px; font-weight: bold; color: var(--text);">Response Output Payload:</div>
                <pre id="soap-response-output" style="margin-top:8px; background:#020617; border:1px solid var(--border); border-radius:4px; padding:12px; font-family:monospace; font-size:12px; overflow-x:auto; min-height:80px; color:var(--muted);"><em>Awaiting command execution execution context...</em></pre>
            </div>
        `;

        // Bind execution routines to form submits
        const form = document.getElementById('soap-form');
        const outputConsole = document.getElementById('soap-response-output');
        const submitBtn = document.getElementById('btn-soap-submit');

        form.onsubmit = async (e) => {
            e.preventDefault();
            submitBtn.disabled = true;
            submitBtn.style.opacity = '0.5';
            outputConsole.innerHTML = '<em>Transmitting SOAP XML Envelope to hardware device...</em>';
            outputConsole.style.color = 'var(--muted)';

            // Collect current dynamic input data states
            const payloadArgs = {};
            form.querySelectorAll('.playground-input').forEach(input => {
                const name = input.getAttribute('data-arg-name');
                payloadArgs[name] = input.value;
            });

            try {
                const response = await fetch('/api/services/execute', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        location,
                        controlUrl: serviceMeta.controlURL,
                        serviceType,
                        actionName,
                        args: payloadArgs
                    })
                });

                const data = await response.json();

                // Pretty-print json string return results into code frame
                outputConsole.innerHTML = JSON.stringify(data, null, 2);
                outputConsole.style.color = data.error ? '#ff6b6b' : 'var(--accent)';

            } catch (err) {
                console.error('SOAP execution transmission error:', err);
                outputConsole.innerHTML = `Network Communication Failure: ${err.message}`;
                outputConsole.style.color = '#ff6b6b';
            } finally {
                submitBtn.disabled = false;
                submitBtn.style.opacity = '1';
            }
        };
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
            const device = JSON.parse(e.data);
            console.log('Received device-added event:', device);
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
