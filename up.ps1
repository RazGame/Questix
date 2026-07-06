# up.ps1 — поднимает Questix (MongoDB + backend + frontend) в Docker на Windows.
#
# Использование:
#   .\up.ps1            # собрать образы и запустить всё
#   .\up.ps1 -NoBuild   # запустить без пересборки образов (быстрее)
#   .\up.ps1 -Down      # остановить все контейнеры (данные сохраняются)
#
# Скрипт сам: проверит/запустит Docker Desktop, создаст .env с уникальными
# секретами, определит LAN-IP для QR-кодов и дождётся готовности бэкенда.

param(
    [switch]$NoBuild,
    [switch]$Down
)

$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

function Write-Step($msg)  { Write-Host "==> $msg" -ForegroundColor Cyan }
function Write-Ok($msg)    { Write-Host "    $msg" -ForegroundColor Green }
function Write-Warn2($msg) { Write-Host "    $msg" -ForegroundColor Yellow }

# ---------- 1. Docker ----------
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "Docker не найден. Установите Docker Desktop: https://www.docker.com/products/docker-desktop/" -ForegroundColor Red
    exit 1
}

function Test-DockerRunning {
    docker info *> $null
    return ($LASTEXITCODE -eq 0)
}

if (-not (Test-DockerRunning)) {
    Write-Step "Docker не запущен — стартую Docker Desktop..."
    $ddPath = Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe'
    if (Test-Path $ddPath) {
        Start-Process $ddPath | Out-Null
    } else {
        Write-Host "Не нашёл Docker Desktop по пути '$ddPath'. Запустите его вручную и повторите." -ForegroundColor Red
        exit 1
    }
    $deadline = (Get-Date).AddSeconds(180)
    while (-not (Test-DockerRunning)) {
        if ((Get-Date) -gt $deadline) {
            Write-Host "Docker так и не поднялся за 3 минуты. Запустите Docker Desktop вручную и повторите." -ForegroundColor Red
            exit 1
        }
        Start-Sleep -Seconds 3
    }
    Write-Ok "Docker запущен."
}

# ---------- 2. Остановка (-Down) ----------
if ($Down) {
    Write-Step "Останавливаю контейнеры..."
    docker compose down
    Write-Ok "Готово. Данные Mongo и аудиофайлы сохранены в docker-томах."
    exit 0
}

# ---------- 3. .env ----------
if (-not (Test-Path .env)) {
    Write-Step "Создаю .env из .env.example (с уникальными секретами)..."
    $envText = Get-Content .env.example -Raw
    # На свежей установке генерируем свои секреты вместо заглушек.
    $envText = $envText -replace 'change_this_local_password', ([guid]::NewGuid().ToString('N'))
    $envText = $envText -replace 'change_this_local_jwt_secret', ([guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N'))
    Set-Content -Path .env -Value $envText
    Write-Ok ".env создан."
}

# ---------- 4. LAN IP (для QR-кодов на телефоны) ----------
function Get-LanIp {
    $private = '^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)'
    # Сначала — адрес интерфейса с маршрутом по умолчанию (с наименьшей метрикой).
    $ips = @()
    try {
        $route = Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction Stop |
            Sort-Object RouteMetric | Select-Object -First 1
        $ips = @(Get-NetIPAddress -AddressFamily IPv4 -InterfaceIndex $route.InterfaceIndex -ErrorAction Stop |
            Select-Object -ExpandProperty IPAddress)
    } catch { $ips = @() }
    $ip = $ips | Where-Object { $_ -match $private } | Select-Object -First 1
    if ($ip) { return $ip }
    # Иначе — любой приватный IPv4, минуя виртуальные адаптеры (WSL/Hyper-V/VPN).
    try {
        $ip = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
            Where-Object {
                $_.IPAddress -match $private -and
                $_.IPAddress -notlike '169.254.*' -and
                $_.InterfaceAlias -notmatch 'vEthernet|WSL|Docker|Loopback|Hyper-V'
            } |
            Select-Object -ExpandProperty IPAddress -First 1
    } catch { $ip = $null }
    if ($ip) { return $ip }
    if ($ips.Count -gt 0) { return $ips[0] }
    return '127.0.0.1'
}

Write-Step "Определяю LAN IP..."
$hostIp = Get-LanIp
if ($hostIp -eq '127.0.0.1') {
    Write-Warn2 "Не удалось определить LAN IP — использую 127.0.0.1. Телефоны по QR подключиться не смогут."
} else {
    Write-Ok "LAN IP: $hostIp"
}

# Обновляем HOST_IP и PUBLIC_WEB_BASE в .env (IP мог смениться с прошлого запуска).
$envContent = Get-Content .env | Where-Object { $_ -notmatch '^HOST_IP=' -and $_ -notmatch '^PUBLIC_WEB_BASE=' }
$envContent += "HOST_IP=$hostIp"
$envContent += "PUBLIC_WEB_BASE=http://$($hostIp):5173"
$envContent | Set-Content .env

# ---------- 5. Запуск ----------
$composeArgs = @('compose', 'up', '-d')
if (-not $NoBuild) { $composeArgs += '--build' }
Write-Step "docker $($composeArgs -join ' ') ..."
docker @composeArgs
if ($LASTEXITCODE -ne 0) {
    Write-Host "docker compose завершился с ошибкой (код $LASTEXITCODE). Смотрите вывод выше." -ForegroundColor Red
    exit 1
}

# ---------- 6. Ждём готовности бэкенда ----------
Write-Step "Жду, пока бэкенд ответит на http://localhost:5000/health ..."
$healthy = $false
$deadline = (Get-Date).AddSeconds(120)
while ((Get-Date) -lt $deadline) {
    try {
        $r = Invoke-WebRequest -Uri 'http://localhost:5000/health' -UseBasicParsing -TimeoutSec 3
        if ($r.StatusCode -eq 200) { $healthy = $true; break }
    } catch { }
    Start-Sleep -Seconds 3
}
if ($healthy) {
    Write-Ok "Бэкенд готов."
} else {
    Write-Warn2 "Бэкенд не ответил за 2 минуты. Логи: docker logs quest-backend"
}

# ---------- 7. Итог ----------
Write-Host ""
Write-Host "Questix запущен!" -ForegroundColor Green
Write-Host "  Сайт (этот компьютер):  http://localhost:5173" -ForegroundColor Cyan
Write-Host "  Сайт (телефоны в LAN):  http://$($hostIp):5173" -ForegroundColor Cyan
Write-Host "  Админка:                http://$($hostIp):5173/admin" -ForegroundColor Cyan
Write-Host "  API / Swagger:          http://localhost:5000/api-docs" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Если телефоны не подключаются по QR — разрешите порты 5173 и 5000" -ForegroundColor DarkGray
Write-Host "  во встроенном брандмауэре Windows (частная сеть)." -ForegroundColor DarkGray
Write-Host ""
Write-Host "  Остановить: .\up.ps1 -Down" -ForegroundColor DarkGray

Start-Process "http://$($hostIp):5173"
