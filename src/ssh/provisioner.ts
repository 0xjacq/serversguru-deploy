import { readFile } from 'fs/promises';
import * as net from 'net';

import { Client, type ConnectConfig } from 'ssh2';
import SftpClient from 'ssh2-sftp-client';

import type { ExecResult, SshConfig } from '../config.js';

/**
 * SSH connection credentials
 */
export interface SshCredentials {
  host: string;
  port?: number;
  username?: string;
  password?: string;
  privateKey?: string | Buffer;
}

/**
 * SSH Provisioner
 *
 * Manages SSH connections and remote command execution for server setup.
 * Handles connection retries, command execution with streaming output,
 * and file transfers via SFTP.
 */
export class SshProvisioner {
  private client: Client | null = null;
  private sftpClient: SftpClient | null = null;
  private connected = false;
  private readonly config: SshConfig;
  private connectConfig: ConnectConfig | null = null;

  constructor(config?: Partial<SshConfig>) {
    this.config = {
      port: config?.port ?? 22,
      username: config?.username ?? 'root',
      connectionTimeout: config?.connectionTimeout ?? 30000,
      commandTimeout: config?.commandTimeout ?? 300000,
      privateKeyPath: config?.privateKeyPath,
    };
  }

  /**
   * Connect to remote server
   */
  async connect(credentials: SshCredentials): Promise<void> {
    if (this.connected) {
      await this.disconnect();
    }

    const connectConfig: ConnectConfig = {
      host: credentials.host,
      port: credentials.port ?? this.config.port,
      username: credentials.username ?? this.config.username,
      readyTimeout: this.config.connectionTimeout,
    };

    // Handle authentication
    if (credentials.password && credentials.password !== '') {
      connectConfig.password = credentials.password;
    } else if (credentials.privateKey) {
      connectConfig.privateKey = credentials.privateKey;
    } else if (this.config.privateKeyPath && this.config.privateKeyPath !== '') {
      connectConfig.privateKey = await readFile(this.config.privateKeyPath);
    }

    this.connectConfig = connectConfig;
    this.client = new Client();

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.client?.end();
        reject(new Error(`SSH connection timeout after ${this.config.connectionTimeout}ms`));
      }, this.config.connectionTimeout);

      this.client!.on('ready', () => {
        clearTimeout(timeout);
        this.connected = true;
        resolve();
      });

      this.client!.on('error', (err) => {
        clearTimeout(timeout);
        this.connected = false;
        reject(new Error(`SSH connection error: ${err.message}`));
      });

      this.client!.connect(connectConfig);
    });
  }

  /**
   * Execute a command on the remote server
   */
  async exec(command: string, options?: { timeout?: number }): Promise<ExecResult> {
    if (!this.client || !this.connected) {
      throw new Error('SSH not connected');
    }

    const timeout = options?.timeout ?? this.config.commandTimeout;

    return new Promise((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        reject(new Error(`Command timeout after ${timeout}ms: ${command.substring(0, 100)}`));
      }, timeout);

      this.client!.exec(command, (err, stream) => {
        if (err) {
          clearTimeout(timeoutHandle);
          reject(new Error(`Exec error: ${err.message}`));
          return;
        }

        let stdout = '';
        let stderr = '';

        stream.on('close', (code: number, signal: string) => {
          clearTimeout(timeoutHandle);
          resolve({
            stdout: stdout.trim(),
            stderr: stderr.trim(),
            code: code ?? 0,
            signal,
          });
        });

        stream.on('data', (data: Buffer) => {
          stdout += data.toString();
        });

        stream.stderr.on('data', (data: Buffer) => {
          stderr += data.toString();
        });
      });
    });
  }

  /**
   * Execute a command and throw on non-zero exit code
   */
  async execOrFail(command: string, options?: { timeout?: number }): Promise<string> {
    const result = await this.exec(command, options);
    if (result.code !== 0) {
      throw new Error(
        `Command failed with code ${result.code}: ${command.substring(0, 100)}\n` +
          `stderr: ${result.stderr}\n` +
          `stdout: ${result.stdout}`
      );
    }
    return result.stdout;
  }

  /**
   * Execute multiple commands in sequence
   */
  async execAll(commands: string[], options?: { timeout?: number }): Promise<ExecResult[]> {
    const results: ExecResult[] = [];
    for (const command of commands) {
      results.push(await this.exec(command, options));
    }
    return results;
  }

  /**
   * Get SFTP client (lazy initialization)
   */
  private async getSftp(): Promise<SftpClient> {
    if (!this.client || !this.connected) {
      throw new Error('SSH not connected');
    }

    if (!this.sftpClient) {
      if (!this.connectConfig) {
        throw new Error('SSH config not available');
      }

      this.sftpClient = new SftpClient();
      await this.sftpClient.connect(this.connectConfig);
    }

    return this.sftpClient;
  }

  /**
   * Upload a file to the remote server
   */
  async uploadFile(localPath: string, remotePath: string): Promise<void> {
    const sftp = await this.getSftp();
    await sftp.put(localPath, remotePath);
  }

  /**
   * Upload content directly to a remote file
   */
  async uploadContent(content: string | Buffer, remotePath: string): Promise<void> {
    const sftp = await this.getSftp();
    await sftp.put(Buffer.from(content), remotePath);
  }

  /**
   * Upload a template file with variable substitution
   */
  async uploadTemplate(
    template: string,
    remotePath: string,
    vars: Record<string, string>
  ): Promise<void> {
    let content = template;
    for (const [key, value] of Object.entries(vars)) {
      content = content.replace(new RegExp(`\\$\\{${key}\\}`, 'g'), value);
      content = content.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
    }
    await this.uploadContent(content, remotePath);
  }

  /**
   * Download a file from the remote server
   */
  async downloadFile(remotePath: string, localPath: string): Promise<void> {
    const sftp = await this.getSftp();
    await sftp.get(remotePath, localPath);
  }

  /**
   * Read remote file content
   */
  async readFile(remotePath: string): Promise<string> {
    const sftp = await this.getSftp();
    const buffer = (await sftp.get(remotePath)) as Buffer;
    return buffer.toString();
  }

  /**
   * Check if remote file exists
   */
  async fileExists(remotePath: string): Promise<boolean> {
    const sftp = await this.getSftp();
    try {
      await sftp.stat(remotePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create remote directory (recursive)
   */
  async mkdir(remotePath: string): Promise<void> {
    const sftp = await this.getSftp();
    await sftp.mkdir(remotePath, true);
  }

  /**
   * Disconnect from server
   */
  async disconnect(): Promise<void> {
    if (this.sftpClient) {
      await this.sftpClient.end();
      this.sftpClient = null;
    }

    if (this.client) {
      this.client.end();
      this.client = null;
    }

    this.connected = false;
    this.connectConfig = null;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Wait for SSH to become available on the host
   */
  static async waitForSsh(
    host: string,
    options?: {
      port?: number;
      timeout?: number;
      retryInterval?: number;
      onRetry?: (attempt: number, error: string) => void;
    }
  ): Promise<void> {
    const port = options?.port ?? 22;
    const timeout = options?.timeout ?? 300000; // 5 minutes default
    const retryInterval = options?.retryInterval ?? 5000;
    const startTime = Date.now();
    let attempt = 0;

    while (Date.now() - startTime < timeout) {
      attempt++;
      try {
        const isOpen = await SshProvisioner.checkPort(host, port, 5000);
        if (isOpen) {
          // Port is open, but wait a bit for SSH daemon to be fully ready
          await new Promise((resolve) => setTimeout(resolve, 2000));
          return;
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        options?.onRetry?.(attempt, errorMessage);
      }

      await new Promise((resolve) => setTimeout(resolve, retryInterval));
    }

    throw new Error(`Timeout waiting for SSH on ${host}:${port} after ${timeout}ms`);
  }

  /**
   * Check if a port is open
   */
  private static async checkPort(host: string, port: number, timeout: number): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = new net.Socket();

      const onError = () => {
        socket.destroy();
        resolve(false);
      };

      socket.setTimeout(timeout);
      socket.once('error', onError);
      socket.once('timeout', onError);

      socket.connect(port, host, () => {
        socket.end();
        resolve(true);
      });
    });
  }
}
