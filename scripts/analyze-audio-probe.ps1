param(
  [Parameter(Mandatory = $true)]
  [string]$ArtifactDir,
  [double]$PeakThresholdDb = -20.0,
  [double]$ContextSeconds = 5.0
)

$ErrorActionPreference = "Stop"

$ResolvedArtifactDir = Resolve-Path $ArtifactDir
$MetaPath = Join-Path $ResolvedArtifactDir "probe-meta.json"
$SinkDbLog = Join-Path $ResolvedArtifactDir "sink-db.log"
$SinkWav = Join-Path $ResolvedArtifactDir "sink.wav"
$AppStdoutLog = Join-Path $ResolvedArtifactDir "app-stdout.log"

if (-not (Test-Path $MetaPath)) {
  throw "Missing probe metadata: $MetaPath"
}

if ((-not (Test-Path $SinkDbLog)) -or ((Get-Item $SinkDbLog).Length -eq 0)) {
  if (-not (Test-Path $SinkWav)) {
    throw "Missing sink WAV for analysis: $SinkWav"
  }

  $Ffmpeg = (Get-Command ffmpeg.exe -ErrorAction Stop).Source
  $AnalyzeCommand = "`"$Ffmpeg`" -hide_banner -i `"$SinkWav`" -filter_complex ebur128=peak=true -f null NUL 2> `"$SinkDbLog`""
  Push-Location $ResolvedArtifactDir
  try {
    & cmd.exe /c $AnalyzeCommand | Out-Null
  } finally {
    Pop-Location
  }
}

$Meta = Get-Content $MetaPath -Raw | ConvertFrom-Json
$CaptureStartedAt = [DateTimeOffset]::Parse($Meta.captureStartedAt)
$Readings = New-Object System.Collections.Generic.List[object]

foreach ($Line in Get-Content $SinkDbLog) {
  if ($Line -notmatch "t:\s*([0-9.]+).*?FTPK:\s*([-0-9.inf]+)\s+([-0-9.inf]+)\s+dBFS") {
    continue
  }

  $TimeSeconds = [double]$Matches[1]
  $LeftPeak = if ($Matches[2] -eq "-inf") { [double]::NegativeInfinity } else { [double]$Matches[2] }
  $RightPeak = if ($Matches[3] -eq "-inf") { [double]::NegativeInfinity } else { [double]$Matches[3] }
  $Peak = [Math]::Max($LeftPeak, $RightPeak)
  $At = $CaptureStartedAt.AddSeconds($TimeSeconds)

  $Readings.Add([pscustomobject]@{
    at = $At.ToString("o")
    captureSeconds = [Math]::Round($TimeSeconds, 3)
    peakDbfs = [Math]::Round($Peak, 2)
  }) | Out-Null
}

$Spikes = $Readings | Where-Object { $_.peakDbfs -ge $PeakThresholdDb }

Write-Host "Readings: $($Readings.Count)"
Write-Host "Peak threshold: $PeakThresholdDb dBFS"

if (-not $Spikes) {
  $Loudest = $Readings | Sort-Object peakDbfs -Descending | Select-Object -First 5
  Write-Host "No spikes met threshold. Loudest readings:"
  $Loudest | Format-Table -AutoSize
  return
}

Write-Host "Spike candidates:"
$Spikes | Format-Table -AutoSize

if (-not (Test-Path $AppStdoutLog)) {
  Write-Host "No app log found for context: $AppStdoutLog"
  return
}

$AppLines = Get-Content $AppStdoutLog

foreach ($Spike in $Spikes) {
  $SpikeAt = [DateTimeOffset]::Parse($Spike.at)
  $From = $SpikeAt.AddSeconds(-$ContextSeconds)
  $To = $SpikeAt.AddSeconds($ContextSeconds)

  Write-Host ""
  Write-Host "App log context for spike at $($Spike.at), peak $($Spike.peakDbfs) dBFS:"

  foreach ($Line in $AppLines) {
    if ($Line -notmatch '"at":"([^"]+)"') {
      continue
    }

    $LineAt = [DateTimeOffset]::Parse($Matches[1])

    if ($LineAt -ge $From -and $LineAt -le $To) {
      Write-Host $Line
    }
  }
}
