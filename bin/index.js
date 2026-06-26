#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

// Auto-discovery of the latest task log file (cross-platform)
function findLatestTaskLog() {
    const home = os.homedir();
    const baseDir = path.join(home, '.gemini', 'antigravity-cli', 'brain');
    if (!fs.existsSync(baseDir)) return null;
    
    try {
        const dirs = fs.readdirSync(baseDir).map(name => path.join(baseDir, name));
        let latestLog = null;
        let latestMtime = 0;
        
        for (const dir of dirs) {
            const tasksDir = path.join(dir, '.system_generated', 'tasks');
            if (fs.existsSync(tasksDir)) {
                try {
                    const files = fs.readdirSync(tasksDir).filter(f => f.endsWith('.log'));
                    for (const file of files) {
                        const logPath = path.join(tasksDir, file);
                        try {
                            const stat = fs.statSync(logPath);
                            if (stat.mtimeMs > latestMtime) {
                                const content = fs.readFileSync(logPath, 'utf8');
                                // Check if this log contains download progress lines
                                if (content.includes('ETA:') && content.includes('[')) {
                                    latestMtime = stat.mtimeMs;
                                    latestLog = logPath;
                                }
                            }
                        } catch (e) {
                            // Ignore read issues
                        }
                    }
                } catch (e) {
                    // Ignore empty directory reads
                }
            }
        }
        return latestLog;
    } catch (e) {
        return null;
    }
}

function checkEmulatorCreated(isAndroid) {
    if (!isAndroid) return false;
    try {
        const out = execSync('android emulator list', { encoding: 'utf8', stdio: [] });
        return out.includes('medium_phone');
    } catch (e) {
        return false;
    }
}

function parseLogContent(content) {
    // Regex matching download packages of any extension (zip, tar.gz, tgz, pkg, exe, dmg, etc.)
    const pattern = /([a-zA-Z0-9_\-\.\+]+) \[[^\]]*\] (\d+)% \((\d+(?:\.\d+)?\s*[a-zA-Z]+)\/(\d+(?:\.\d+)?\s*[a-zA-Z]+)\) ETA: (\S+)/g;
    
    const downloadsMap = {};
    let match;
    while ((match = pattern.exec(content)) !== null) {
        const [_, filename, pctStr, curSize, totSize, eta] = match;
        downloadsMap[filename] = {
            name: filename,
            progress: parseInt(pctStr, 10),
            downloaded: curSize,
            total: totSize,
            eta: eta
        };
    }
    
    const downloads = Object.values(downloadsMap);
    
    // Determine if this is specifically the Android AVD install
    const isAndroid = downloads.some(d => 
        d.name.includes("platform-tools") || 
        d.name.includes("emulator-windows") || 
        d.name.includes("x86_64")
    );
    
    let status = 'INITIALIZING';
    const isCreated = checkEmulatorCreated(isAndroid);
    
    if (isCreated) {
        status = 'COMPLETED';
    } else if (downloads.length === 0) {
        status = 'INITIALIZING';
    } else {
        const allDone = downloads.every(d => d.progress === 100);
        if (allDone) {
            status = isAndroid ? 'EXTRACTING_AND_INSTALLING' : 'COMPLETED';
        } else {
            status = 'DOWNLOADING';
        }
    }
    
    return { status, downloads, isAndroid };
}

function makeBar(percent, length = 20) {
    const filled = Math.round((length * percent) / 100);
    return '█'.repeat(filled) + '░'.repeat(length - filled);
}

function renderProgress(data) {
    const { status, downloads, isAndroid } = data;
    
    let steps = [];
    if (isAndroid) {
        // Structured AVD setup steps
        steps = [
            { name: "1. Android SDK Tools", zip: "platform-tools_r37.0.0-win.zip", weight: 15 },
            { name: "2. Emulator Binaries", zip: "emulator-windows_x64-15507667.zip", weight: 25 },
            { name: "3. Android 36 SysImg ", zip: "x86_64-36_r07.zip", weight: 50 },
            { name: "4. Device Config      ", zip: null, weight: 10 }
        ];
    } else {
        // Generic mode: build list dynamically from found items
        steps = downloads.map((dl, idx) => ({
            name: `${idx + 1}. ${dl.name.length > 22 ? dl.name.substring(0, 19) + '...' : dl.name.padEnd(22)}`,
            zip: dl.name,
            weight: downloads.length > 0 ? 100 / downloads.length : 0
        }));
    }

    let overallPct = 0;
    const lines = [];
    
    steps.forEach((step, idx) => {
        let progress = 0;
        let detail = "Waiting...";
        
        if (status === 'COMPLETED') {
            progress = 100;
            detail = "Complete";
        } else if (step.zip) {
            const dl = downloads.find(d => d.name === step.zip);
            if (dl) {
                progress = dl.progress;
                detail = `${dl.downloaded} / ${dl.total} - ETA: ${dl.eta}`;
                if (progress === 100) {
                    detail = "Complete";
                }
            } else {
                // Historical completion check
                const activeIdx = steps.findIndex(s => {
                    if (!s.zip) return false;
                    const d = downloads.find(dlItem => dlItem.name === s.zip);
                    return d && d.progress < 100;
                });
                
                if (activeIdx > idx || (activeIdx === -1 && status === 'EXTRACTING_AND_INSTALLING')) {
                    progress = 100;
                    detail = "Complete";
                }
            }
        } else {
            if (status === 'COMPLETED') {
                progress = 100;
                detail = "Complete";
            } else if (status === 'EXTRACTING_AND_INSTALLING') {
                progress = 50;
                detail = "Extracting & Configuring AVD...";
            }
        }
        
        overallPct += (progress / 100) * step.weight;
        const bar = makeBar(progress);
        lines.push(`${step.name} [${bar}] ${String(progress).padStart(3)}% (${detail})`);
    });
    
    const overallPercent = Math.round(overallPct);
    
    console.log("=".repeat(60));
    console.log(isAndroid ? "         Android AVD Creation Monitor (CLI)         " 
                          : "            Generic Download Progress Monitor        ");
    console.log("=".repeat(60));
    console.log(`Status:  ${status} (Overall: ${overallPercent}%)`);
    if (isAndroid) {
        console.log(`AVD:     medium_phone`);
    }
    console.log("-".repeat(60));
    if (lines.length === 0) {
        console.log("No active downloads detected in log file.");
    } else {
        lines.forEach(line => console.log(line));
    }
    console.log("-".repeat(60));
}

function run() {
    const args = process.argv.slice(2);
    
    // Check if input is piped (non-TTY stdin)
    if (!process.stdin.isTTY) {
        let inputBuffer = '';
        process.stdin.on('data', chunk => {
            inputBuffer += chunk;
        });
        process.stdin.on('end', () => {
            const data = parseLogContent(inputBuffer);
            renderProgress(data);
            if (data.status === 'COMPLETED') {
                console.log("\n[+] Success! All downloads and setups are complete!");
            }
        });
        return;
    }

    // Determine target log path (argument or auto-discovery)
    let logPath = null;
    if (args.length > 0) {
        logPath = path.resolve(args[0]);
        if (!fs.existsSync(logPath)) {
            console.error(`[-] Error: File not found at '${logPath}'`);
            process.exit(1);
        }
    } else {
        logPath = findLatestTaskLog();
    }

    if (!logPath) {
        console.error("[-] Error: No active task log found and no file path specified.");
        console.log("Usage: logger [path-to-log-file]");
        console.log("Or pipe input: cat task.log | logger");
        process.exit(1);
    }

    console.log(`[+] Monitoring log file: ${logPath}`);
    
    const interval = setInterval(() => {
        try {
            if (!fs.existsSync(logPath)) {
                console.error(`[-] Error: Log file was removed during execution.`);
                clearInterval(interval);
                process.exit(1);
            }
            const content = fs.readFileSync(logPath, 'utf8');
            const data = parseLogContent(content);
            
            // Clear console smoothly
            process.stdout.write('\x1Bc'); 
            
            renderProgress(data);
            console.log("Press Ctrl+C to exit. Updates every 2 seconds.");
            
            if (data.status === 'COMPLETED') {
                console.log("\n[+] Success! All downloads and setups are complete!");
                clearInterval(interval);
                process.exit(0);
            }
        } catch (err) {
            console.error("[-] Error during monitor refresh: ", err.message);
        }
    }, 2000);
}

run();
