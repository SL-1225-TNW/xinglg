<#
.SYNOPSIS
    苔芽农场 CI 脱会话门卫：用 Windows 计划任务持有长跑，会话只观察心跳。

.DESCRIPTION
    为什么必须脱出会话 job 树：
    这台机器每 2–7 小时会把 harness 会话的后台 job 树连根杀掉。近 5 次全量 CI 有 4 次
    没有产判据（104/123、120/123 被杀）。CI 交给计划任务 MossFarmCI 后，node 父进程挂在
    Task Scheduler 下，会话被杀也不影响；会话只读 output/ci-heartbeat.json 与
    output/ci-journal.json 观察，不再自己持有长跑。

    任务：MossFarmCI，按需任务（无触发器），执行
        <绝对 node.exe> "<仓库根>\tests\run-ci.mjs" --resume [--from=<step-id>] [--quick]
    工作目录 = 仓库根；settings：MultipleInstances=IgnoreNew、ExecutionTimeLimit=4h。

.USAGE
    powershell -NoProfile -ExecutionPolicy Bypass -File tests\gate-detached.ps1 -Action status
    powershell -NoProfile -ExecutionPolicy Bypass -File tests\gate-detached.ps1 -Action install [-From <step-id>] [-Quick] [-DryRun]
    powershell -NoProfile -ExecutionPolicy Bypass -File tests\gate-detached.ps1 -Action start   [-From <step-id>] [-Quick] [-DryRun]
    powershell -NoProfile -ExecutionPolicy Bypass -File tests\gate-detached.ps1 -Action stop    [-DryRun]
    powershell -NoProfile -ExecutionPolicy Bypass -File tests\gate-detached.ps1 -Action uninstall [-DryRun]

    -Action 默认 status；-DryRun 只打印将执行的 action/settings/命令，不注册、不启动、不杀进程。
    status 在任务未注册时也照常从 output/ 文件读心跳、台账、退出记录。
    stop 会先 Stop-ScheduledTask，再对心跳里的 pid 执行 taskkill /PID <pid> /T /F，
    连 Chromium 子进程一起清（浏览器子进程会残留）。

.NOTES
    兼容 Windows PowerShell 5.1（本机没有 pwsh）。
    本文件必须保存为 UTF-8 带 BOM：否则 5.1 会把中文注释/输出按 ANSI 解释成乱码。
    所有路径由 $PSScriptRoot 推仓库根，不依赖当前目录。
#>
[CmdletBinding()]
param(
    [ValidateSet('status', 'install', 'start', 'stop', 'uninstall')]
    [string]$Action = 'status',
    [string]$From = '',
    [switch]$Quick,
    [switch]$DryRun
)

[Console]::OutputEncoding = [Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'

$TaskName = 'MossFarmCI'
$root = Split-Path -Parent $PSScriptRoot
$testsDir = Join-Path $root 'tests'
$runCi = Join-Path $testsDir 'run-ci.mjs'
$outDir = Join-Path $root 'output'
$heartbeatPath = Join-Path $outDir 'ci-heartbeat.json'
$journalPath = Join-Path $outDir 'ci-journal.json'
$exitLogPath = Join-Path $outDir 'ci-exit.log'
$journalLockPath = Join-Path $outDir 'ci-journal.lock'

$nodeExe = 'node.exe'
$nodeCmd = Get-Command node.exe -ErrorAction SilentlyContinue
if ($null -ne $nodeCmd) {
    if (-not [string]::IsNullOrWhiteSpace($nodeCmd.Source)) { $nodeExe = $nodeCmd.Source }
    elseif (-not [string]::IsNullOrWhiteSpace($nodeCmd.Path)) { $nodeExe = $nodeCmd.Path }
}
if ($nodeExe -eq 'node.exe') {
    Write-Host '! 没在 PATH 里找到 node.exe；注册的任务启动会失败。请先在能跑 node 的会话里执行。' -ForegroundColor Yellow
}

function Get-ActionArguments {
    $parts = @()
    $parts += ('"' + $runCi + '"')
    $parts += '--resume'
    if (-not [string]::IsNullOrWhiteSpace($From)) { $parts += ('--from=' + $From) }
    if ($Quick) { $parts += '--quick' }
    return ($parts -join ' ')
}

function Show-Plan {
    param([string]$Verb)
    Write-Host ('  计划任务：{0}' -f $TaskName)
    Write-Host ('  执行程序：{0}' -f $nodeExe)
    Write-Host ('  参数    ：{0}' -f (Get-ActionArguments))
    Write-Host ('  工作目录：{0}' -f $root)
    Write-Host '  设置    ：MultipleInstances=IgnoreNew，ExecutionTimeLimit=4h'
    Write-Host '  触发器  ：无（按需任务，由 Start-ScheduledTask 拉起）'
    if ($DryRun) {
        Write-Host ('  [DryRun] 只预览，未真正执行{0}。' -f $Verb)
    }
}

function Get-TaskInfo {
    try {
        return Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop
    } catch {
        return $null
    }
}

function Get-JsonFile {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) { return $null }
    try {
        $text = Get-Content -LiteralPath $Path -Raw -Encoding UTF8
        if ([string]::IsNullOrWhiteSpace($text)) { return $null }
        return ($text | ConvertFrom-Json)
    } catch {
        Write-Host ('  ! 读不懂 JSON：{0}（{1}）' -f $Path, $_.Exception.Message) -ForegroundColor Yellow
        return $null
    }
}

function Test-ProcessAlive {
    param([int]$ProcessId)
    if ($ProcessId -le 0) { return $false }
    $p = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
    return ($null -ne $p)
}

function ConvertTo-DateTimeOffset {
    param($Value)
    if ($null -eq $Value) { return $null }
    if ($Value -is [datetimeoffset]) { return $Value }
    if ($Value -is [datetime]) {
        # Windows PowerShell 5.1 的 ConvertFrom-Json 会把 ISO 字符串自动转成 [datetime]；
        # Kind=Unspecified 时按本地时间解释（ToUniversalTime 会处理）。
        return [datetimeoffset]$Value.ToUniversalTime()
    }
    $s = [string]$Value
    if ([string]::IsNullOrWhiteSpace($s)) { return $null }
    try {
        return [datetimeoffset]::Parse($s, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::RoundtripKind)
    } catch {
        try { return [datetimeoffset]::Parse($s, [Globalization.CultureInfo]::InvariantCulture) } catch { return $null }
    }
}

function Get-AgeSeconds {
    param($Value)
    $t = ConvertTo-DateTimeOffset -Value $Value
    if ($null -eq $t) { return $null }
    $thenUtc = $t.ToUniversalTime().UtcDateTime
    $nowUtc = (Get-Date).ToUniversalTime()
    return [math]::Max(0, [math]::Round(($nowUtc - $thenUtc).TotalSeconds))
}

function Format-Age {
    param($Seconds)
    if ($null -eq $Seconds) { return '未知' }
    if ($Seconds -lt 60) { return ('{0} 秒' -f [int]$Seconds) }
    if ($Seconds -lt 3600) { return ('{0} 分 {1} 秒' -f [int][math]::Floor($Seconds / 60), [int]($Seconds % 60)) }
    return ('{0} 小时 {1} 分' -f [int][math]::Floor($Seconds / 3600), [int][math]::Floor(($Seconds % 3600) / 60))
}

function Get-ShortHash {
    param([string]$Hash)
    if ([string]::IsNullOrWhiteSpace($Hash)) { return '????????????' }
    if ($Hash.Length -le 12) { return $Hash }
    return $Hash.Substring(0, 12)
}

function Get-TreeFromJournal {
    param($Journal)
    if ($null -eq $Journal -or $null -eq $Journal.trees) { return $null }
    $best = $null
    $bestTime = $null
    foreach ($prop in $Journal.trees.PSObject.Properties) {
        $t = $prop.Value
        $u = ConvertTo-DateTimeOffset -Value $t.updatedAt
        if ($null -eq $bestTime -or ($null -ne $u -and $u -gt $bestTime)) {
            $best = $t
            $bestTime = $u
        }
    }
    return $best
}

function Show-Status {
    Write-Host ''
    Write-Host '== MossFarmCI 状态 =='
    Write-Host ('仓库根  ：{0}' -f $root)
    Write-Host ('node    ：{0}' -f $nodeExe)

    $task = Get-TaskInfo
    if ($null -eq $task) {
        Write-Host '任务    ：未注册（先 -Action install；加 -DryRun 可预览注册内容）'
    } else {
        Write-Host ('任务    ：已注册（State={0}）' -f $task.State)
        $registeredAction = $task.Actions | Select-Object -First 1
        if ($null -ne $registeredAction) {
            Write-Host ('动作    ：{0} {1}' -f $registeredAction.Execute, $registeredAction.Arguments)
        }
    }

    $hb = Get-JsonFile $heartbeatPath
    $journal = Get-JsonFile $journalPath
    $heartState = ''
    $heartAlive = $false
    $heartAge = $null
    $stepText = '无'
    $stepTotal = 0
    $done = -1

    if ($null -eq $hb) {
        Write-Host '心跳    ：还没有 output/ci-heartbeat.json（尚未按新契约跑过 CI）'
    } else {
        $heartState = [string]$hb.state
        $procId = 0
        if ($null -ne $hb.pid) { $procId = [int]$hb.pid }
        $heartAlive = Test-ProcessAlive -ProcessId $procId
        $heartAge = Get-AgeSeconds -Value $hb.updatedAt
        if ($null -ne $hb.done) { $done = [int]$hb.done }
        if ($null -ne $hb.step) {
            $stepTotal = [int]$hb.step.total
            $stepIndex = [int]$hb.step.index
            $stepText = ('{0}（{1}/{2}）' -f ([string]$hb.step.id), $stepIndex, $stepTotal)
        }
        $aliveText = '已结束'
        if ($heartAlive) { $aliveText = '存活' }
        Write-Host ('心跳    ：state={0}，pid={1}（{2}），更新于 {3} 前' -f $heartState, ([string]$hb.pid), $aliveText, (Format-Age $heartAge))
        Write-Host ('当前步骤：{0}' -f $stepText)
        if ($done -ge 0) { Write-Host ('已完成  ：{0} 步' -f $done) }
        if ($null -ne $hb.log -and -not [string]::IsNullOrWhiteSpace([string]$hb.log)) {
            Write-Host ('聚合日志：{0}' -f [string]$hb.log)
        }
        if ($heartState -eq 'running' -and -not $heartAlive) {
            Write-Host '提示    ：心跳还写 running，但进程已不存在 —— 上次运行中断，不是通过。' -ForegroundColor Yellow
        } elseif ($heartState -eq 'running' -and ($null -ne $heartAge) -and ($heartAge -gt 180)) {
            Write-Host ('提示    ：心跳还写 running，但已 {0} 未更新 —— 疑似卡死/中断，不要当通过。' -f (Format-Age $heartAge)) -ForegroundColor Yellow
        }
    }

    $passCount = 0
    $failList = @()
    $unrun = -1
    $treeHash = ''
    if ($null -eq $journal) {
        Write-Host '台账    ：还没有台账 output/ci-journal.json（第一次跑完才落盘）'
    } else {
        if ($null -ne $hb -and -not [string]::IsNullOrWhiteSpace([string]$hb.treeHash)) {
            $treeHash = [string]$hb.treeHash
        } elseif ($null -ne $journal.lastRun -and -not [string]::IsNullOrWhiteSpace([string]$journal.lastRun.treeHash)) {
            $treeHash = [string]$journal.lastRun.treeHash
        } else {
            $fallbackTree = Get-TreeFromJournal -Journal $journal
            if ($null -ne $fallbackTree) { $treeHash = [string]$fallbackTree.treeHash }
        }
        $tree = $null
        if (-not [string]::IsNullOrWhiteSpace($treeHash) -and $null -ne $journal.trees) {
            foreach ($prop in $journal.trees.PSObject.Properties) {
                if ($prop.Name -eq $treeHash) { $tree = $prop.Value; break }
            }
        }
        if ($null -eq $tree) {
            Write-Host ('台账    ：没有当前 tree {0} 的记录' -f (Get-ShortHash $treeHash))
            $unrun = -1
        } else {
            # 收口判据固定 103 步（5 快速＋88 浏览器＋10 单文件）；heartbeat.step.total 只是
            #「本次运行范围」（--quick/--only/--stop-after 会小于 103），不能当分母。
            $total = 103
            if ($stepTotal -gt $total) { $total = $stepTotal }
            if ($null -ne $tree.steps) {
                foreach ($sp in $tree.steps.PSObject.Properties) {
                    $s = $sp.Value
                    if ([string]$s.status -eq 'pass') {
                        $passCount = $passCount + 1
                    } elseif ([string]$s.status -eq 'fail') {
                        $failId = [string]$s.id
                        if ([string]::IsNullOrWhiteSpace($failId)) { $failId = $sp.Name }
                        $failList += $failId
                    }
                }
            }
            $unrun = $total - $passCount - $failList.Count
            if ($unrun -lt 0) { $unrun = 0 }
            Write-Host ('台账    ：tree {0} {1}/{2} 绿' -f (Get-ShortHash $treeHash), $passCount, $total)
            if ($failList.Count -gt 0) {
                Write-Host ('失败    ：{0} 项：{1}' -f $failList.Count, (($failList | Select-Object -First 5) -join '、'))
            } else {
                Write-Host '失败    ：无'
            }
            Write-Host ('未跑    ：{0} 步' -f $unrun)
            if ($stepTotal -gt 0 -and $stepTotal -lt 103) {
                Write-Host ('范围提示：本次运行 total={0} 步（--quick/--only/--stop-after 等过滤/截断运行不构成全量收口判据，全量口径 103 步）' -f $stepTotal) -ForegroundColor Yellow
            }
        }
    }

    if (-not (Test-Path -LiteralPath $exitLogPath)) {
        Write-Host '退出记录：还没有 output/ci-exit.log'
    } else {
        try {
            $lines = @(Get-Content -LiteralPath $exitLogPath -Encoding UTF8 | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
            if ($lines.Count -eq 0) {
                Write-Host '退出记录：output/ci-exit.log 是空的'
            } else {
                # 每行 key=value，一次运行会写多行（tree/exit/complete/mode/line/log）；
                # line= 的值里含空格，所以按「第一个 = 之前是键」解析，取最近 20 行的最后一次出现。
                $pairs = @{}
                foreach ($ln in @($lines | Select-Object -Last 20)) {
                    if ($ln -match '^([A-Za-z][A-Za-z0-9_]*)=(.*)$') {
                        $pairs[$Matches[1]] = $Matches[2]
                    }
                }
                if ($pairs.ContainsKey('tree')) {
                    Write-Host ('记录 tree：{0}' -f (Get-ShortHash $pairs['tree']))
                }
                if ($pairs.ContainsKey('exit')) {
                    Write-Host ('最近 exit：{0}（0=通过、1=有失败、2=未收口、130=SIGINT）' -f $pairs['exit'])
                }
                if ($pairs.ContainsKey('complete')) {
                    Write-Host ('收口标记：complete={0}' -f $pairs['complete'])
                }
                if ($pairs.ContainsKey('line')) {
                    Write-Host ('最近结论：{0}' -f $pairs['line'])
                }
                if ($pairs.ContainsKey('log')) {
                    Write-Host ('最近日志：{0}' -f $pairs['log'])
                }
            }
        } catch {
            Write-Host ('退出记录：读不了 output/ci-exit.log（{0}）' -f $_.Exception.Message) -ForegroundColor Yellow
        }
    }

    if (Test-Path -LiteralPath $journalLockPath) {
        Write-Host '台账锁  ：output/ci-journal.lock 存在（可能有人正在写台账；结合心跳 pid 判断）'
    }

    $advice = ''
    if ($heartState -eq 'running' -and $heartAlive -and ($null -ne $heartAge) -and ($heartAge -le 180)) {
        $advice = '另一个 CI 正在跑：只用 node tests/run-ci.mjs --status 观察，不要重复启动'
    } elseif ($failList.Count -gt 0) {
        $advice = ('node tests/run-ci.mjs --from={0}（也可 -Action start 续跑）' -f $failList[0])
    } elseif ($unrun -gt 0) {
        $advice = '-Action start（内部 --resume）续跑未完项'
    } elseif ($heartState -eq 'running') {
        $advice = '-Action start 以 --resume 续跑（上次疑似中断）'
    } elseif ($passCount -gt 0 -and $unrun -eq 0 -and $failList.Count -eq 0) {
        $advice = '当前 tree 已全绿；需要新证据时从头跑 node tests/run-ci.mjs'
    } else {
        $advice = 'node tests/run-ci.mjs --quick 先跑快速层，或 -Action start 跑全量'
    }
    Write-Host ('下一步  ：{0}' -f $advice)
    Write-Host ''
}

function Invoke-Install {
    Write-Host '== 注册计划任务 =='
    if (-not (Test-Path -LiteralPath $runCi)) {
        Write-Host ('! 找不到 {0}；注册后启动会立刻失败。' -f $runCi) -ForegroundColor Yellow
    }
    Show-Plan -Verb '注册'
    if ($DryRun) { return $true }
    try {
        $taskAction = New-ScheduledTaskAction -Execute $nodeExe -Argument (Get-ActionArguments) -WorkingDirectory $root
        $taskSettings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 4)
        Register-ScheduledTask -TaskName $TaskName -Action $taskAction -Settings $taskSettings -Description '苔芽农场全量 CI（脱会话长跑，--resume）' -Force | Out-Null
        Write-Host '已注册计划任务 MossFarmCI（按需任务，无触发器）。'
        Write-Host '下一步：-Action start 启动；-Action status 观察心跳与台账。'
        return $true
    } catch {
        Write-Host ('注册失败：{0}' -f $_.Exception.Message) -ForegroundColor Red
        Write-Host '修复建议：'
        Write-Host '  1) 换非沙箱、有权限的会话重跑（注册计划任务需要相应权限；沙箱会话通常会被拒绝）。'
        Write-Host '  2) 用管理员 PowerShell：Start-Process powershell -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File ""<本脚本绝对路径>"" -Action install"'
        Write-Host '  3) 注册前可先 -Action install -DryRun 核对 action/settings 是否符合预期。'
        return $false
    }
}

function Invoke-Start {
    Write-Host '== 启动 CI（脱会话） =='
    $task = Get-TaskInfo
    if ($null -eq $task) {
        Write-Host '任务尚未注册：start 会先注册再启动。'
        if ($DryRun) {
            Show-Plan -Verb '注册并启动'
            Write-Host '  [DryRun] 未注册、未调用 Start-ScheduledTask，也没有启动任何 CI。'
            return $true
        }
        if (-not (Invoke-Install)) { return $false }
    } else {
        Write-Host ('任务已注册（State={0}）。' -f $task.State)
        Show-Plan -Verb '启动'
    }
    if ($DryRun) {
        Write-Host '  [DryRun] 未调用 Start-ScheduledTask，也没有启动任何 CI。'
        return $true
    }
    try {
        Start-ScheduledTask -TaskName $TaskName
        Write-Host '已调用 Start-ScheduledTask；等 2 秒后读心跳（抓不到心跳就再 -Action status）。'
        Start-Sleep -Seconds 2
    } catch {
        Write-Host ('启动失败：{0}' -f $_.Exception.Message) -ForegroundColor Red
        Write-Host '修复建议：安全软件/权限可能拦截；先用 -Action status 看是否已落心跳，再决定是否重试。'
        return $false
    }
    Show-Status
    return $true
}

function Invoke-Stop {
    Write-Host '== 停止 CI =='
    $task = Get-TaskInfo
    if ($null -eq $task) {
        Write-Host '任务未注册，跳过 Stop-ScheduledTask。'
    } elseif ($DryRun) {
        Write-Host '  [DryRun] 未调用 Stop-ScheduledTask。'
    } else {
        try {
            Stop-ScheduledTask -TaskName $TaskName
            Write-Host '已调用 Stop-ScheduledTask。'
        } catch {
            Write-Host ('Stop-ScheduledTask 失败（可能本来没在跑）：{0}' -f $_.Exception.Message) -ForegroundColor Yellow
        }
    }

    $hb = Get-JsonFile $heartbeatPath
    $procId = 0
    if ($null -ne $hb -and $null -ne $hb.pid) { $procId = [int]$hb.pid }
    if ($procId -le 0) {
        Write-Host '没有可用的心跳 pid，无法定位残留 node 进程；如仍见 chrome.exe/node.exe 残留请手动清理。'
        return $true
    }
    if (-not (Test-ProcessAlive -ProcessId $procId)) {
        Write-Host ('心跳 pid {0} 已不在，无需杀进程。' -f $procId)
        return $true
    }
    if ($DryRun) {
        Write-Host ('  [DryRun] 将执行：taskkill /PID {0} /T /F（连 Chromium 子进程一起清）' -f $procId)
        return $true
    }
    Write-Host ('心跳 pid {0} 仍存活，执行 taskkill /PID {0} /T /F 杀整棵子树（Chromium 子进程会残留）…' -f $procId)
    $killOut = & taskkill.exe /PID $procId /T /F 2>&1
    if ($null -ne $killOut) { Write-Host (($killOut | ForEach-Object { [string]$_ }) -join "`n") }
    Start-Sleep -Milliseconds 800
    if (Test-ProcessAlive -ProcessId $procId) {
        Write-Host 'pid 仍存活：可能权限不足；换非沙箱会话重试（或任务管理器结束）。' -ForegroundColor Yellow
        return $false
    }
    Write-Host '已结束。'
    return $true
}

function Invoke-Uninstall {
    Write-Host '== 注销计划任务 =='
    $task = Get-TaskInfo
    if ($null -eq $task) {
        Write-Host '任务本来就没注册，无需注销。'
        return $true
    }
    if ($DryRun) {
        Write-Host '  [DryRun] 未调用 Unregister-ScheduledTask。'
        return $true
    }
    try {
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
        Write-Host '已注销计划任务 MossFarmCI（不影响 output/ 里的心跳、台账与日志）。'
        return $true
    } catch {
        Write-Host ('注销失败：{0}' -f $_.Exception.Message) -ForegroundColor Red
        Write-Host '修复建议：换非沙箱、有权限的会话重试。'
        return $false
    }
}

Write-Host '苔芽农场 · 脱会话 CI 门卫（MossFarmCI）'
Write-Host ('脚本目录：{0}' -f $PSScriptRoot)
Write-Host ('仓库根  ：{0}' -f $root)
if (-not (Test-Path -LiteralPath $runCi)) {
    Write-Host ('! 找不到 {0}；请在仓库内的 tests\ 下运行本脚本。' -f $runCi) -ForegroundColor Yellow
}
Write-Host ''

$ok = $true
switch ($Action) {
    'status'    { Show-Status }
    'install'   { $ok = Invoke-Install }
    'start'     { $ok = Invoke-Start }
    'stop'      { $ok = Invoke-Stop }
    'uninstall' { $ok = Invoke-Uninstall }
}

if ($ok) { exit 0 } else { exit 1 }
