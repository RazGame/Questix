# Демо-данные для проверки дизайна: активная игра, две команды, прохождение, публикация.
# Пользователи: design_org / design_cap / design_mem (пароль password1)
$ErrorActionPreference = 'Stop'
$base = 'http://localhost:5000'

function Api($method, $url, $body, $token) {
  $headers = @{}
  if ($token) { $headers['Authorization'] = "Bearer $token" }
  $params = @{ Method = $method; Uri = "$base$url"; Headers = $headers }
  if ($body) {
    $params['Body'] = ($body | ConvertTo-Json -Depth 5)
    $params['ContentType'] = 'application/json'
  }
  Invoke-RestMethod @params
}

function EnsureUser($first, $last, $nick, $mail) {
  try {
    Api POST '/auth/signup' @{ firstName=$first; lastName=$last; nickname=$nick; username=$mail; city='Москва'; phone='+79990000000'; hashed_pwd='password1' } | Out-Null
  } catch {}
  Api POST '/auth/login' @{ username=$mail; hashed_pwd='password1' }
}

$org = EnsureUser 'Олег' 'Громов' 'design_org' 'design_org@t.io'
$cap = EnsureUser 'Кира' 'Соколова' 'design_cap' 'design_cap@t.io'
$mem = EnsureUser 'Макс' 'Орлов' 'design_mem' 'design_mem@t.io'

docker exec quest-mongodb mongosh -u admin -p password --authenticationDatabase admin quest --quiet --eval "db.users.updateOne({nickname:'design_org'},{`$set:{roles:['user','organizer']}})" | Out-Null
$org = Api POST '/auth/login' @{ username='design_org@t.io'; hashed_pwd='password1' }

# Игра создаётся в будущем (иначе заявки не принять), после заявок даты сдвигаем назад
$start = (Get-Date).AddHours(1).ToUniversalTime().ToString('o')
$end = (Get-Date).AddHours(3).ToUniversalTime().ToString('o')
$game = (Api POST '/games' @{ title='Огни большого города'; city='Москва'; dateofstart=$start; dateofend=$end; deposit='300 ₽'; prize='15 000 ₽'; description='Ночной маршрут по центру: три точки, три шифра. Команда, фонарик и полтора часа на всё.' } $org.token).game

$t1 = (Api POST "/tasks/game/$($game._id)" @{ title='Шифр на фасаде'; description='<h2>Точка 1</h2><p>Найдите дом с барельефом льва и посчитайте окна на третьем этаже.</p>'; answers=@('7','семь'); orderIndex=0; points=10; hints=@('Смотрите выше первого этажа') } $org.token).task
$t2 = (Api POST "/tasks/game/$($game._id)" @{ title='Загадка двора'; description='<h2>Точка 2</h2><p>Во дворе спрятана дата. Введите год.</p>'; answers=@('1898'); orderIndex=1; points=10 } $org.token).task
$t3 = (Api POST "/tasks/game/$($game._id)" @{ title='Финальный тайник'; description='<h2>Финал</h2><p>Кодовое слово из тайника.</p>'; answers=@('маяк'); orderIndex=2; points=20 } $org.token).task

# Команда А: Кира (капитан) + Макс - проходит всё
try { Api POST '/teams' @{ name='Хранители ключей' } $cap.token | Out-Null } catch {}
$capTeams = Api GET '/teams/my-teams' $null $cap.token
$teamA = $capTeams[0]
try { Api POST "/teams/$($teamA._id)/members" @{ nickname='design_mem' } $cap.token | Out-Null } catch {}
$cap = Api POST '/auth/login' @{ username='design_cap@t.io'; hashed_pwd='password1' }
$applA = (Api POST '/appls' @{ gameId=$game._id } $cap.token).appl
Api PATCH "/appls/$($applA._id)/status" @{ status='approved' } $org.token | Out-Null

# Заявка команды Б тоже до старта
try { Api POST '/teams' @{ name='Ночные совы' } $org.token | Out-Null } catch {}
$org = Api POST '/auth/login' @{ username='design_org@t.io'; hashed_pwd='password1' }
$applB = (Api POST '/appls' @{ gameId=$game._id } $org.token).appl
Api PATCH "/appls/$($applB._id)/status" @{ status='approved' } $org.token | Out-Null

# Сдвигаем старт игры в прошлое - игра становится активной
docker exec quest-mongodb mongosh -u admin -p password --authenticationDatabase admin quest --quiet --eval "db.games.updateOne({_id:ObjectId('$($game._id)')},{`$set:{dateofstart:new Date(Date.now()-10*60*1000)}})" | Out-Null

Api POST '/progress/start' @{ gameApplId=$applA._id } $mem.token | Out-Null
Api POST "/progress/$($applA._id)/submit-answer" @{ answer='5' } $mem.token | Out-Null
Api POST "/progress/$($applA._id)/submit-answer" @{ answer='7' } $cap.token | Out-Null
Start-Sleep -Seconds 2
Api POST "/progress/$($applA._id)/submit-answer" @{ answer='1898' } $mem.token | Out-Null
Start-Sleep -Seconds 1
Api POST "/progress/$($applA._id)/submit-answer" @{ answer='маяк' } $mem.token | Out-Null

# Команда Б проходит частично
Api POST '/progress/start' @{ gameApplId=$applB._id } $org.token | Out-Null
Api POST "/progress/$($applB._id)/submit-answer" @{ answer='7' } $org.token | Out-Null

# Публикуем результаты
Api POST "/games/$($game._id)/publish" $null $org.token | Out-Null

Write-Host "game: $($game._id)"
Write-Host "applA: $($applA._id)"
Write-Host "applB: $($applB._id)"
Write-Host "teamA: $($teamA._id)"
