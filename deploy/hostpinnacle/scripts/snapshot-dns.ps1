param(
  [Parameter(Mandatory = $true)][string]$ApiToken,
  [string]$ZoneName = 'sokoeats.co.ke',
  [string]$OutputDirectory = 'migration-work'
)
$ErrorActionPreference = 'Stop'
$headers = @{ Authorization = "Bearer $ApiToken"; 'Content-Type' = 'application/json' }
$zones = Invoke-RestMethod -Headers $headers -Uri "https://api.cloudflare.com/client/v4/zones?name=$ZoneName"
if (-not $zones.success -or $zones.result.Count -ne 1) { throw "Could not uniquely resolve zone $ZoneName" }
$zoneId = $zones.result[0].id
$records = Invoke-RestMethod -Headers $headers -Uri "https://api.cloudflare.com/client/v4/zones/$zoneId/dns_records?per_page=500"
if (-not $records.success) { throw 'Cloudflare DNS snapshot failed' }
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
$path = Join-Path $OutputDirectory ("dns-{0}.json" -f (Get-Date -Format 'yyyyMMddTHHmmssZ'))
$records.result | ConvertTo-Json -Depth 12 | Set-Content -Encoding utf8 -Path $path
Write-Output "Saved DNS snapshot to $path"
