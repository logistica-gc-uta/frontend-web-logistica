<#
.SYNOPSIS
  Entorno aislado de las pruebas E2E del #69: PostgreSQL descartable + backend real + datos sintéticos.

.DESCRIPTION
  preparar  Recrea la base descartable (sin datos previos), aplica las migraciones y carga el seed.
  backend   Arranca el backend real contra esa base en http://localhost:3101 (deja la consola ocupada).
  limpiar   Baja la base descartable; como vive en memoria (tmpfs), no queda ningún dato.

  No toca la base de desarrollo (logistica_postgres, 5432) ni el backend de desarrollo (3000), y no usa
  OSRM (ROAD_ENGINE=HAVERSINE). Las credenciales de la base son locales y solo escuchan en loopback.
  Paso a paso completo: docs/evidencias/69-e2e-aislado.md

.EXAMPLE
  ./e2e/aislado/entorno.ps1 preparar
  ./e2e/aislado/entorno.ps1 backend          # en otra terminal
  ./e2e/aislado/entorno.ps1 limpiar
#>
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('preparar', 'backend', 'limpiar')]
  [string]$Paso,
  # Carpeta del backend (por defecto, junto a este repositorio).
  [string]$Backend
)

$ErrorActionPreference = 'Stop'
if (-not $Backend) { $Backend = Join-Path $PSScriptRoot '..\..\..\backend' }
$compose = Join-Path $PSScriptRoot 'docker-compose.yml'
$databaseUrl = 'postgresql://e2e_user:e2e_local_only@127.0.0.1:55432/regalia_e2e?schema=public'

function Set-IsolatedBackendEnv {
  # Variables del proceso: tienen prioridad sobre el .env del backend, que no se modifica.
  $env:NODE_ENV = 'development'
  $env:PORT = '3101'
  $env:DATABASE_URL = $databaseUrl
  $env:ROAD_ENGINE = 'HAVERSINE'
  $env:CORS_ALLOWED_ORIGINS = 'http://localhost:5181'
  $env:REALTIME_ALLOWED_ORIGINS = 'http://localhost:5181'
}

switch ($Paso) {
  'preparar' {
    docker compose -f $compose down --volumes
    docker compose -f $compose up -d --wait
    if ($LASTEXITCODE -ne 0) { throw 'No arranco la base descartable' }
    Set-IsolatedBackendEnv
    Push-Location $Backend
    try {
      pnpm prisma db migrate --db $databaseUrl
      if ($LASTEXITCODE -ne 0) { throw 'Fallaron las migraciones' }
      pnpm seed
      if ($LASTEXITCODE -ne 0) { throw 'Fallo el seed' }
      if (-not (Test-Path 'dist/main.js')) { pnpm build }
    } finally {
      Pop-Location
    }
    Write-Host 'Base descartable lista en 127.0.0.1:55432. Siguiente paso: entorno.ps1 backend'
  }
  'backend' {
    Set-IsolatedBackendEnv
    Push-Location $Backend
    try {
      pnpm run start:prod
    } finally {
      Pop-Location
    }
  }
  'limpiar' {
    docker compose -f $compose down --volumes
    Write-Host 'Base descartable eliminada.'
  }
}
