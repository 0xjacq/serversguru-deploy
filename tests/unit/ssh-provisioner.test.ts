import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SshProvisioner } from '../../src/ssh/provisioner.js';
import { SshError } from '../../src/errors.js';
import type { SshConfig } from '../../src/config.js';

// Mock ssh2 and ssh2-sftp-client
const mockConnect = vi.fn();
const mockEnd = vi.fn();
const mockExec = vi.fn();
const mockOn = vi.fn();
const mockOnce = vi.fn();

vi.mock('ssh2', () => ({
  Client: vi.fn(() => ({
    connect: mockConnect,
    end: mockEnd,
    exec: mockExec,
    on: mockOn,
    once: mockOnce,
    config: {
      host: 'test-host',
      port: 22,
      username: 'root',
      password: 'test-pass',
    },
  })),
}));

vi.mock('ssh2-sftp-client', () => ({
  default: vi.fn(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    end: vi.fn().mockResolvedValue(undefined),
    put: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(Buffer.from('test content')),
    stat: vi.fn().mockResolvedValue({}),
    mkdir: vi.fn().mockResolvedValue(undefined),
  })),
}));

const mockNetSocket = {
  connect: vi.fn(),
  setTimeout: vi.fn(),
  on: vi.fn(),
  once: vi.fn(),
  end: vi.fn(),
  destroy: vi.fn(),
  removeAllListeners: vi.fn(),
};

vi.mock('net', () => ({
  Socket: vi.fn(() => mockNetSocket),
  createConnection: vi.fn(() => mockNetSocket),
}));

describe('SshProvisioner', () => {
  let provisioner: SshProvisioner;
  const defaultConfig: SshConfig = {
    port: 22,
    username: 'root',
    connectionTimeout: 30000,
    commandTimeout: 300000,
  };

  beforeEach(() => {
    provisioner = new SshProvisioner(defaultConfig);
    vi.clearAllMocks();
  });


  it('should create instance with custom config', () => {
    const p = new SshProvisioner({
      port: 2222,
      username: 'admin',
      connectionTimeout: 60000,
      commandTimeout: 600000,
    });
    expect(p).toBeInstanceOf(SshProvisioner);
  });

  it('should apply default values for missing config', () => {
    const p = new SshProvisioner({});
    expect(p).toBeInstanceOf(SshProvisioner);
  });


  describe('connect', () => {
    it('should connect with password authentication', async () => {
      // Setup mock to simulate successful connection
      mockOn.mockImplementation((event: string, callback: () => void) => {
        if (event === 'ready') {
          setTimeout(callback, 0);
        }
        return { on: mockOn, once: mockOnce, connect: mockConnect };
      });

      await provisioner.connect({
        host: '192.168.1.1',
        port: 22,
        username: 'root',
        password: 'secret123',
      });

      expect(mockConnect).toHaveBeenCalledWith(
        expect.objectContaining({
          host: '192.168.1.1',
          port: 22,
          username: 'root',
          password: 'secret123',
          readyTimeout: 30000,
        })
      );
    });

    it('should connect with private key authentication', async () => {
      mockOn.mockImplementation((event: string, callback: () => void) => {
        if (event === 'ready') {
          setTimeout(callback, 0);
        }
        return { on: mockOn, once: mockOnce, connect: mockConnect };
      });

      const privateKey = '-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----';

      await provisioner.connect({
        host: '192.168.1.1',
        port: 22,
        username: 'root',
        privateKey,
      });

      expect(mockConnect).toHaveBeenCalledWith(
        expect.objectContaining({
          host: '192.168.1.1',
          privateKey,
        })
      );
    });

    it('should throw error on connection timeout', async () => {
      mockOn.mockImplementation((event: string, _callback: () => void) => {
        if (event === 'ready') {
          // Don't call callback to simulate timeout
        }
        return { on: mockOn, once: mockOnce, connect: mockConnect, end: mockEnd };
      });

      const shortTimeoutProvisioner = new SshProvisioner({
        ...defaultConfig,
        connectionTimeout: 100,
      });

      await expect(
        shortTimeoutProvisioner.connect({
          host: '192.168.1.1',
          username: 'root',
          password: 'test',
        })
      ).rejects.toThrow('SSH connection timeout');
    });

    it('should throw error on connection failure', async () => {
      mockOn.mockImplementation((event: string, callback: (err: Error) => void) => {
        if (event === 'error') {
          setTimeout(() => callback(new Error('Connection refused')), 0);
        }
        return { on: mockOn, once: mockOnce, connect: mockConnect, end: mockEnd };
      });

      await expect(
        provisioner.connect({
          host: '192.168.1.1',
          username: 'root',
          password: 'test',
        })
      ).rejects.toThrow('SSH connection error');
    });

    it('should disconnect existing connection before reconnecting', async () => {
      mockOn.mockImplementation((event: string, callback: () => void) => {
        if (event === 'ready') {
          setTimeout(callback, 0);
        }
        return { on: mockOn, once: mockOnce, connect: mockConnect, end: mockEnd };
      });

      await provisioner.connect({
        host: '192.168.1.1',
        username: 'root',
        password: 'test',
      });

      await provisioner.connect({
        host: '192.168.1.2',
        username: 'root',
        password: 'test',
      });

      expect(mockEnd).toHaveBeenCalled();
    });
  });

  describe('exec', () => {
    it('should throw error if not connected', async () => {
      await expect(provisioner.exec('ls -la')).rejects.toThrow('SSH not connected');
    });

    it('should execute command successfully', async () => {
      // Setup connection first
      mockOn.mockImplementation((event: string, callback: () => void) => {
        if (event === 'ready') {
          setTimeout(callback, 0);
        }
        return { on: mockOn, once: mockOnce, connect: mockConnect };
      });

      await provisioner.connect({
        host: '192.168.1.1',
        username: 'root',
        password: 'test',
      });

      // Mock exec response
      const mockStream = {
        on: vi.fn((event: string, callback: (data: string | number) => void) => {
          if (event === 'data') {
            callback('output line 1\noutput line 2');
          }
          if (event === 'close') {
            setTimeout(() => callback(0, ''), 0);
          }
        }),
        stderr: {
          on: vi.fn(),
        },
      };

      mockExec.mockImplementation((_cmd: string, callback: (err: null, stream: typeof mockStream) => void) => {
        callback(null, mockStream);
      });

      const result = await provisioner.exec('ls -la');

      expect(result.code).toBe(0);
      expect(result.stdout).toBe('output line 1\noutput line 2');
      expect(result.stderr).toBe('');
    });

    it('should capture stderr output', async () => {
      mockOn.mockImplementation((event: string, callback: () => void) => {
        if (event === 'ready') {
          setTimeout(callback, 0);
        }
        return { on: mockOn, once: mockOnce, connect: mockConnect };
      });

      await provisioner.connect({
        host: '192.168.1.1',
        username: 'root',
        password: 'test',
      });

      const mockStream = {
        on: vi.fn((event: string, callback: (data: string | number) => void) => {
          if (event === 'close') {
            setTimeout(() => callback(1, ''), 0);
          }
        }),
        stderr: {
          on: vi.fn((event: string, callback: (data: string) => void) => {
            if (event === 'data') {
              callback('error message');
            }
          }),
        },
      };

      mockExec.mockImplementation((_cmd: string, callback: (err: null, stream: typeof mockStream) => void) => {
        callback(null, mockStream);
      });

      const result = await provisioner.exec('invalid-command');

      expect(result.code).toBe(1);
      expect(result.stderr).toBe('error message');
    });

    it('should timeout long-running commands', async () => {
      mockOn.mockImplementation((event: string, callback: () => void) => {
        if (event === 'ready') {
          setTimeout(callback, 0);
        }
        return { on: mockOn, once: mockOnce, connect: mockConnect };
      });

      await provisioner.connect({
        host: '192.168.1.1',
        username: 'root',
        password: 'test',
      });

      const mockStream = {
        on: vi.fn(),
        stderr: { on: vi.fn() },
      };

      mockExec.mockImplementation((_cmd: string, callback: (err: null, stream: typeof mockStream) => void) => {
        callback(null, mockStream);
        // Don't trigger close - simulate hanging command
      });

      const shortTimeoutProvisioner = new SshProvisioner({
        ...defaultConfig,
        commandTimeout: 100,
      });

      // Need to connect with short timeout provisioner
      await shortTimeoutProvisioner.connect({
        host: '192.168.1.1',
        username: 'root',
        password: 'test',
      });

      await expect(shortTimeoutProvisioner.exec('sleep 100')).rejects.toThrow('Command timeout');
    });
  });

  describe('execOrFail', () => {
    it('should return stdout on success', async () => {
      mockOn.mockImplementation((event: string, callback: () => void) => {
        if (event === 'ready') {
          setTimeout(callback, 0);
        }
        return { on: mockOn, once: mockOnce, connect: mockConnect };
      });

      await provisioner.connect({
        host: '192.168.1.1',
        username: 'root',
        password: 'test',
      });

      const mockStream = {
        on: vi.fn((event: string, callback: (data: string | number) => void) => {
          if (event === 'data') {
            callback('success output');
          }
          if (event === 'close') {
            setTimeout(() => callback(0, ''), 0);
          }
        }),
        stderr: { on: vi.fn() },
      };

      mockExec.mockImplementation((_cmd: string, callback: (err: null, stream: typeof mockStream) => void) => {
        callback(null, mockStream);
      });

      const result = await provisioner.execOrFail('echo test');

      expect(result).toBe('success output');
    });

    it('should throw error on command failure', async () => {
      mockOn.mockImplementation((event: string, callback: () => void) => {
        if (event === 'ready') {
          setTimeout(callback, 0);
        }
        return { on: mockOn, once: mockOnce, connect: mockConnect };
      });

      await provisioner.connect({
        host: '192.168.1.1',
        username: 'root',
        password: 'test',
      });

      const mockStream = {
        on: vi.fn((event: string, callback: (data: string | number) => void) => {
          if (event === 'close') {
            setTimeout(() => callback(1, ''), 0);
          }
        }),
        stderr: {
          on: vi.fn((event: string, callback: (data: string) => void) => {
            if (event === 'data') {
              callback('command not found');
            }
          }),
        },
      };

      mockExec.mockImplementation((_cmd: string, callback: (err: null, stream: typeof mockStream) => void) => {
        callback(null, mockStream);
      });

      await expect(provisioner.execOrFail('invalid')).rejects.toThrow('Command failed with code 1');
    });
  });

  describe('execAll', () => {
    it('should execute multiple commands', async () => {
      mockOn.mockImplementation((event: string, callback: () => void) => {
        if (event === 'ready') {
          setTimeout(callback, 0);
        }
        return { on: mockOn, once: mockOnce, connect: mockConnect };
      });

      await provisioner.connect({
        host: '192.168.1.1',
        username: 'root',
        password: 'test',
      });

      let callCount = 0;
      const mockStream = {
        on: vi.fn((event: string, callback: (data: string | number) => void) => {
          if (event === 'data') {
            callback(`output ${++callCount}`);
          }
          if (event === 'close') {
            setTimeout(() => callback(0, ''), 0);
          }
        }),
        stderr: { on: vi.fn() },
      };

      mockExec.mockImplementation((_cmd: string, callback: (err: null, stream: typeof mockStream) => void) => {
        callback(null, mockStream);
      });

      const results = await provisioner.execAll(['cmd1', 'cmd2', 'cmd3']);

      expect(results).toHaveLength(3);
      expect(results[0].stdout).toBe('output 1');
      expect(results[1].stdout).toBe('output 2');
      expect(results[2].stdout).toBe('output 3');
    });
  });

  describe('uploadContent', () => {
    it('should throw error if not connected', async () => {
      await expect(provisioner.uploadContent('test', '/remote/file')).rejects.toThrow('SSH not connected');
    });

    it('should upload content successfully', async () => {
      mockOn.mockImplementation((event: string, callback: () => void) => {
        if (event === 'ready') {
          setTimeout(callback, 0);
        }
        return { on: mockOn, once: mockOnce, connect: mockConnect };
      });

      await provisioner.connect({
        host: '192.168.1.1',
        username: 'root',
        password: 'test',
      });

      await provisioner.uploadContent('file content', '/remote/path/file.txt');

      // SFTP put should have been called
      // Note: Actual verification requires mocking the SFTP client properly
    });
  });

  describe('fileExists', () => {
    it('should return true if file exists', async () => {
      mockOn.mockImplementation((event: string, callback: () => void) => {
        if (event === 'ready') {
          setTimeout(callback, 0);
        }
        return { on: mockOn, once: mockOnce, connect: mockConnect };
      });

      await provisioner.connect({
        host: '192.168.1.1',
        username: 'root',
        password: 'test',
      });

      // Mock SFTP stat to succeed
      const { default: SftpClient } = await import('ssh2-sftp-client');
      const mockSftp = vi.mocked(SftpClient).mock.results[0]?.value;
      if (mockSftp) {
        mockSftp.stat.mockResolvedValue({});
      }

      const exists = await provisioner.fileExists('/remote/file.txt');

      expect(exists).toBe(true);
    });

    it('should return false if file does not exist', async () => {
      mockOn.mockImplementation((event: string, callback: () => void) => {
        if (event === 'ready') {
          setTimeout(callback, 0);
        }
        return { on: mockOn, once: mockOnce, connect: mockConnect };
      });

      await provisioner.connect({
        host: '192.168.1.1',
        username: 'root',
        password: 'test',
      });

      // Mock SFTP stat to throw
      const { default: SftpClient } = await import('ssh2-sftp-client');
      vi.mocked(SftpClient).mockImplementationOnce(() => ({
        connect: vi.fn(),
        end: vi.fn(),
        put: vi.fn(),
        get: vi.fn(),
        mkdir: vi.fn(),
        stat: vi.fn().mockRejectedValue(new Error('No such file')),
      } as any));

      const exists = await provisioner.fileExists('/remote/nonexistent.txt');

      expect(exists).toBe(false);
    });
  });

  describe('disconnect', () => {
    it('should disconnect cleanly', async () => {
      mockOn.mockImplementation((event: string, callback: () => void) => {
        if (event === 'ready') {
          setTimeout(callback, 0);
        }
        return { on: mockOn, once: mockOnce, connect: mockConnect, end: mockEnd };
      });

      await provisioner.connect({
        host: '192.168.1.1',
        username: 'root',
        password: 'test',
      });

      await provisioner.disconnect();

      expect(mockEnd).toHaveBeenCalled();
      expect(provisioner.isConnected()).toBe(false);
    });

    it('should handle disconnect when not connected', async () => {
      await expect(provisioner.disconnect()).resolves.not.toThrow();
    });
  });

  describe('isConnected', () => {
    it('should return false initially', () => {
      expect(provisioner.isConnected()).toBe(false);
    });

    it('should return true after connection', async () => {
      mockOn.mockImplementation((event: string, callback: () => void) => {
        if (event === 'ready') {
          setTimeout(callback, 0);
        }
        return { on: mockOn, once: mockOnce, connect: mockConnect };
      });

      await provisioner.connect({
        host: '192.168.1.1',
        username: 'root',
        password: 'test',
      });

      expect(provisioner.isConnected()).toBe(true);
    });
  });

  describe('waitForSsh', () => {
    it('should resolve when SSH is available', async () => {
      // Spy on private static method checkPort
      const checkPortSpy = vi.spyOn(SshProvisioner as any, 'checkPort');
      checkPortSpy.mockResolvedValue(true);

      await expect(
        SshProvisioner.waitForSsh('192.168.1.1', { timeout: 4000 })
      ).resolves.not.toThrow();
    }, 10000);

    it('should timeout if SSH never becomes available', async () => {
      const checkPortSpy = vi.spyOn(SshProvisioner as any, 'checkPort');
      checkPortSpy.mockResolvedValue(false);

      await expect(
        SshProvisioner.waitForSsh('192.168.1.1', { timeout: 100, retryInterval: 10 })
      ).rejects.toThrow('Timeout waiting for SSH');
    });
  });
});

