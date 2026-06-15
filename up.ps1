# up.ps1 - Автоматический запуск проекта с определением внешнего LAN IP хоста

# 1. Находим основной сетевой IPv4-адрес
$hostIp = (Get-NetIPAddress -AddressFamily IPv4 -InterfaceIndex (Get-NetRoute -DestinationPrefix 0.0.0.0/0).InterfaceIndex).IPAddress

if (-not $hostIp) {
    Write-Host "Не удалось определить LAN IP, используем 127.0.0.1" -ForegroundColor Yellow
    $hostIp = "127.0.0.1"
} else {
    Write-Host "Определен локальный IP-адрес хоста: $hostIp" -ForegroundColor Green
}

# 2. Проверяем наличие .env
if (-not (Test-Path .env)) {
    Write-Host "Создаем .env из .env.example..." -ForegroundColor Gray
    Copy-Item .env.example .env
}

# 3. Читаем и обновляем .env, чтобы IP всегда был актуальным
$envContent = Get-Content .env
# Удаляем старые записи HOST_IP и PUBLIC_WEB_BASE если они были
$envContent = $envContent | Where-Object { $_ -notmatch '^HOST_IP=' -and $_ -notmatch '^PUBLIC_WEB_BASE=' }
# Добавляем новые
$envContent += "HOST_IP=$hostIp"
$envContent += "PUBLIC_WEB_BASE=http://$($hostIp):5173"
$envContent | Set-Content .env

Write-Host "Запускаем docker compose..." -ForegroundColor Cyan
docker compose up -d --build

Write-Host "`nQuestix запущен!" -ForegroundColor Green
Write-Host "Экран визуализатора: http://$($hostIp):5173/m/screen/<id>" -ForegroundColor Cyan
Write-Host "Админка / Управление: http://$($hostIp):5173/admin" -ForegroundColor Cyan
