param(
  [string]$WindowTitle = "YouTube Tray",
  [string]$OutputPath = "artifacts\watchdog\youtube-tray-window.png",
  [int]$Width = 1180,
  [int]$Height = 820,
  [switch]$ExactTitle,
  [switch]$NoMoveToPrimary,
  [switch]$IncludeHidden
)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms

if (-not ("NativeWindowCapture" -as [type])) {
  Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;

public class NativeWindowCapture {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

  [StructLayout(LayoutKind.Sequential)]
  public struct RECT {
    public int Left;
    public int Top;
    public int Right;
    public int Bottom;
  }

  [DllImport("user32.dll")]
  public static extern bool EnumWindows(EnumWindowsProc enumProc, IntPtr lParam);

  [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)]
  public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

  [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)]
  public static extern int GetWindowTextLength(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern bool IsWindowVisible(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern bool IsIconic(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);

  [DllImport("user32.dll")]
  public static extern bool SetForegroundWindow(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

  [DllImport("user32.dll")]
  public static extern bool MoveWindow(IntPtr hWnd, int X, int Y, int nWidth, int nHeight, bool bRepaint);

  [DllImport("user32.dll")]
  public static extern bool PrintWindow(IntPtr hwnd, IntPtr hdcBlt, uint nFlags);
}
"@
}

function Get-WindowTitle([IntPtr]$Handle) {
  $length = [NativeWindowCapture]::GetWindowTextLength($Handle)
  if ($length -le 0) {
    return ""
  }

  $builder = [System.Text.StringBuilder]::new($length + 1)
  [void][NativeWindowCapture]::GetWindowText($Handle, $builder, $builder.Capacity)
  return $builder.ToString()
}

function Get-WindowRectangle([IntPtr]$Handle) {
  $rect = [NativeWindowCapture+RECT]::new()
  if (-not [NativeWindowCapture]::GetWindowRect($Handle, [ref]$rect)) {
    throw "Unable to read bounds for HWND $Handle."
  }

  $rectWidth = $rect.Right - $rect.Left
  $rectHeight = $rect.Bottom - $rect.Top

  if ($rectWidth -le 0 -or $rectHeight -le 0) {
    throw "Window HWND $Handle has invalid bounds $($rect.Left),$($rect.Top) $rectWidth x $rectHeight."
  }

  [pscustomobject]@{
    X = $rect.Left
    Y = $rect.Top
    Width = $rectWidth
    Height = $rectHeight
  }
}

function Test-BitmapLooksBlank([System.Drawing.Bitmap]$Bitmap) {
  $colors = New-Object 'System.Collections.Generic.HashSet[int]'
  $xStep = [Math]::Max(1, [Math]::Floor($Bitmap.Width / 12))
  $yStep = [Math]::Max(1, [Math]::Floor($Bitmap.Height / 12))

  for ($y = 0; $y -lt $Bitmap.Height; $y += $yStep) {
    for ($x = 0; $x -lt $Bitmap.Width; $x += $xStep) {
      $color = $Bitmap.GetPixel($x, $y).ToArgb()
      [void]$colors.Add($color)
      if ($colors.Count -gt 3) {
        return $false
      }
    }
  }

  return $true
}

function Save-Bitmap([System.Drawing.Bitmap]$Bitmap, [string]$Path) {
  $directory = Split-Path -Parent $Path
  if ($directory) {
    New-Item -ItemType Directory -Force -Path $directory | Out-Null
  }

  $Bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
}

function Capture-WithPrintWindow([IntPtr]$Handle, $Bounds) {
  $bitmap = [System.Drawing.Bitmap]::new($Bounds.Width, $Bounds.Height)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $hdc = $graphics.GetHdc()

  try {
    $pwRenderFullContent = 0x00000002
    $ok = [NativeWindowCapture]::PrintWindow($Handle, $hdc, $pwRenderFullContent)
  } finally {
    $graphics.ReleaseHdc($hdc)
    $graphics.Dispose()
  }

  [pscustomobject]@{
    Bitmap = $bitmap
    Ok = $ok
    LooksBlank = Test-BitmapLooksBlank $bitmap
  }
}

function Capture-WithScreenCopy($Bounds) {
  $bitmap = [System.Drawing.Bitmap]::new($Bounds.Width, $Bounds.Height)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)

  try {
    $graphics.CopyFromScreen($Bounds.X, $Bounds.Y, 0, 0, [System.Drawing.Size]::new($Bounds.Width, $Bounds.Height))
  } finally {
    $graphics.Dispose()
  }

  return $bitmap
}

$matches = New-Object 'System.Collections.Generic.List[object]'
$callback = [NativeWindowCapture+EnumWindowsProc]{
  param([IntPtr]$Handle, [IntPtr]$Param)

  $title = Get-WindowTitle $Handle
  if (-not $title) {
    return $true
  }

  $isVisible = [NativeWindowCapture]::IsWindowVisible($Handle)
  if (-not $IncludeHidden -and -not $isVisible) {
    return $true
  }

  $isMatch = if ($ExactTitle) { $title -eq $WindowTitle } else { $title -like "*$WindowTitle*" }
  if ($isMatch) {
    $matches.Add([pscustomobject]@{
      Handle = $Handle
      Title = $title
      IsVisible = $isVisible
      IsMinimized = [NativeWindowCapture]::IsIconic($Handle)
    }) | Out-Null
  }

  return $true
}

[void][NativeWindowCapture]::EnumWindows($callback, [IntPtr]::Zero)

if ($matches.Count -eq 0 -and -not $IncludeHidden) {
  & $PSCommandPath -WindowTitle $WindowTitle -OutputPath $OutputPath -Width $Width -Height $Height -ExactTitle:$ExactTitle -NoMoveToPrimary:$NoMoveToPrimary -IncludeHidden
  exit $LASTEXITCODE
}

if ($matches.Count -eq 0) {
  throw "No window matching '$WindowTitle' was found."
}

$window = $matches |
  Sort-Object @{ Expression = { if ($_.Title -eq $WindowTitle) { 0 } else { 1 } } },
              @{ Expression = { if ($_.IsVisible) { 0 } else { 1 } } },
              @{ Expression = { if ($_.IsMinimized) { 1 } else { 0 } } } |
  Select-Object -First 1

$swRestore = 9
$swShowNormal = 1
if ($window.IsMinimized) {
  [void][NativeWindowCapture]::ShowWindowAsync($window.Handle, $swRestore)
} elseif (-not $window.IsVisible) {
  [void][NativeWindowCapture]::ShowWindowAsync($window.Handle, $swShowNormal)
}

[void][NativeWindowCapture]::SetForegroundWindow($window.Handle)
Start-Sleep -Milliseconds 300

if (-not $NoMoveToPrimary) {
  $workArea = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
  $targetWidth = [Math]::Max(360, $Width)
  $targetHeight = [Math]::Max(220, $Height)
  $targetWidth = [Math]::Min($targetWidth, $workArea.Width - 32)
  $targetHeight = [Math]::Min($targetHeight, $workArea.Height - 32)

  [void][NativeWindowCapture]::MoveWindow(
    $window.Handle,
    $workArea.Left + 16,
    $workArea.Top + 16,
    $targetWidth,
    $targetHeight,
    $true
  )
  Start-Sleep -Milliseconds 500
}

$bounds = Get-WindowRectangle $window.Handle
$capture = Capture-WithPrintWindow $window.Handle $bounds
$method = "PrintWindow"
$bitmap = $capture.Bitmap

if (-not $capture.Ok -or $capture.LooksBlank) {
  $bitmap.Dispose()
  $bitmap = Capture-WithScreenCopy $bounds
  $method = "CopyFromScreen"
}

$resolvedOutputPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutputPath)
Save-Bitmap $bitmap $resolvedOutputPath
$bitmap.Dispose()

[pscustomobject]@{
  OutputPath = $resolvedOutputPath
  Method = $method
  Title = $window.Title
  Hwnd = $window.Handle.ToInt64()
  Bounds = $bounds
  RestoredOrShown = ($window.IsMinimized -or -not $window.IsVisible)
  MovedToPrimary = (-not $NoMoveToPrimary)
} | ConvertTo-Json -Depth 4
