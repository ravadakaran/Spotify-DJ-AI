param(
  [ValidateSet('Status', 'Start', 'Stop', 'AllowClient')]
  [string]$Action = 'Status',
  [string]$ClientIPv4
)
$ErrorActionPreference = 'Stop'
$demoProject = 'ai-dj-studio-ravadakaran-4cf97'
$demoZone = 'us-central1-a'
$demoInstance = 'ai-dj-demo'
$demoGcloud = Join-Path $env:LOCALAPPDATA 'ai-dj-tools/gcloud-584.0.0/google-cloud-sdk/bin/gcloud.cmd'
if (!(Test-Path -LiteralPath $demoGcloud)) { throw 'The prepared Google Cloud CLI was not found.' }
$demoPreviousConfig = $env:CLOUDSDK_CONFIG
$env:CLOUDSDK_CONFIG = Join-Path $env:LOCALAPPDATA 'ai-dj-tools/gcloud-config'
$demoEdgePath = Join-Path $env:LOCALAPPDATA 'ai-dj-tools/vercel-edge.json'
try {
  $demoVM = ((& $demoGcloud compute instances describe $demoInstance --zone=$demoZone --project=$demoProject --format=json) | ConvertFrom-Json)
  if ($LASTEXITCODE -ne 0 -or $demoVM.name -ne $demoInstance) { throw 'Could not verify the intended demo VM.' }
  if ($Action -eq 'Start') {
    if ($demoVM.scheduling.maxRunDuration.seconds -ne '5400' -or $demoVM.scheduling.instanceTerminationAction -ne 'STOP') {
      throw 'Refusing to start: the 90-minute cloud stop safeguard is missing.'
    }
    if ($demoVM.status -eq 'TERMINATED') {
      & $demoGcloud compute instances start $demoInstance --zone=$demoZone --project=$demoProject --quiet
      if ($LASTEXITCODE -ne 0) { throw 'VM start failed.' }
    }
  } elseif ($Action -eq 'Stop') {
    if ($demoVM.status -eq 'RUNNING') {
      & $demoGcloud compute instances stop $demoInstance --zone=$demoZone --project=$demoProject --quiet
      if ($LASTEXITCODE -ne 0) { throw 'VM stop failed.' }
    }
  } elseif ($Action -eq 'AllowClient') {
    $demoAddress = [Net.IPAddress]::Parse($ClientIPv4)
    if ($demoAddress.AddressFamily -ne [Net.Sockets.AddressFamily]::InterNetwork) { throw 'Provide one IPv4 address, without a CIDR suffix.' }
    if (Test-Path -LiteralPath $demoEdgePath) {
      if ($demoVM.status -ne 'RUNNING') { throw 'Start the VM before updating its Vercel operator allowlist.' }
      $demoEdge = Get-Content -Raw -LiteralPath $demoEdgePath | ConvertFrom-Json
      $demoEdge.clientIPv4 = $demoAddress.ToString()
      $demoEdge | ConvertTo-Json | Set-Content -LiteralPath $demoEdgePath
      & $demoGcloud compute scp $demoEdgePath "${demoInstance}:/tmp/vercel-edge.json" --zone=$demoZone --project=$demoProject --tunnel-through-iap --quiet
      if ($LASTEXITCODE -ne 0) { throw 'Private allowlist upload failed.' }
      & $demoGcloud compute ssh $demoInstance --zone=$demoZone --project=$demoProject --tunnel-through-iap --quiet --command='sudo install -m 0600 /tmp/vercel-edge.json /etc/ai-dj/vercel-edge.json && sudo rm /tmp/vercel-edge.json && sudo python3 /etc/ai-dj/origin.py && sudo systemctl restart caddy'
      if ($LASTEXITCODE -ne 0) { throw 'Vercel operator allowlist activation failed.' }
    } else {
      & $demoGcloud compute firewall-rules update ai-dj-demo-private-https --source-ranges="$demoAddress/32" --project=$demoProject --quiet
      if ($LASTEXITCODE -ne 0) { throw 'Client allowlist update failed.' }
    }
  }
  $demoVM = ((& $demoGcloud compute instances describe $demoInstance --zone=$demoZone --project=$demoProject --format=json) | ConvertFrom-Json)
  if ($LASTEXITCODE -ne 0) { throw 'Final VM status could not be verified.' }
  Write-Output "Demo VM: $($demoVM.status)"
  if ($demoVM.status -eq 'RUNNING') {
    if (Test-Path -LiteralPath $demoEdgePath) {
      $demoEdge = Get-Content -Raw -LiteralPath $demoEdgePath | ConvertFrom-Json
      Write-Output "Demo URL: $($demoEdge.appOrigin)"
      Write-Output "Backend origin: https://$($demoVM.networkInterfaces[0].accessConfigs[0].natIP) (direct requests denied)"
      Write-Output 'After an IP change, update and promote the Vercel project backend route before using the app. See docs/CLOUD_DEMO_OPERATIONS.md.'
    } else {
      Write-Output "Demo URL: https://$($demoVM.networkInterfaces[0].accessConfigs[0].natIP)"
    }
    Write-Output 'HTTPS may take a few minutes to initialize. Access is limited to the allowed client IP.'
  }
} finally {
  $env:CLOUDSDK_CONFIG = $demoPreviousConfig
}
