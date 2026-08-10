# Smoke-тест командного флоу Questix (запускается против localhost:5000)
# Параметры mongo нужны только для бутстрапа роли organizer первому пользователю
param(
  [string]$MongoContainer = 'quest-mongo-smoke',
  [string]$MongoDb = 'quest-smoke',
  [string]$MongoAuthArgs = ''
)

$ErrorActionPreference = 'Stop'
$base = 'http://localhost:5000'
$pass = 0
$fail = 0

function Check($name, $cond) {
  if ($cond) { $script:pass++; Write-Host "PASS: $name" }
  else { $script:fail++; Write-Host "FAIL: $name" -ForegroundColor Red }
}

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

$ts = Get-Date -Format 'HHmmss'

# 1. Регистрация: капитан, участник, организатор
$cap = Api POST '/auth/signup' @{ firstName='Cap'; lastName='Tain'; nickname="cap$ts"; username="cap$ts@t.io"; city='SPb'; phone='+70000000001'; hashed_pwd='password1' }
$mem = Api POST '/auth/signup' @{ firstName='Mem'; lastName='Ber'; nickname="mem$ts"; username="mem$ts@t.io"; city='SPb'; phone='+70000000002'; hashed_pwd='password1' }
$org = Api POST '/auth/signup' @{ firstName='Org'; lastName='Anizer'; nickname="org$ts"; username="org$ts@t.io"; city='SPb'; phone='+70000000003'; hashed_pwd='password1' }
Check 'signup x3' ($cap.token -and $mem.token -and $org.token)

# 2. Выдать организатору роль organizer напрямую в БД (бутстрап)
$mongoCmd = "docker exec $MongoContainer mongosh $MongoAuthArgs $MongoDb --quiet --eval `"db.users.updateOne({nickname:'org$ts'},{```$set:{roles:['user','organizer']}})`""
Invoke-Expression $mongoCmd | Out-Null
$org = Api POST '/auth/login' @{ username="org$ts@t.io"; hashed_pwd='password1' }
Check 'organizer role assigned' ($org.user.roles -contains 'organizer')

# 3. Организатор создаёт игру (старт через 6 секунд)
$start = (Get-Date).ToUniversalTime().AddSeconds(6).ToString('o')
$end = (Get-Date).ToUniversalTime().AddHours(1).ToString('o')
$game = (Api POST '/games' @{ title="Smoke Quest $ts"; city='SPb'; dateofstart=$start; dateofend=$end; deposit='0'; prize='100'; description='smoke'; taskOrderMode='linear' } $org.token).game
Check 'organizer creates game' ($null -ne $game._id)
Check 'game has linear order mode' ($game.taskOrderMode -eq 'linear')

# 4. Организатор создаёт задания своей игры (очков больше нет)
$t1 = (Api POST "/tasks/game/$($game._id)" @{ title='T1'; description='d1'; answers=@('one'); orderIndex=0 } $org.token).task
$t2 = (Api POST "/tasks/game/$($game._id)" @{ title='T2'; description='d2'; answers=@('two'); orderIndex=1 } $org.token).task
Check 'organizer creates tasks' ($t1._id -and $t2._id)

# 5. Капитан создаёт команду и добавляет участника по никнейму
$team = (Api POST '/teams' @{ name="Alpha $ts" } $cap.token).team
Check 'create team' ($null -ne $team._id)
$team = (Api POST "/teams/$($team._id)/members" @{ nickname="mem$ts" } $cap.token).team
Check 'add member by nickname' (($team.members | Measure-Object).Count -eq 2)

# Капитан получил роль team_captain
$capLogin = Api POST '/auth/login' @{ username="cap$ts@t.io"; hashed_pwd='password1' }
Check 'captain got team_captain role' ($capLogin.user.roles -contains 'team_captain')

# Участник не может подать заявку (не капитан)
$memApplFailed = $false
try { Api POST '/appls' @{ gameId = $game._id } $mem.token | Out-Null } catch { $memApplFailed = $true }
Check 'non-captain cannot apply' $memApplFailed

# 6. Капитан подаёт заявку от команды
$appl = (Api POST '/appls' @{ gameId = $game._id } $capLogin.token).appl
Check 'captain applies with team' ($appl.team -eq $team._id)

# 7. Организатор видит заявки своей игры и одобряет
$gameAppls = Api GET "/appls/game/$($game._id)" $null $org.token
Check 'organizer sees game appls' (($gameAppls | Measure-Object).Count -eq 1)
$approved = (Api PATCH "/appls/$($appl._id)/status" @{ status='approved' } $org.token).appl
Check 'organizer approves appl' ($approved.status -eq 'approved')

# 8. Участник видит заявку своей команды в /appls/my
$memAppls = Api GET '/appls/my' $null $mem.token
Check 'member sees team appl' (($memAppls | Where-Object { $_._id -eq $appl._id } | Measure-Object).Count -eq 1)

# 8.1 Индивидуальное время старта: команда не может стартовать раньше
$farStart = (Get-Date).ToUniversalTime().AddMinutes(30).ToString('o')
Api PATCH "/appls/$($appl._id)/settings" @{ startAt = $farStart } $org.token | Out-Null

# 9. Дождаться старта игры
Start-Sleep -Seconds 7

$startBlocked = $false
try { Api POST '/progress/start' @{ gameApplId = $appl._id } $mem.token | Out-Null } catch { $startBlocked = $true }
Check 'team start blocked before its startAt' $startBlocked

# Сбросить индивидуальный старт - теперь можно играть
Api PATCH "/appls/$($appl._id)/settings" @{ startAt = $null } $org.token | Out-Null

# 10. УЧАСТНИК (не капитан) начинает игру
$progress = (Api POST '/progress/start' @{ gameApplId = $appl._id } $mem.token).progress
Check 'member starts game' ($progress.status -eq 'in_progress')

# 11. Участник видит текущее задание
$current = Api GET "/progress/$($appl._id)/current-task" $null $mem.token
Check 'member gets current task' ($current.task.title -eq 'T1')

# 12. Участник отвечает неверно, потом капитан верно
$wrong = Api POST "/progress/$($appl._id)/submit-answer" @{ answer='nope' } $mem.token
Check 'wrong answer rejected' ($wrong.isCorrect -eq $false)
$right1 = Api POST "/progress/$($appl._id)/submit-answer" @{ answer='one' } $capLogin.token
Check 'captain correct answer advances team' ($right1.isCorrect -eq $true)

# Команда перешла на задание 2 (видно участнику)
$current2 = Api GET "/progress/$($appl._id)/current-task" $null $mem.token
Check 'team advanced to T2 for member' ($current2.task.title -eq 'T2')

# 13. Участник завершает игру
$right2 = Api POST "/progress/$($appl._id)/submit-answer" @{ answer='two' } $mem.token
$final = Api GET "/progress/$($appl._id)/current-task" $null $mem.token
Check 'game completed' ($final.status -eq 'completed')

# 14. Организатор видит логи своей игры
$logs = Api GET "/games/$($game._id)/logs" $null $org.token
$actions = $logs | ForEach-Object { $_.action }
Check 'logs: game_started' ($actions -contains 'game_started')
Check 'logs: incorrect answer' ($actions -contains 'task_incorrect')
Check 'logs: correct answer' ($actions -contains 'task_correct')
Check 'logs: game_finished' ($actions -contains 'game_finished')
$wrongLog = $logs | Where-Object { $_.action -eq 'task_incorrect' } | Select-Object -First 1
Check 'log records who answered' ($wrongLog.user.nickname -eq "mem$ts")

# Участник логов не видит
$logsDenied = $false
try { Api GET "/games/$($game._id)/logs" $null $mem.token | Out-Null } catch { $logsDenied = $true }
Check 'member cannot see logs' $logsDenied

# 15. До публикации участник не видит статистику
$statsDenied = $false
try { Api GET "/games/$($game._id)/stats" $null $mem.token | Out-Null } catch { $statsDenied = $true }
Check 'stats hidden before publish' $statsDenied

# Организатор видит статистику до публикации
$orgStats = Api GET "/games/$($game._id)/stats" $null $org.token
Check 'organizer sees stats before publish' ($orgStats.totalTeams -eq 1)

# 16. Организатор публикует результаты
Api POST "/games/$($game._id)/publish" $null $org.token | Out-Null

# 16.1 Штрафы и бонусы ко времени команды (только модератор игры)
$memAdjustDenied = $false
try { Api POST "/progress/$($appl._id)/adjust-time" @{ amount = 60; reason = '試' } $mem.token | Out-Null } catch { $memAdjustDenied = $true }
Check 'member cannot adjust time' $memAdjustDenied

Api POST "/progress/$($appl._id)/adjust-time" @{ amount = 120; reason = 'Опоздание на точку' } $org.token | Out-Null
Api POST "/progress/$($appl._id)/adjust-time" @{ amount = -30; reason = 'Бонус за находчивость' } $org.token | Out-Null

# 17. После публикации участник видит статистику с submittedBy и местом
$stats = Api GET "/games/$($game._id)/stats" $null $mem.token
$teamStat = $stats.statistics[0]
Check 'member sees stats after publish' ($stats.game.published -eq $true)
Check 'team has place 1' ($teamStat.place -eq 1)
Check 'teamName in stats' ($teamStat.teamName -eq "Alpha $ts")
$step1 = $teamStat.taskResults[0]
$step2 = $teamStat.taskResults[1]
Check 'step1 submittedBy = captain' ($step1.submittedBy.nickname -eq "cap$ts")
Check 'step2 submittedBy = member' ($step2.submittedBy.nickname -eq "mem$ts")
Check 'step has completedAt and timeSpent' ($step1.completedAt -and $null -ne $step1.timeSpent)

# Корректировки видны в статистике и входят в итоговое время
Check 'stats show adjustments' (($teamStat.timeAdjustments | Measure-Object).Count -eq 2)
Check 'adjustments total = +90' ($teamStat.adjustmentsTotal -eq 90)
Check 'total time includes adjustments' ($teamStat.totalTime -eq ($teamStat.baseTotalTime + 90))

# 18. Участник выходит из команды; капитан не может выйти
Api POST "/teams/$($team._id)/leave" $null $mem.token | Out-Null
$teamAfter = Api GET "/teams/$($team._id)" $null $capLogin.token
Check 'member left team' (($teamAfter.members | Measure-Object).Count -eq 1)
$capLeaveDenied = $false
try { Api POST "/teams/$($team._id)/leave" $null $capLogin.token | Out-Null } catch { $capLeaveDenied = $true }
Check 'captain cannot leave' $capLeaveDenied

# 19. Профиль и роли
$updProfile = (Api PUT '/users/profile' @{ city='Moscow' } $mem.token).user
Check 'profile update' ($updProfile.city -eq 'Moscow')

# 20. Соорганизаторы
$org2 = Api POST '/auth/signup' @{ firstName='Org2'; lastName='Second'; nickname="org2$ts"; username="org2$ts@t.io"; city='SPb'; phone='+70000000004'; hashed_pwd='password1' }

# До добавления org2 не модератор: логи недоступны
$org2Denied = $false
try { Api GET "/games/$($game._id)/logs" $null $org2.token | Out-Null } catch { $org2Denied = $true }
Check 'org2 cannot see logs before being added' $org2Denied

# Создатель добавляет соорганизатора по никнейму
$gameWithOrgs = (Api POST "/games/$($game._id)/organizers" @{ nickname="org2$ts" } $org.token).game
Check 'creator adds co-organizer' (($gameWithOrgs.organizers | Measure-Object).Count -eq 1)

# org2 получил роль organizer автоматически
$org2 = Api POST '/auth/login' @{ username="org2$ts@t.io"; hashed_pwd='password1' }
Check 'co-organizer got organizer role' ($org2.user.roles -contains 'organizer')

# Соорганизатор может править игру, видеть логи и заявки
$updGame = (Api PUT "/games/$($game._id)" @{ description='updated by co-organizer' } $org2.token).game
Check 'co-organizer edits game' ($updGame.description -eq 'updated by co-organizer')
$org2Logs = Api GET "/games/$($game._id)/logs" $null $org2.token
Check 'co-organizer sees logs' (($org2Logs | Measure-Object).Count -gt 0)
$org2Appls = Api GET "/appls/game/$($game._id)" $null $org2.token
Check 'co-organizer sees appls' (($org2Appls | Measure-Object).Count -eq 1)

# Соорганизатор не может управлять списком организаторов (только админ/создатель)
$org2ManageDenied = $false
try { Api POST "/games/$($game._id)/organizers" @{ nickname="mem$ts" } $org2.token | Out-Null } catch { $org2ManageDenied = $true }
Check 'co-organizer cannot manage organizers' $org2ManageDenied

# Организаторы видны в публичной информации о квесте
$publicGame = Api GET "/games/$($game._id)"
Check 'organizers visible in game info' ($publicGame.organizers[0].nickname -eq "org2$ts")

# Создатель убирает соорганизатора
$gameNoOrgs = (Api DELETE "/games/$($game._id)/organizers/$($org2.user.id)" $null $org.token).game
Check 'creator removes co-organizer' (($gameNoOrgs.organizers | Measure-Object).Count -eq 0)

# 21. Ручной порядок заданий: организатор задаёт обратный порядок для команды
$start2 = (Get-Date).ToUniversalTime().AddSeconds(5).ToString('o')
$end2 = (Get-Date).ToUniversalTime().AddHours(1).ToString('o')
$game2 = (Api POST '/games' @{ title="Smoke Manual $ts"; city='SPb'; dateofstart=$start2; dateofend=$end2; deposit='0'; prize='1'; description='manual order'; taskOrderMode='manual' } $org.token).game
$m1 = (Api POST "/tasks/game/$($game2._id)" @{ title='M1'; description='d'; answers=@('a'); orderIndex=0 } $org.token).task
$m2 = (Api POST "/tasks/game/$($game2._id)" @{ title='M2'; description='d'; answers=@('b'); orderIndex=1 } $org.token).task

$appl2 = (Api POST '/appls' @{ gameId = $game2._id } $capLogin.token).appl
Api PATCH "/appls/$($appl2._id)/status" @{ status='approved' } $org.token | Out-Null

# Обратный порядок: сначала M2, потом M1
Api PATCH "/appls/$($appl2._id)/settings" @{ taskOrder = @($m2._id, $m1._id) } $org.token | Out-Null

# Неполный порядок должен отклоняться
$badOrderRejected = $false
try { Api PATCH "/appls/$($appl2._id)/settings" @{ taskOrder = @($m1._id) } $org.token | Out-Null } catch { $badOrderRejected = $true }
Check 'partial manual order rejected' $badOrderRejected

Start-Sleep -Seconds 6
Api POST '/progress/start' @{ gameApplId = $appl2._id } $capLogin.token | Out-Null
$current = Api GET "/progress/$($appl2._id)/current-task" $null $capLogin.token
Check 'manual order: first task is M2' ($current.task.title -eq 'M2')

Write-Host ''
Write-Host "RESULT: $pass passed, $fail failed" -ForegroundColor $(if ($fail -eq 0) { 'Green' } else { 'Red' })
exit $(if ($fail -eq 0) { 0 } else { 1 })
