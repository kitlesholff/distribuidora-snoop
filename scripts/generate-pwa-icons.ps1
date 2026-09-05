# Exportação mecânica da logo existente nos tamanhos exigidos pelos dispositivos.
# Não altera a imagem original nem depende de ferramentas de design.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$pwaProject = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$pwaSource = Join-Path $pwaProject 'assets\logo-snoop-header.png'
$pwaOutput = Join-Path $pwaProject 'assets\pwa'
New-Item -ItemType Directory -Path $pwaOutput -Force | Out-Null
$pwaLogo = [Drawing.Image]::FromFile($pwaSource)
try {
  $pwaExports = @(
    @{ Name = 'icon-192.png'; Size = 192; Padding = 0 },
    @{ Name = 'icon-512.png'; Size = 512; Padding = 0 },
    @{ Name = 'apple-touch-icon.png'; Size = 180; Padding = 0 },
    @{ Name = 'icon-maskable-512.png'; Size = 512; Padding = 0.15 }
  )
  foreach ($pwaExport in $pwaExports) {
    $pwaSize = [int]$pwaExport.Size
    $pwaBitmap = New-Object Drawing.Bitmap($pwaSize, $pwaSize)
    $pwaGraphics = [Drawing.Graphics]::FromImage($pwaBitmap)
    try {
      $pwaGraphics.Clear([Drawing.Color]::FromArgb(11, 11, 11))
      $pwaGraphics.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $pwaGraphics.PixelOffsetMode = [Drawing.Drawing2D.PixelOffsetMode]::HighQuality
      $pwaOffset = [int][Math]::Round($pwaSize * $pwaExport.Padding)
      $pwaSide = $pwaSize - 2 * $pwaOffset
      $pwaDestination = New-Object Drawing.Rectangle($pwaOffset, $pwaOffset, $pwaSide, $pwaSide)
      $pwaGraphics.DrawImage($pwaLogo, $pwaDestination)
      $pwaBitmap.Save((Join-Path $pwaOutput $pwaExport.Name), [Drawing.Imaging.ImageFormat]::Png)
      Write-Output "$($pwaExport.Name): ${pwaSize}x${pwaSize}"
    } finally {
      $pwaGraphics.Dispose()
      $pwaBitmap.Dispose()
    }
  }
} finally {
  $pwaLogo.Dispose()
}
