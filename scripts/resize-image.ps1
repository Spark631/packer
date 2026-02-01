param(
  [Parameter(Mandatory = $true)]
  [string] $In,

  [Parameter(Mandatory = $true)]
  [string] $Out,

  [int] $Width = 900,

  [ValidateRange(1, 100)]
  [int] $Quality = 88
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

$img = [System.Drawing.Image]::FromFile($In)
try {
  $newW = $Width
  $newH = [int]([math]::Round($img.Height * $newW / $img.Width))

  $bmp = New-Object System.Drawing.Bitmap $newW, $newH
  try {
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    try {
      $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
      $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
      $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
      $g.DrawImage($img, 0, 0, $newW, $newH)
    } finally {
      $g.Dispose()
    }

    $jpgEncoder = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() |
      Where-Object { $_.MimeType -eq "image/jpeg" } |
      Select-Object -First 1
    if (-not $jpgEncoder) {
      throw "JPEG encoder not found."
    }

    $encParams = New-Object System.Drawing.Imaging.EncoderParameters 1
    $encParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]$Quality)

    $bmp.Save($Out, $jpgEncoder, $encParams)
  } finally {
    $bmp.Dispose()
  }
} finally {
  $img.Dispose()
}

Get-Item -LiteralPath $Out | Select-Object Name, Length, FullName
