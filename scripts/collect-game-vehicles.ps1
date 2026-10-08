# Read-only TF3 resource collector. Windows PowerShell 5.1 or PowerShell 7.
# No game files are executed or changed. Output is a new ZIP on the Desktop.
[CmdletBinding()]
param([string]$GamePath, [string]$OutputDirectory)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

if (-not $GamePath) {
    $steamRoots = @()
    foreach ($key in @('HKCU:\Software\Valve\Steam', 'HKLM:\SOFTWARE\WOW6432Node\Valve\Steam')) {
        $item = Get-ItemProperty -LiteralPath $key -ErrorAction SilentlyContinue
        if ($item.SteamPath) { $steamRoots += $item.SteamPath }
        if ($item.InstallPath) { $steamRoots += $item.InstallPath }
    }
    $libraries = @($steamRoots)
    foreach ($root in $steamRoots) {
        $vdf = Join-Path $root 'steamapps\libraryfolders.vdf'
        if (Test-Path -LiteralPath $vdf) {
            foreach ($match in [regex]::Matches([IO.File]::ReadAllText($vdf), '"path"\s+"([^"]+)"')) {
                $libraries += $match.Groups[1].Value.Replace('\\', '\')
            }
        }
    }
    $games = @($libraries | Select-Object -Unique | ForEach-Object {
        $common = Join-Path $_ 'steamapps\common'
        if (Test-Path -LiteralPath $common) {
            Get-ChildItem -LiteralPath $common -Directory | Where-Object { $_.Name -match '(?i)^Transport\s*Fever\s*3' }
        }
    })
    if ($games.Count -eq 1) { $GamePath = $games[0].FullName }
    else { $GamePath = Read-Host 'TF3 installation folder (Steam > Manage > Browse local files)' }
}
$GamePath = (Resolve-Path -LiteralPath $GamePath.Trim('"')).ProviderPath.TrimEnd('\', '/')
if (-not (Test-Path -LiteralPath $GamePath -PathType Container)) { throw 'GamePath must be a directory.' }
if (-not $OutputDirectory) { $OutputDirectory = [Environment]::GetFolderPath('Desktop') }
if (-not $OutputDirectory) { throw 'Specify -OutputDirectory.' }
$OutputDirectory = (Resolve-Path -LiteralPath $OutputDirectory).ProviderPath
$destination = Join-Path $OutputDirectory ('tf3-vehicle-sources-' + [guid]::NewGuid().ToString('N') + '.zip')
$records = [Collections.Generic.List[object]]::new()
$issues = [Collections.Generic.List[object]]::new()
$archives = [Collections.Generic.List[object]]::new()
$script:totalBytes = 0
$script:sequence = 0

function Test-VehicleResource([string]$Name) {
    $normalized = $Name.Replace('\', '/')
    # Include rail/tram models, fixed consists and economy resources; never textures/meshes.
    return ($normalized -match '(?i)(^|/)vehicle/.*\.mdl$' -or
        $normalized -match '(?i)\.mu\.lua$' -or
        $normalized -match '(?i)\.eco$' -or
        $normalized -match '(?i)(^|/)(model_metadata_util|difficulty_util)\.(lua|tl)$')
}

function Add-Resource($Zip, [IO.Stream]$InputStream, [long]$Length, [string]$Source, [string]$Resource) {
    if ($Length -gt 2MB -or ($script:totalBytes + $Length) -gt 32MB) {
        $issues.Add([ordered]@{ source = $Source; resource = $Resource; error = 'Size limit exceeded' })
        return
    }
    $script:sequence++
    $entryName = 'resources/{0:D6}-{1}' -f $script:sequence, ([IO.Path]::GetFileName($Resource.Replace('\', '/')))
    $entry = $Zip.CreateEntry($entryName)
    $output = $entry.Open()
    try { $InputStream.CopyTo($output) } finally { $output.Dispose() }
    $script:totalBytes += $Length
    $records.Add([ordered]@{ source = $Source; resource = $Resource; collectedAs = $entryName; bytes = $Length })
}

Write-Host "Reading TF3 resources from: $GamePath"
$fileStream = [IO.File]::Open($destination, [IO.FileMode]::CreateNew)
$zip = [IO.Compression.ZipArchive]::new($fileStream, [IO.Compression.ZipArchiveMode]::Create, $false)
try {
    $files = Get-ChildItem -LiteralPath $GamePath -Recurse -File
    foreach ($file in $files) {
        $relative = $file.FullName.Substring($GamePath.Length).TrimStart('\', '/').Replace('\', '/')
        if (Test-VehicleResource $relative) {
            $resourceStream = [IO.File]::OpenRead($file.FullName)
            try { Add-Resource $zip $resourceStream $file.Length 'loose' $relative } finally { $resourceStream.Dispose() }
        }
        elseif ($file.Extension -match '(?i)^\.(zip|pak)$') {
            # Some installations may use ZIP-compatible packs. Unsupported formats are reported.
            $pack = $null
            try {
                $pack = [IO.Compression.ZipFile]::OpenRead($file.FullName)
                $matches = @($pack.Entries | Where-Object { Test-VehicleResource $_.FullName })
                $archives.Add([ordered]@{ source = $relative; matchingResources = $matches.Count })
                foreach ($entry in $matches) {
                    $resourceStream = $entry.Open()
                    try { Add-Resource $zip $resourceStream $entry.Length $relative $entry.FullName } finally { $resourceStream.Dispose() }
                }
            }
            catch { $issues.Add([ordered]@{ source = $relative; error = 'Archive unreadable or unsupported; extraction incomplete' }) }
            finally { if ($pack) { $pack.Dispose() } }
        }
    }
    $manifest = [ordered]@{
        schemaVersion = 1
        collectedAtUtc = [DateTime]::UtcNow.ToString('o')
        status = 'Source collection only; values not evaluated or verified against the game'
        resources = @($records.ToArray())
        archives = @($archives.ToArray())
        issues = @($issues.ToArray())
    }
    $entry = $zip.CreateEntry('manifest.json')
    $writer = [IO.StreamWriter]::new($entry.Open(), [Text.UTF8Encoding]::new($false))
    try { $writer.Write(($manifest | ConvertTo-Json -Depth 8)) } finally { $writer.Dispose() }
}
finally { $zip.Dispose(); $fileStream.Dispose() }
Write-Host ('Collected {0} resources; {1} issues.' -f $records.Count, $issues.Count)
Write-Host "Result: $destination"
if ($records.Count -eq 0) { Write-Warning 'No readable resources found. Send the ZIP manifest to investigate the packaging.' }
