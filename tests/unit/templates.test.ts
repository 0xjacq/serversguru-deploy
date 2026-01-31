import { describe, it, expect } from 'vitest';

import {
  renderTemplate,
  generateEnvFile,
  generateEnvSection,
  generateVolumesSection,
  SETUP_SCRIPT,
  DOCKER_COMPOSE_TEMPLATE,
  NGINX_CONFIG_TEMPLATE,
  NGINX_IP_CONFIG_TEMPLATE,
} from '../../src/templates/index.js';

describe('Templates', () => {
  describe('renderTemplate', () => {
    it('should replace ${VAR} syntax', () => {
      const template = 'Hello ${NAME}, welcome to ${PLACE}!';
      const result = renderTemplate(template, { NAME: 'World', PLACE: 'Earth' });
      expect(result).toBe('Hello World, welcome to Earth!');
    });

    it('should replace {{VAR}} syntax', () => {
      const template = 'Hello {{NAME}}, welcome to {{PLACE}}!';
      const result = renderTemplate(template, { NAME: 'World', PLACE: 'Earth' });
      expect(result).toBe('Hello World, welcome to Earth!');
    });

    it('should replace multiple occurrences', () => {
      const template = '${VAR} and ${VAR} again';
      const result = renderTemplate(template, { VAR: 'test' });
      expect(result).toBe('test and test again');
    });

    it('should leave unmatched variables unchanged', () => {
      const template = '${DEFINED} and ${UNDEFINED}';
      const result = renderTemplate(template, { DEFINED: 'value' });
      expect(result).toBe('value and ${UNDEFINED}');
    });
  });

  describe('generateEnvFile', () => {
    it('should generate env file format', () => {
      const vars = {
        NODE_ENV: 'production',
        PORT: '3000',
        SECRET: 'my-secret',
      };

      const result = generateEnvFile(vars);

      expect(result).toContain('NODE_ENV=production');
      expect(result).toContain('PORT=3000');
      expect(result).toContain('SECRET=my-secret');
    });

    it('should handle empty vars', () => {
      const result = generateEnvFile({});
      expect(result).toBe('');
    });
  });

  describe('generateEnvSection', () => {
    it('should generate docker-compose env section', () => {
      const vars = { NODE_ENV: 'production', PORT: '3000' };
      const result = generateEnvSection(vars);

      expect(result).toContain('      - NODE_ENV=${NODE_ENV}');
      expect(result).toContain('      - PORT=${PORT}');
    });

    it('should return empty string for empty vars', () => {
      const result = generateEnvSection({});
      expect(result).toBe('');
    });
  });

  describe('generateVolumesSection', () => {
    it('should generate volume mounts', () => {
      const volumes = ['./data:/app/data', './config:/app/config'];
      const result = generateVolumesSection(volumes);

      expect(result).toContain('      - ./data:/app/data');
      expect(result).toContain('      - ./config:/app/config');
    });

    it('should return empty string for no volumes', () => {
      const result = generateVolumesSection([]);
      expect(result).toBe('');
    });
  });

  describe('Template Constants', () => {
    it('SETUP_SCRIPT should contain Docker installation', () => {
      expect(SETUP_SCRIPT).toContain('Install Docker');
      expect(SETUP_SCRIPT).toContain('get.docker.com');
    });

    it('SETUP_SCRIPT should configure firewall', () => {
      expect(SETUP_SCRIPT).toContain('ufw');
      expect(SETUP_SCRIPT).toContain('allow ssh');
      expect(SETUP_SCRIPT).toContain('allow http');
      expect(SETUP_SCRIPT).toContain('allow https');
    });

    it('DOCKER_COMPOSE_TEMPLATE should have required placeholders', () => {
      expect(DOCKER_COMPOSE_TEMPLATE).toContain('${APP_NAME}');
      expect(DOCKER_COMPOSE_TEMPLATE).toContain('${DOCKER_IMAGE}');
      expect(DOCKER_COMPOSE_TEMPLATE).toContain('${APP_PORT}');
      expect(DOCKER_COMPOSE_TEMPLATE).toContain('${HEALTH_ENDPOINT}');
    });

    it('NGINX_CONFIG_TEMPLATE should have domain placeholder', () => {
      expect(NGINX_CONFIG_TEMPLATE).toContain('${DOMAIN}');
      expect(NGINX_CONFIG_TEMPLATE).toContain('${APP_PORT}');
      expect(NGINX_CONFIG_TEMPLATE).toContain('proxy_pass');
    });

    it('NGINX_IP_CONFIG_TEMPLATE should be default server', () => {
      expect(NGINX_IP_CONFIG_TEMPLATE).toContain('default_server');
      expect(NGINX_IP_CONFIG_TEMPLATE).toContain('server_name _');
    });
  });
});
