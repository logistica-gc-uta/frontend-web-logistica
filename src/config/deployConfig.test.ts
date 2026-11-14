import { describe, expect, it } from 'vitest'
import dockerignore from '../../.dockerignore?raw'
import dockerfile from '../../Dockerfile?raw'
import nginxConf from '../../nginx.conf?raw'

describe('deploy configuration', () => {
  it('accepts VITE_API_URL at build time and rejects empty values', () => {
    expect(dockerfile).toContain('ARG VITE_API_URL=http://localhost:3000/api/v1')
    expect(dockerfile).toContain('ENV VITE_API_URL=$VITE_API_URL')
    expect(dockerfile).toContain('test -n "$VITE_API_URL" && pnpm run build')
  })

  it('serves production bundle via nginx on port 80 with /healthz check', () => {
    expect(dockerfile).toContain('FROM nginx:1.27-alpine AS production')
    expect(dockerfile).toContain('EXPOSE 80')
    expect(dockerfile).toContain('http://127.0.0.1/healthz')
  })

  it('configures SPA fallback, asset caching, and healthz in nginx.conf', () => {
    expect(nginxConf).toContain('try_files $uri $uri/ /index.html;')
    expect(nginxConf).toContain('location = /healthz')
    expect(nginxConf).toContain('location /assets/')
    expect(nginxConf).toContain('try_files $uri =404;')
  })

  it('excludes environment secrets and local artifacts from Docker context', () => {
    expect(dockerignore).toContain('.env')
    expect(dockerignore).toContain('node_modules')
    expect(dockerignore).toContain('dist')
    expect(dockerignore).toContain('.git')
  })
})
