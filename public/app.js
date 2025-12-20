const UPNPExplorer = (() => {
  'use strict';

  // --- Private state ---
  const panels = document.querySelectorAll('.panel');
  const endpointsContainer = document.getElementById('endpoints');
  const actionsContainer = document.getElementById('actions');

  // --- Private methods ---

  /**
   * Activates one panel and pushes the others to the background
   */
  function activatePanel(index) {
    panels.forEach((panel, i) => {
      panel.classList.toggle('active', i === index);
      panel.classList.toggle('inactive', i !== index);
    });
  }

  /**
   * Binds click handlers to the panels themselves
   */
  function bindPanelNavigation() {
    panels.forEach((panel, index) => {
      panel.addEventListener('click', () => {
        if (!panel.classList.contains('active')) {
          activatePanel(index);
        }
      });
    });
  }

  /**
   * Binds server selection handlers
   */
  function bindServerSelection() {
    document.querySelectorAll('[data-server]').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        activatePanel(1);

        endpointsContainer.innerHTML = `
          <div class="list-item" data-endpoint="ContentDirectory">
            ContentDirectory
            <small>urn:schemas-upnp-org:service:ContentDirectory:1</small>
          </div>
          <div class="list-item" data-endpoint="ConnectionManager">
            ConnectionManager
            <small>urn:schemas-upnp-org:service:ConnectionManager:1</small>
          </div>
        `;

        bindEndpointSelection();
      });
    });
  }

  /**
   * Binds endpoint selection handlers
   */
  function bindEndpointSelection() {
    document.querySelectorAll('[data-endpoint]').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        activatePanel(2);

        actionsContainer.innerHTML = `
          <pre>
&lt;actionList&gt;
  &lt;action&gt;
    &lt;name&gt;Browse&lt;/name&gt;
  &lt;/action&gt;
  &lt;action&gt;
    &lt;name&gt;GetProtocolInfo&lt;/name&gt;
  &lt;/action&gt;
&lt;/actionList&gt;
        </pre>
        `;
      });
    });
  }

  // --- Public API ---

  function init() {
    bindPanelNavigation();
    bindServerSelection();
  }

  return {
    init
  };
})();

// Bootstrap when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  UPNPExplorer.init();
});
