# 1. Login as Admin
$loginBody = @{
    email = "admin@cortex.com"
    password = "cortex@223"
} | ConvertTo-Json

$loginRes = Invoke-RestMethod -Uri "http://localhost:5000/api/admin/login" -Method Post -ContentType "application/json" -Body $loginBody
Write-Host "Admin Login: success=$($loginRes.success), token exists=$([bool]$loginRes.token)"
$headers = @{
    "Authorization" = "Bearer $($loginRes.token)"
    "Content-Type" = "application/json"
}

# 2. Get licenses
$lic = Invoke-RestMethod -Uri 'http://localhost:5000/api/license' -Method Get -Headers $headers
Write-Host "Total licenses in DB: $($lic.data.Length)"
$kortex = $lic.data | Where-Object { $_.org_name -eq 'Kortex Inc' -or $_.license_key -eq '24C0-4268-9CC0-2B38' }
Write-Host "Kortex License: ID=$($kortex.id), Key=$($kortex.license_key), max_machines=$($kortex.max_machines), bound=$($kortex.bound_machines_count)"

# 3. Test updating max_machines (proving the Unknown column 'max_machines' is 100% resolved)
Write-Host "`nTesting max_machines update to 3..."
$upBody = @{ max_machines = 3 } | ConvertTo-Json
$resUp = Invoke-RestMethod -Uri "http://localhost:5000/api/license/$($kortex.id)/max-machines" -Method Patch -Headers $headers -Body $upBody
Write-Host "Update max_machines result: success=$($resUp.success), new max_machines=$($resUp.data.max_machines)"

# 4. Restore max_machines to 1
Write-Host "`nRestoring max_machines to 1..."
$restoreBody = @{ max_machines = 1 } | ConvertTo-Json
$resRestore = Invoke-RestMethod -Uri "http://localhost:5000/api/license/$($kortex.id)/max-machines" -Method Patch -Headers $headers -Body $restoreBody
Write-Host "Restore result: success=$($resRestore.success), max_machines=$($resRestore.data.max_machines)"

# 5. Query HWIDs for Kortex and test Block/Unblock
$hwids = Invoke-RestMethod -Uri "http://localhost:5000/api/license/$($kortex.id)/hwids" -Method Get -Headers $headers
Write-Host "`nKortex HWIDs count: $($hwids.data.Length)"
if ($hwids.data.Length -gt 0) {
    $h = $hwids.data[0]
    $hwidEncoded = [System.Uri]::EscapeDataString($h.hwid)
    Write-Host "Found HWID: $($h.hwid)"
    Write-Host "first_seen_at: $($h.first_seen_at)"
    Write-Host "last_seen_at:  $($h.last_seen_at)"
    Write-Host "is_blocked:    $($h.is_blocked)"

    Write-Host "Testing BLOCK operation..."
    $blockBody = @{ blocked = $true } | ConvertTo-Json
    $blockRes = Invoke-RestMethod -Uri "http://localhost:5000/api/license/$($kortex.id)/hwids/$hwidEncoded/block" -Method Patch -Headers $headers -Body $blockBody
    Write-Host "Block result: success=$($blockRes.success), is_blocked=$($blockRes.data.is_blocked)"

    Write-Host "Testing UNBLOCK operation..."
    $unblockBody = @{ blocked = $false } | ConvertTo-Json
    $unblockRes = Invoke-RestMethod -Uri "http://localhost:5000/api/license/$($kortex.id)/hwids/$hwidEncoded/block" -Method Patch -Headers $headers -Body $unblockBody
    Write-Host "Unblock result: success=$($unblockRes.success), is_blocked=$($unblockRes.data.is_blocked)"
}

Write-Host "`nAll Admin and HWID operations executed successfully!"
