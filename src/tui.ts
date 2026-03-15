import {
  c,
  createMenu,
  filterMenu,
  toggleMenuSelection,
  renderMenu,
  hideCursor,
  showCursor,
  getTermSize,
  moveTo,
  clearDown,
  clearLine,
  type MenuItem,
  type MenuState,
} from '@yoyo-org/tui-kit';
import type { MockrServer } from './types.js';

type Screen = 'main' | 'endpoints' | 'proxy' | 'scenarios' | 'port';

function statusBar(server: MockrServer): string {
  const eps = server.listEndpoints();
  const enabled = eps.filter((e) => e.enabled).length;
  const parts = [`${c.cyan}mockr${c.reset} — ${server.url} | ${enabled}/${eps.length} endpoints`];
  if (server.isProxyEnabled && server.proxyTarget) {
    parts.push(`proxy → ${server.proxyTarget}`);
  }
  return parts.join(' | ');
}

function buildMainMenu(): MenuItem[] {
  return [
    { label: 'Endpoints          toggle routes on/off', cmd: 'endpoints' },
    { label: 'Proxy              enable/disable, change target', cmd: 'proxy' },
    { label: 'Port               change listening port', cmd: 'port' },
    { label: 'Scenarios          switch server state', cmd: 'scenarios' },
    { label: 'Reset              restore initial data', cmd: 'reset' },
    { label: 'Save snapshot      save state to file', cmd: 'save' },
    { label: 'Quit', cmd: 'quit' },
  ];
}

function buildEndpointsMenu(server: MockrServer): { items: MenuItem[]; selected: string[] } {
  const eps = server.listEndpoints();
  const items: MenuItem[] = [];
  const selected: string[] = [];

  for (const ep of eps) {
    const method = ep.method.padEnd(6);
    const url = ep.url.padEnd(25);
    const type = ep.type;
    const extra = ep.itemCount !== null ? `${ep.itemCount} items` : '';
    const disabled = !ep.enabled ? `  ${c.dim}(disabled)${c.reset}` : '';
    const cmd = `${ep.method}:${ep.url}`;
    items.push({ label: `${method} ${url} ${type}   ${extra}${disabled}`, cmd });
    if (ep.enabled) selected.push(cmd);
  }

  items.push({ label: `${c.dim}──${c.reset}`, cmd: '_sep' });
  items.push({ label: '[All on]', cmd: 'all_on' });
  items.push({ label: '[All off]', cmd: 'all_off' });

  return { items, selected };
}

function buildProxyMenu(server: MockrServer): MenuItem[] {
  const items: MenuItem[] = [];

  if (server.isProxyEnabled) {
    items.push({ label: 'Disable proxy', cmd: 'disable' });
  } else {
    items.push({ label: 'Enable proxy', cmd: 'enable' });
  }

  const targets = server.proxyTargets;
  if (targets) {
    items.push({ label: `${c.dim}──${c.reset}`, cmd: '_sep' });
    for (const [name, url] of Object.entries(targets)) {
      const active = server.proxyTarget === url ? `  ${c.cyan}(active)${c.reset}` : '';
      items.push({ label: `${name.padEnd(15)} ${c.dim}${url}${c.reset}${active}`, cmd: `target:${name}` });
    }
  }

  items.push({ label: '← Back', cmd: 'back' });
  return items;
}

function buildScenariosMenu(server: MockrServer): MenuItem[] {
  const names = server.listScenarios();
  const active = server.activeScenario;
  const items: MenuItem[] = names.map((name) => ({
    label: active === name ? `${name}        ${c.cyan}(active)${c.reset}` : name,
    cmd: name,
  }));
  items.push({ label: '← Back', cmd: 'back' });
  return items;
}

function screenTitle(screen: Screen, server: MockrServer): string {
  switch (screen) {
    case 'main':
      return '';
    case 'endpoints':
      return `${c.cyan}Endpoints${c.reset} ${c.dim}(space to toggle, enter to apply, esc to go back)${c.reset}`;
    case 'proxy': {
      const label = server.isProxyEnabled && server.proxyTarget
        ? `${c.cyan}enabled${c.reset} → ${server.proxyTarget}`
        : `${c.dim}disabled${c.reset}`;
      return `${c.cyan}Proxy${c.reset} — ${label}`;
    }
    case 'scenarios': {
      const active = server.activeScenario;
      return `${c.cyan}Scenarios${c.reset} — active: ${active ?? 'none'}`;
    }
    case 'port':
      return `${c.cyan}Port${c.reset} — current: ${server.port}  ${c.dim}(type new port, enter to apply, esc to cancel)${c.reset}`;
  }
}

export async function tui(server: MockrServer): Promise<void> {
  let screen: Screen = 'main';
  let menu: MenuState = createMenu(buildMainMenu());
  let running = true;
  let portInput = '';

  const { stdin } = process;
  const wasRaw = stdin.isRaw;
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding('utf-8');

  function render() {
    const { rows, cols } = getTermSize();

    // Status bar at row 1
    moveTo(1, 1);
    clearLine();
    process.stdout.write(statusBar(server));

    // Screen title at row 2
    const title = screenTitle(screen, server);
    moveTo(2, 1);
    clearLine();
    if (title) process.stdout.write(title);

    // Menu starts at row 3
    const startRow = title ? 3 : 2;

    if (screen === 'port') {
      moveTo(startRow, 1);
      clearDown();
      process.stdout.write(`  New port: ${portInput}${c.dim}_${c.reset}`);
    } else {
      const menuHeight = Math.min(menu.filtered.length + 1, rows - startRow);
      renderMenu(menu, startRow, menuHeight, cols);

      // Clear remaining lines
      const afterMenu = startRow + menuHeight + 1;
      if (afterMenu <= rows) {
        moveTo(afterMenu, 1);
        clearDown();
      }
    }
  }

  function switchScreen(newScreen: Screen) {
    screen = newScreen;
    switch (newScreen) {
      case 'main':
        menu = createMenu(buildMainMenu());
        break;
      case 'endpoints': {
        const { items, selected } = buildEndpointsMenu(server);
        menu = createMenu(items, { multiSelect: true, selected });
        break;
      }
      case 'proxy':
        menu = createMenu(buildProxyMenu(server));
        break;
      case 'scenarios':
        menu = createMenu(buildScenariosMenu(server));
        break;
      case 'port':
        portInput = String(server.port);
        menu = createMenu([]);
        break;
    }
  }

  function handleMainAction(cmd: string) {
    switch (cmd) {
      case 'endpoints':
        switchScreen('endpoints');
        break;
      case 'proxy':
        switchScreen('proxy');
        break;
      case 'scenarios':
        switchScreen('scenarios');
        break;
      case 'port':
        switchScreen('port');
        break;
      case 'reset':
        server.reset();
        break;
      case 'save':
        server.save('./snapshot.json');
        break;
      case 'quit':
        running = false;
        break;
    }
  }

  function handleEndpointsAction(cmd: string) {
    if (cmd === 'all_on') {
      server.enableAll();
      switchScreen('endpoints');
    } else if (cmd === 'all_off') {
      server.disableAll();
      switchScreen('endpoints');
    } else if (cmd === '_sep') {
      // separator, do nothing
    } else {
      // Apply the current selection state
      const eps = server.listEndpoints();
      for (const ep of eps) {
        const key = `${ep.method}:${ep.url}`;
        if (menu.selected.has(key)) {
          server.enableEndpoint(ep.url, ep.method);
        } else {
          server.disableEndpoint(ep.url, ep.method);
        }
      }
      switchScreen('main');
    }
  }

  function handleProxyAction(cmd: string) {
    if (cmd === '_sep') return;
    if (cmd.startsWith('target:')) {
      const name = cmd.slice('target:'.length);
      server.setProxyTarget(name);
      switchScreen('proxy');
      return;
    }
    switch (cmd) {
      case 'enable':
        server.enableProxy();
        switchScreen('proxy');
        break;
      case 'disable':
        server.disableProxy();
        switchScreen('proxy');
        break;
      case 'back':
        switchScreen('main');
        break;
    }
  }

  async function handleScenariosAction(cmd: string) {
    if (cmd === 'back') {
      switchScreen('main');
    } else {
      await server.scenario(cmd);
      switchScreen('scenarios');
    }
  }

  async function handleEnter() {
    if (screen === 'port') {
      const newPort = parseInt(portInput, 10);
      if (newPort > 0 && newPort <= 65535) {
        await server.setPort(newPort);
      }
      switchScreen('main');
      return;
    }

    if (menu.filtered.length === 0) return;
    const cmd = menu.filtered[menu.idx].cmd;

    switch (screen) {
      case 'main':
        handleMainAction(cmd);
        break;
      case 'endpoints':
        handleEndpointsAction(cmd);
        break;
      case 'proxy':
        handleProxyAction(cmd);
        break;
      case 'scenarios':
        await handleScenariosAction(cmd);
        break;
    }
  }

  function handleKey(key: string) {
    // Port screen has its own key handling
    if (screen === 'port') {
      if (key === '\x03') return 'kill';
      if (key === 'q') return 'kill';
      if (key === '\x1b' || key === '\x1b[D') {
        switchScreen('main');
        return null;
      }
      if (key === '\r') return 'enter';
      if (key === '\x7f') {
        portInput = portInput.slice(0, -1);
        return null;
      }
      if (key >= '0' && key <= '9') {
        portInput += key;
      }
      return null;
    }

    const up = key === '\x1b[A' || key === 'k';
    const down = key === '\x1b[B' || key === 'j';

    if (up) {
      menu.idx = Math.max(0, menu.idx - 1);
    } else if (down) {
      menu.idx = Math.min(menu.filtered.length - 1, menu.idx + 1);
    } else if (key === ' ' && menu.multiSelect) {
      toggleMenuSelection(menu);
    } else if (key === '\r') {
      // Enter — handled async
      return 'enter';
    } else if (key === '\x1b' || key === '\x1b[D') {
      // Esc or left arrow — go back
      if (screen !== 'main') {
        switchScreen('main');
      }
    } else if (key === '\x03') {
      // Ctrl+C — exit process
      return 'kill';
    } else if (key === 'q' && !menu.filter) {
      if (screen === 'main') {
        running = false;
      } else {
        switchScreen('main');
      }
    } else if (key === '\x7f') {
      // Backspace
      if (menu.filter.length > 0) {
        menu.filter = menu.filter.slice(0, -1);
        filterMenu(menu);
      }
    } else if (key.length === 1 && key >= ' ' && key !== 'j' && key !== 'k') {
      menu.filter += key;
      filterMenu(menu);
    }
    return null;
  }

  hideCursor();
  // Clear screen before starting
  moveTo(1, 1);
  clearDown();
  render();

  return new Promise<void>((resolve) => {
    const onData = async (data: string) => {
      if (!running) return;

      // Handle escape sequences that come as multi-byte
      const key = data;
      const action = handleKey(key);

      if (action === 'kill') {
        stdin.removeListener('data', onData);
        stdin.setRawMode(wasRaw ?? false);
        showCursor();
        moveTo(1, 1);
        clearDown();
        await server.close();
        process.exit(0);
      }

      if (action === 'enter') {
        await handleEnter();
      }

      if (!running) {
        stdin.removeListener('data', onData);
        stdin.setRawMode(wasRaw ?? false);
        showCursor();
        moveTo(1, 1);
        clearDown();
        await server.close();
        process.exit(0);
      }

      render();
    };

    stdin.on('data', onData);
  });
}
