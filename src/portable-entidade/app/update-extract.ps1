param([Parameter(Mandatory=$true)][string]$Archive, [Parameter(Mandatory=$true)][string]$Destination)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$taskZip = [IO.Compression.ZipFile]::OpenRead($Archive)
try {
  $taskNames = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
  [long]$taskTotal = 0
  if ($taskZip.Entries.Count -gt 6000) { throw 'Pacote muito grande.' }
  foreach ($taskEntry in $taskZip.Entries) {
    $taskName = $taskEntry.FullName
    if (-not $taskName.StartsWith('Entidade.V1-win32-x64/', [StringComparison]::Ordinal) -or $taskName.Contains('\') -or $taskName -match '(^|/)\.\.?(/|$)|[<>:"|?*\x00-\x1f]') { throw 'Caminho inválido no pacote.' }
    if (-not $taskNames.Add($taskName)) { throw 'Arquivo repetido no pacote.' }
    if ((($taskEntry.ExternalAttributes -shr 16) -band 61440) -eq 40960) { throw 'Links não são permitidos.' }
    $taskTotal += $taskEntry.Length
    if ($taskTotal -gt 2147483648) { throw 'Limite de extração excedido.' }
  }
} finally { $taskZip.Dispose() }
if (Test-Path -LiteralPath $Destination) { throw 'A pasta de preparo já existe.' }
[IO.Compression.ZipFile]::ExtractToDirectory($Archive, $Destination)
