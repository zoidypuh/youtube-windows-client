param(
  [int]$DurationSeconds = 120,
  [string]$SinkCaptureDevice = "CABLE Output (VB-Audio Virtual Cable)",
  [string]$SinkMatch = "CABLE Input",
  [double]$Volume = 0.5,
  [int]$LogIntervalMs = 250
)

$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$Stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$ArtifactDir = Join-Path $RepoRoot "artifacts\audio-probe\$Stamp"
$SinkDbLog = Join-Path $ArtifactDir "sink-db.log"
$SinkFfmpegLog = Join-Path $ArtifactDir "sink-ffmpeg.log"
$SinkWav = Join-Path $ArtifactDir "sink.wav"
$AppStdoutLog = Join-Path $ArtifactDir "app-stdout.log"
$AppStderrLog = Join-Path $ArtifactDir "app-stderr.log"
$MetaPath = Join-Path $ArtifactDir "probe-meta.json"

New-Item -ItemType Directory -Force -Path $ArtifactDir | Out-Null

$Ffmpeg = (Get-Command ffmpeg.exe -ErrorAction Stop).Source
$Npm = (Get-Command npm.cmd -ErrorAction Stop).Source

function Stop-RepoProcessTree {
  param([string]$Needle)

  $Processes = Get-CimInstance Win32_Process |
    Where-Object {
      $_.CommandLine -and
      $_.CommandLine.Contains($Needle) -and
      ($_.Name -in @("cmd.exe", "npm.cmd", "node.exe", "electron.exe"))
    }

  foreach ($Process in $Processes) {
    & taskkill.exe /PID $Process.ProcessId /T /F | Out-Null
  }
}

Stop-RepoProcessTree -Needle "yt-music-client"

$FfmpegArgs = @(
  "-hide_banner",
  "-nostdin",
  "-f",
  "dshow",
  "-i",
  "audio=`"$SinkCaptureDevice`""
)

if ($DurationSeconds -gt 0) {
  $FfmpegArgs += @("-t", [string]($DurationSeconds + 2))
}

$FfmpegArgs += @(
  "-c:a",
  "pcm_s16le",
  "sink.wav"
)

Write-Host "Audio probe artifacts: $ArtifactDir"
Write-Host "Starting ffmpeg capture from: $SinkCaptureDevice"
$CaptureStartedAt = Get-Date
@{
  captureStartedAt = $CaptureStartedAt.ToUniversalTime().ToString("o")
  durationSeconds = $DurationSeconds
  sinkCaptureDevice = $SinkCaptureDevice
  sinkMatch = $SinkMatch
  volume = $Volume
  logIntervalMs = $LogIntervalMs
} | ConvertTo-Json -Depth 3 | Set-Content -Path $MetaPath -Encoding UTF8

$FfmpegProcess = Start-Process -FilePath $Ffmpeg -ArgumentList $FfmpegArgs -WorkingDirectory $ArtifactDir -RedirectStandardError $SinkFfmpegLog -PassThru -WindowStyle Hidden

Start-Sleep -Milliseconds 800

if ($FfmpegProcess.HasExited) {
  throw "ffmpeg capture exited early. See $SinkFfmpegLog"
}

$env:YOUTUBE_TRAY_AUDIO_PROBE = "1"
$env:YOUTUBE_TRAY_AUDIO_PROBE_SINK_MATCH = $SinkMatch
$env:YOUTUBE_TRAY_AUDIO_PROBE_VOLUME = [string]$Volume
$env:YOUTUBE_TRAY_AUDIO_PROBE_LOG_INTERVAL_MS = [string]$LogIntervalMs

Write-Host "Starting YouTube Tray with probe volume $Volume and sink match '$SinkMatch'"
$AppProcess = Start-Process -FilePath $Npm -ArgumentList @("run", "start") -WorkingDirectory $RepoRoot -RedirectStandardOutput $AppStdoutLog -RedirectStandardError $AppStderrLog -PassThru

try {
  if ($DurationSeconds -gt 0) {
    Write-Host "Probe running for $DurationSeconds seconds. Press Ctrl+C to stop earlier."
    Start-Sleep -Seconds $DurationSeconds
  } else {
    Write-Host "Probe running until stopped. Press Ctrl+C to stop."
    while ($true) {
      Start-Sleep -Seconds 1
    }
  }
} finally {
  Write-Host "Stopping probe processes..."

  if ($AppProcess -and -not $AppProcess.HasExited) {
    & taskkill.exe /PID $AppProcess.Id /T /F | Out-Null
  }

  Stop-RepoProcessTree -Needle "yt-music-client"

  if ($FfmpegProcess -and -not $FfmpegProcess.HasExited) {
    if ($DurationSeconds -gt 0) {
      $FfmpegProcess.WaitForExit(3000) | Out-Null
    }

    if (-not $FfmpegProcess.HasExited) {
      & taskkill.exe /PID $FfmpegProcess.Id /T /F | Out-Null
    }
  }

  Write-Host "Audio probe artifacts: $ArtifactDir"
  Write-Host "App log: $AppStdoutLog"
  Write-Host "Sink WAV: $SinkWav"
  Write-Host "Probe metadata: $MetaPath"
}
