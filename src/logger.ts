/**
 * Centralized logging for Behave Runner extension.
 * Provides a VS Code output channel for debugging and diagnostics.
 */

import * as vscode from "vscode";

/**
 * Log levels for categorizing messages.
 */
export enum LogLevel {
  DEBUG = "DEBUG",
  INFO = "INFO",
  WARN = "WARN",
  ERROR = "ERROR",
}

/**
 * Logger class that writes to a VS Code output channel.
 */
class Logger {
  private outputChannel: vscode.OutputChannel | null = null;
  private minLevel: LogLevel = LogLevel.INFO;

  /**
   * Initialize the logger with an output channel.
   * Call this during extension activation.
   */
  public initialize(): void {
    if (!this.outputChannel) {
      this.outputChannel = vscode.window.createOutputChannel("Behave Runner");
    }
  }

  /**
   * Dispose the output channel.
   * Call this during extension deactivation.
   */
  public dispose(): void {
    if (this.outputChannel) {
      this.outputChannel.dispose();
      this.outputChannel = null;
    }
  }

  /**
   * Set the minimum log level.
   * Messages below this level will be ignored.
   */
  public setMinLevel(level: LogLevel): void {
    this.minLevel = level;
  }

  /**
   * Log a debug message.
   */
  public debug(message: string, ...args: unknown[]): void {
    this.log(LogLevel.DEBUG, message, ...args);
  }

  /**
   * Log an info message.
   */
  public info(message: string, ...args: unknown[]): void {
    this.log(LogLevel.INFO, message, ...args);
  }

  /**
   * Log a warning message.
   */
  public warn(message: string, ...args: unknown[]): void {
    this.log(LogLevel.WARN, message, ...args);
  }

  /**
   * Log an error message.
   */
  public error(message: string, error?: unknown): void {
    const errorDetails = error instanceof Error
      ? `${error.message}\n${error.stack ?? ""}`
      : error !== undefined
        ? String(error)
        : "";

    this.log(LogLevel.ERROR, message, errorDetails);
  }

  /**
   * Show the output channel in the UI.
   */
  public show(): void {
    this.outputChannel?.show();
  }

  /**
   * Internal logging method.
   */
  private log(level: LogLevel, message: string, ...args: unknown[]): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const timestamp = new Date().toISOString();
    const formattedArgs = args.length > 0
      ? " " + args.map(arg => this.formatArg(arg)).join(" ")
      : "";

    const logMessage = `[${timestamp}] [${level}] ${message}${formattedArgs}`;

    this.outputChannel?.appendLine(logMessage);

    // Also log to console in development
    if (process.env.NODE_ENV === "development") {
      console.log(logMessage);
    }
  }

  /**
   * Check if a message at the given level should be logged.
   */
  private shouldLog(level: LogLevel): boolean {
    const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
    return levels.indexOf(level) >= levels.indexOf(this.minLevel);
  }

  /**
   * Format an argument for logging.
   */
  private formatArg(arg: unknown): string {
    if (arg === null) {
      return "null";
    }
    if (arg === undefined) {
      return "undefined";
    }
    if (typeof arg === "object") {
      try {
        return JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    }
    return String(arg);
  }
}

/**
 * Singleton logger instance.
 */
export const logger = new Logger();
