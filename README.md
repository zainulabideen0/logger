# logger

A beautiful, platform-agnostic CLI and API progress monitor for Android Virtual Device (AVD) creation and generic download tracking.

It can automatically discover active task log files on your system, parse custom local log files passed as command-line arguments, or consume logs piped directly via standard input (`stdin`).

## Installation

You can run it directly using `npx`:

```bash
npx logger
```

Or install it globally:

```bash
npm install -g logger
```

## Usage

### 1. Auto-Discovery mode (Default)
Finds the latest active download/installation task log:
```bash
logger
```

### 2. Custom Log File mode
Specify any custom log file path:
```bash
logger /path/to/my_creation_task.log
```

### 3. Piped Stream mode (Piping logs)
Stream input dynamically from stdin:
```bash
cat my_task.log | logger
```

## Features
* **Multi-Input**: Supports file paths, stdin streaming, or auto-discovery folders.
* **Cross-Platform**: Works out of the box on Windows, macOS, and Linux.
* **ASCII Visualizer**: Draws high-fidelity live progress bars in your terminal.
* **No Dependencies**: Pure Node.js script with zero npm dependencies.

## License

MIT
