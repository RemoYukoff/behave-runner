import * as vscode from "vscode";

/**
 * Log levels for filtering output
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

/**
 * Centralized logger for Behave Runner extension.
 * Outputs to a dedicated VS Code Output Channel.
 */
class Logger {
  private outputChannel: vscode.OutputChannel | null = null;
  private level: LogLevel = LogLevel.INFO;

  /**
   * Initialize the logger with an output channel.
   * Call this once during extension activation.
   */
  public initialize(context: vscode.ExtensionContext): void {
    this.outputChannel = vscode.window.createOutputChannel("Behave Runner");
    context.subscriptions.push(this.outputChannel);
    this.loadLogLevel();
  }

  /**
   * Load log level from configuration.
   */
  private loadLogLevel(): void {
    const config = vscode.workspace.getConfiguration("behaveRunner");
    const levelStr = config.get<string>("logLevel", "info");
    switch (levelStr.toLowerCase()) {
      case "debug":
        this.level = LogLevel.DEBUG;
        break;
      case "warn":
        this.level = LogLevel.WARN;
        break;
      case "error":
        this.level = LogLevel.ERROR;
        break;
      default:
        this.level = LogLevel.INFO;
    }
  }

  /**
   * Format a log message with timestamp and level.
   */
  private format(level: string, message: string): string {
    const timestamp = new Date().toISOString().slice(11, 23);
    return `[${timestamp}] [${level}] ${message}`;
  }

  /**
   * Log a debug message.
   */
  public debug(message: string, ...args: unknown[]): void {
    if (this.level <= LogLevel.DEBUG) {
      this.log("DEBUG", message, args);
    }
  }

  /**
   * Log an info message.
   */
  public info(message: string, ...args: unknown[]): void {
    if (this.level <= LogLevel.INFO) {
      this.log("INFO", message, args);
    }
  }

  /**
   * Log a warning message.
   */
  public warn(message: string, ...args: unknown[]): void {
    if (this.level <= LogLevel.WARN) {
      this.log("WARN", message, args);
    }
  }

  /**
   * Log an error message.
   */
  public error(message: string, ...args: unknown[]): void {
    if (this.level <= LogLevel.ERROR) {
      this.log("ERROR", message, args);
    }
  }

  /**
   * Internal log method.
   */
  private log(level: string, message: string, args: unknown[]): void {
    if (!this.outputChannel) {
      return;
    }

    let fullMessage = message;
    if (args.length > 0) {
      const argsStr = args
        .map((arg) => {
          if (typeof arg === "object") {
            try {
              return JSON.stringify(arg);
            } catch {
              return String(arg);
            }
          }
          return String(arg);
        })
        .join(" ");
      fullMessage = `${message} ${argsStr}`;
    }

    this.outputChannel.appendLine(this.format(level, fullMessage));
  }

  /**
   * Show the output channel.
   */
  public show(): void {
    this.outputChannel?.show();
  }
}

// Singleton instance
export const logger = new Logger();
