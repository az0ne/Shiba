import * as path from 'path';
import {app, BrowserWindow, shell, screen} from 'electron';
import windowState = require('electron-window-state');
import * as menu from './menu';
import loadConfig, {default_config} from './config';
import WatchDog from './watcher';

const loading = loadConfig().then(config => [config, new WatchDog(config)]);

// Show versions {{{
if (process.argv.indexOf('--version') !== -1) {
    const versions: any = process.versions;
    console.log(`Shiba v${app.getVersion()}: Rich markdown previewer

Usage:
  $ shiba [--detach|--version] [{direcotyr/file to watch}]

Environment:
  OS:       ${process.platform}-${process.arch}
  Electron: ${versions.electron}
  Chrome:   ${versions.chrome}
  Node.js:  ${versions.node}
`);
    app.quit();
}
// }}}

// Main Window {{{
app.on('window-all-closed', function() { app.quit(); });

type DisplaySize = Electron.Size & {[k: string]: number};

function createWindow(config: Config, icon_path: string) {
    const display_size = screen.getPrimaryDisplay().workAreaSize as DisplaySize;

    function getConfigLength(key: 'width'|'height'): number {
        const len = config[key];
        const default_len = default_config[key];
        switch (typeof len) {
            case 'string': {
                if (len === 'max') {
                    return display_size[key];
                }
                return default_len;
            }
            case 'number': {
                return len;
            }
            default: {
                return default_len;
            }
        }
    }

    const config_width = getConfigLength('width');
    const config_height = getConfigLength('height');
    const win_state = windowState({
        defaultWidth: config_width,
        defaultHeight: config_height,
    });

    let options: Electron.BrowserWindowOptions;

    if (config.restore_window_state) {
        options = {
            x: win_state.x,
            y: win_state.y,
            width: win_state.width,
            height: win_state.height,
        };
    } else {
        options = {
            width: config_width,
            height: config_height,
        };
    }

    options.icon = icon_path;
    options.autoHideMenuBar = config.hide_menu_bar;
    if (config.hide_title_bar) {
        options.titleBarStyle = 'hidden-inset';
    }

    const win = new BrowserWindow(options);

    if (config.restore_window_state) {
        if (win_state.isFullScreen) {
            win.setFullScreen(true);
        } else if (win_state.isMaximized) {
            win.maximize();
        }
        win_state.manage(win);
    }

    return win;
}

app.on('ready', function() {
    loading.then((loaded: [Config, WatchDog]) => {
        const [config, dog] = loaded;
        global.config = config;
        const icon_path = path.join(__dirname, '..', '..', 'images', 'shibainu.png');

        let win = createWindow(config, icon_path);
        const html = 'file://' + path.join(__dirname, '..', '..', 'static', 'index.html');
        win.loadURL(html);

        dog.wakeup(win.webContents);

        win.on('closed', function() {
            win = null;
        });

        win.on('will-navigate', function(e: Event, url: string){
            e.preventDefault();
            shell.openExternal(url);
        });

        menu.build(win);

        if (process.argv[0].endsWith('Electron') && process.platform === 'darwin') {
            // Note:
            // If Shiba is run as npm package, replace dock app icon
            app.dock.setIcon(icon_path);
        }

        if (process.env.NODE_ENV === 'development') {
            win.webContents.on('devtools-opened', () => setImmediate(() => win.focus()));
            win.webContents.openDevTools({mode: 'detach'});
        }
    }).catch(e => {
        console.error('Unknown error: ', e);
        app.quit();
    });
});
// }}}

