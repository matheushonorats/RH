param([switch]$Zip)
$ErrorActionPreference = 'Stop'
$runtime = 'C:\Users\mathe\Desktop\Entidade.V1-Portatil'
$appFonte = Join-Path $PSScriptRoot 'app'
$versao = (Get-Content (Join-Path $appFonte 'package.json') -Raw | ConvertFrom-Json).version -replace '\.0$', ''
$pastaVersao = Join-Path $PSScriptRoot "build/$versao"
$destino = Join-Path $pastaVersao 'Entidade.V1-win32-x64'
if (!$Zip) {
  New-Item -ItemType Directory -Path $destino -Force | Out-Null
  Get-ChildItem -LiteralPath $runtime | Where-Object { $_.Name -notlike '.smoke*' -and $_.Name -notlike 'smoke-*' } | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination $destino -Recurse -Force
  }
  Copy-Item -LiteralPath $appFonte -Destination (Join-Path $destino 'resources') -Recurse -Force
  $notas = Join-Path $PSScriptRoot "LEIA-ME-$versao.md"
  if (!(Test-Path -LiteralPath $notas)) { throw "Notas de versão não encontradas: $notas" }
  Copy-Item -LiteralPath $notas -Destination (Join-Path $destino 'LEIA-ME.md') -Force
  Write-Output "Pacote preparado: $destino"
} else {
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  Add-Type -AssemblyName System.IO.Compression
  $arquivo = Join-Path $PSScriptRoot "release/Entidade.V1-$versao-portatil.zip"
  if (Test-Path -LiteralPath $arquivo) { throw 'O pacote de destino já existe. Preserve-o antes de empacotar novamente.' }
  # Perfis de teste são criados ao lado do executável; nunca entram na entrega.
  $arquivoZip = [IO.Compression.ZipFile]::Open($arquivo, [IO.Compression.ZipArchiveMode]::Create)
  try {
    Get-ChildItem -LiteralPath $destino -File -Recurse | Where-Object {
      $_.FullName -notmatch '[\\/]\.smoke[^\\/]*[\\/]|[\\/]smoke-[^\\/]+$'
    } | ForEach-Object {
      $relativo = $_.FullName.Substring($pastaVersao.Length + 1).Replace('\','/')
      [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($arquivoZip, $_.FullName, $relativo, [IO.Compression.CompressionLevel]::Optimal) | Out-Null
    }
  } finally { $arquivoZip.Dispose() }
  Write-Output "Pacote criado: $arquivo"
}
