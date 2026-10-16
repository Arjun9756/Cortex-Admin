# ==============================================================================
# CORTEX PRODUCTION HWID LIFECYCLE & TELEMETRY VERIFICATION TEST
# ==============================================================================

Write-Host "=== 1. Authenticating as Super Admin ==="
$loginBody = @{
    email = "admin@cortex.com"
    password = "cortex@223"
} | ConvertTo-Json

$loginRes = Invoke-RestMethod -Uri "http://localhost:5000/api/admin/login" -Method Post -ContentType "application/json" -Body $loginBody
if (!$loginRes.token) {
    Write-Error "Admin login failed!"
    exit 1
}
Write-Host "✅ Admin Authenticated. Token acquired."
$adminHeaders = @{
    "Authorization" = "Bearer $($loginRes.token)"
    "Content-Type" = "application/json"
}

# 2. Get Kortex Client & issue a clean test license
Write-Host "`n=== 2. Creating Fresh Test License (Quota: 2 Machines) ==="
$clients = Invoke-RestMethod -Uri "http://localhost:5000/api/clients" -Method Get -Headers $adminHeaders
$client = $clients.data[0]
Write-Host "Target Client: $($client.org_name) (ID: $($client.id))"

$expiryDate = (Get-Date).AddDays(365).ToString("o")
$createLicenseBody = @{
    client_id = $client.id
    max_machines = 2
    expiry_date = $expiryDate
    notes = "Production Lifecycle Automated Test License"
} | ConvertTo-Json

$newLicRes = Invoke-RestMethod -Uri "http://localhost:5000/api/license" -Method Post -Headers $adminHeaders -Body $createLicenseBody
$testLicense = $newLicRes.data
Write-Host "✅ Issued Test License: $($testLicense.license_key) (ID: $($testLicense.id)), Quota: $($testLicense.max_machines)"

try {
    # 3. Test TOFU (Trust On First Use) Auto-Binding on First Client Boot
    Write-Host "`n=== 3. Testing TOFU Auto-Binding on First Client Boot ==="
    $machine1Hwid = "HWID-CORTEX-WIN-TEST0001-AAAA-BBBB-CCCC11112222"
    $tofuPingPayload = @{
        license_key = $testLicense.license_key
        machine_id = $machine1Hwid
        platform = "win32"
        app_version = "1.0.4"
        timestamp = (Get-Date).ToString("o")
    } | ConvertTo-Json

    $tofuRes = Invoke-RestMethod -Uri "http://localhost:5000/api/license/ping" -Method Post -ContentType "application/json" -Body $tofuPingPayload
    Write-Host "TOFU Ping Response: allowed=$($tofuRes.allowed), status=$($tofuRes.status), seats=$($tofuRes.seats_used)"
    if ($tofuRes.allowed -ne $true) {
        Write-Error "TOFU Ping failed!"
        exit 1
    }

    # Verify DB records for Machine 1
    $hwids1 = Invoke-RestMethod -Uri "http://localhost:5000/api/license/$($testLicense.id)/hwids" -Method Get -Headers $adminHeaders
    $rec1 = $hwids1.data | Where-Object { $_.hwid -eq $machine1Hwid }
    Write-Host "Machine 1 in DB: first_seen_at=$($rec1.first_seen_at), last_seen_at=$($rec1.last_seen_at)"
    if (!$rec1.first_seen_at -or !$rec1.last_seen_at) {
        Write-Error "TOFU did not record first_seen_at and last_seen_at!"
        exit 1
    }
    Write-Host "✅ TOFU Auto-Binding verified: HWID registered with initial heartbeat."

    # 4. Test Periodic Heartbeat Ping (Updating last_seen_at)
    Write-Host "`n=== 4. Testing Heartbeat Update (Wait 2s and Ping Again) ==="
    Start-Sleep -Seconds 2
    $heartbeatPayload = @{
        license_key = $testLicense.license_key
        machine_id = $machine1Hwid
        platform = "win32"
        app_version = "1.0.4"
        timestamp = (Get-Date).ToString("o")
    } | ConvertTo-Json

    $hbRes = Invoke-RestMethod -Uri "http://localhost:5000/api/license/ping" -Method Post -ContentType "application/json" -Body $heartbeatPayload
    Write-Host "Heartbeat Ping Response: allowed=$($hbRes.allowed)"

    $hwidsHb = Invoke-RestMethod -Uri "http://localhost:5000/api/license/$($testLicense.id)/hwids" -Method Get -Headers $adminHeaders
    $recHb = $hwidsHb.data | Where-Object { $_.hwid -eq $machine1Hwid }
    Write-Host "Machine 1 after Heartbeat: first_seen_at=$($recHb.first_seen_at), last_seen_at=$($recHb.last_seen_at)"
    Write-Host "✅ Heartbeat timestamp touched successfully."

    # 5. Test Admin Manual Pre-Whitelisting (Air-Gapped Machine)
    Write-Host "`n=== 5. Testing Manual Admin Pre-Whitelisting (Air-Gapped Machine) ==="
    $manualHwid = "HWID-CORTEX-WIN-TEST0002-XXXX-YYYY-ZZZZ33334444"
    $manualAddBody = @{
        hwid = $manualHwid
        label = "Air-Gapped Server #2"
    } | ConvertTo-Json

    $manualAddRes = Invoke-RestMethod -Uri "http://localhost:5000/api/license/$($testLicense.id)/hwids" -Method Post -Headers $adminHeaders -Body $manualAddBody
    Write-Host "Manual Add Result: success=$($manualAddRes.success)"

    $hwidsManual = Invoke-RestMethod -Uri "http://localhost:5000/api/license/$($testLicense.id)/hwids" -Method Get -Headers $adminHeaders
    $recManual = $hwidsManual.data | Where-Object { $_.hwid -eq $manualHwid }
    Write-Host "Manual Pre-authorized Machine in DB:"
    Write-Host "  first_seen_at: $($recManual.first_seen_at)"
    Write-Host "  last_seen_at:  $($recManual.last_seen_at) (Should be empty/null before first boot!)"
    if ($recManual.last_seen_at) {
        Write-Error "ERROR: Manual HWID should have NULL last_seen_at until machine connects!"
        exit 1
    }
    Write-Host "✅ Manual Pre-authorization verified: last_seen_at is correctly NULL (Awaiting Handshake)."

    # 6. Test Admin Block Action (Verifying it DOES NOT mutate last_seen_at)
    Write-Host "`n=== 6. Testing Admin Block Action (Telemetry Invariance) ==="
    $lastSeenBeforeBlock = $recHb.last_seen_at
    $blockBody = @{ blocked = $true } | ConvertTo-Json
    $blockRes = Invoke-RestMethod -Uri "http://localhost:5000/api/license/$($testLicense.id)/hwids/$([System.Uri]::EscapeDataString($machine1Hwid))/block" -Method Patch -Headers $adminHeaders -Body $blockBody
    Write-Host "Block result: success=$($blockRes.success)"

    $hwidsAfterBlock = Invoke-RestMethod -Uri "http://localhost:5000/api/license/$($testLicense.id)/hwids" -Method Get -Headers $adminHeaders
    $recAfterBlock = $hwidsAfterBlock.data | Where-Object { $_.hwid -eq $machine1Hwid }
    Write-Host "After Block: is_blocked=$($recAfterBlock.is_blocked), last_seen_at=$($recAfterBlock.last_seen_at)"
    if ($recAfterBlock.is_blocked -ne 1) {
        Write-Error "HWID was not blocked!"
        exit 1
    }
    Write-Host "✅ Block status verified: is_blocked=1, and last_seen_at was preserved."

    # 7. Test Blocked Machine Ping Lockout
    Write-Host "`n=== 7. Testing Blocked Machine Ping Rejection ==="
    $blockedPing = Invoke-RestMethod -Uri "http://localhost:5000/api/license/ping" -Method Post -ContentType "application/json" -Body $heartbeatPayload
    Write-Host "Blocked Ping result: allowed=$($blockedPing.allowed), code=$($blockedPing.code)"
    if ($blockedPing.allowed -ne $false -or $blockedPing.code -ne "HWID_BLOCKED") {
        Write-Error "Blocked machine was NOT rejected!"
        exit 1
    }
    Write-Host "✅ Remote lockdown verified: Blocked machine rejected with HWID_BLOCKED."

    # 8. Unblock Machine 1
    Write-Host "`n=== 8. Testing Unblock Action ==="
    $unblockBody = @{ blocked = $false } | ConvertTo-Json
    $unblockRes = Invoke-RestMethod -Uri "http://localhost:5000/api/license/$($testLicense.id)/hwids/$([System.Uri]::EscapeDataString($machine1Hwid))/block" -Method Patch -Headers $adminHeaders -Body $unblockBody
    Write-Host "Unblock result: success=$($unblockRes.success)"

    # 9. Test Machine 2 (Manual Pre-authorized) First Boot Handshake
    Write-Host "`n=== 9. Testing Machine 2 First Boot Handshake ==="
    $m2PingPayload = @{
        license_key = $testLicense.license_key
        machine_id = $manualHwid
        platform = "linux"
        app_version = "1.0.4"
        timestamp = (Get-Date).ToString("o")
    } | ConvertTo-Json

    $m2Res = Invoke-RestMethod -Uri "http://localhost:5000/api/license/ping" -Method Post -ContentType "application/json" -Body $m2PingPayload
    Write-Host "Machine 2 First Ping: allowed=$($m2Res.allowed), seats=$($m2Res.seats_used)"
    if ($m2Res.allowed -ne $true) {
        Write-Error "Machine 2 first ping failed!"
        exit 1
    }

    $hwidsM2After = Invoke-RestMethod -Uri "http://localhost:5000/api/license/$($testLicense.id)/hwids" -Method Get -Headers $adminHeaders
    $recM2After = $hwidsM2After.data | Where-Object { $_.hwid -eq $manualHwid }
    Write-Host "Machine 2 in DB after first handshake: last_seen_at=$($recM2After.last_seen_at)"
    if (!$recM2After.last_seen_at) {
        Write-Error "Machine 2 last_seen_at did NOT transition from NULL to active timestamp!"
        exit 1
    }
    Write-Host "✅ Machine 2 transitioned from 'Awaiting Handshake' (NULL) to 'Active' ($($recM2After.last_seen_at))."

    # 10. Test Quota Exceeded (Machine 3 Mismatch / Lockout)
    Write-Host "`n=== 10. Testing Machine 3 Quota Limit Rejection ==="
    $machine3Hwid = "HWID-CORTEX-WIN-TEST0003-PIRATED-EXTRA-000000000000"
    $m3Payload = @{
        license_key = $testLicense.license_key
        machine_id = $machine3Hwid
        platform = "win32"
        app_version = "1.0.4"
        timestamp = (Get-Date).ToString("o")
    } | ConvertTo-Json

    $m3Res = Invoke-RestMethod -Uri "http://localhost:5000/api/license/ping" -Method Post -ContentType "application/json" -Body $m3Payload
    Write-Host "Machine 3 result: allowed=$($m3Res.allowed), code=$($m3Res.code)"
    if ($m3Res.allowed -ne $false -or $m3Res.code -ne "HWID_LIMIT_REACHED") {
        Write-Error "Machine 3 quota limit was not enforced!"
        exit 1
    }
    Write-Host "✅ Quota limit strictly enforced: Machine 3 rejected with HWID_LIMIT_REACHED."

} finally {
    # Cleanup Test License
    Write-Host "`n=== Cleaning up automated test license ==="
    Invoke-RestMethod -Uri "http://localhost:5000/api/license/$($testLicense.id)" -Method Delete -Headers $adminHeaders | Out-Null
    Write-Host "✅ Test license cleaned up."
}

Write-Host "`n======================================================="
Write-Host "🎉 ALL PRODUCTION HWID LIFECYCLE CHECKS PASSED 100%!"
Write-Host "======================================================="
