-- ==============================================================================
-- TiDB Cloud Data Migration Script: Clients, Licenses & Devices
-- Target Database: cortex_admin
-- Run this in TiDB Cloud Console (SQL Editor) or any MySQL client (DBeaver / Workbench)
-- ==============================================================================

USE `cortex_admin`;

-- ------------------------------------------------------------------------------
-- STEP 1: Insert Clients (Organization + Contact Details)
-- Note: Replace sample IDs, Org Names, Contact Names, and Emails with your real clients.
-- ------------------------------------------------------------------------------

INSERT INTO `clients` (
    `id`, 
    `org_name`, 
    `contact_name`, 
    `email`, 
    `phone`, 
    `status`, 
    `created_at`
)
VALUES 
    (
        '475583605354516501', 
        'Acme Corporation', 
        'John Doe', 
        'john@acme.com', 
        '+1-555-0101', 
        'active', 
        NOW()
    ),
    (
        '475583605354516502', 
        'Stark Industries', 
        'Tony Stark', 
        'tony@stark.com', 
        '+1-555-0102', 
        'active', 
        NOW()
    ),
    (
        '475583605354516503', 
        'Wayne Enterprises', 
        'Bruce Wayne', 
        'bruce@wayne.com', 
        '+1-555-0103', 
        'active', 
        NOW()
    )
ON DUPLICATE KEY UPDATE
    `org_name` = VALUES(`org_name`),
    `contact_name` = VALUES(`contact_name`),
    `phone` = VALUES(`phone`),
    `status` = VALUES(`status`),
    `updated_at` = NOW();


-- ------------------------------------------------------------------------------
-- STEP 2: Insert Licenses Linked to Clients
-- client_id must match the client id from Step 1.
-- ------------------------------------------------------------------------------

INSERT INTO `licenses` (
    `id`, 
    `client_id`, 
    `license_key`, 
    `status`, 
    `expiry_date`, 
    `max_machines`, 
    `max_pings_per_day`, 
    `issued_at`
)
VALUES 
    (
        '475583605354516601', 
        '475583605354516501', 
        'CTX-ACME-8941-4523-9981', 
        'active', 
        DATE_ADD(NOW(), INTERVAL 264 DAY), 
        3, 
        4, 
        NOW()
    ),
    (
        '475583605354516602', 
        '475583605354516502', 
        'CTX-STRK-7712-3490-1120', 
        'active', 
        DATE_ADD(NOW(), INTERVAL 365 DAY), 
        5, 
        4, 
        NOW()
    ),
    (
        '475583605354516603', 
        '475583605354516503', 
        'CTX-WAYN-1209-6643-8831', 
        'active', 
        DATE_ADD(NOW(), INTERVAL 264 DAY), 
        2, 
        4, 
        NOW()
    )
ON DUPLICATE KEY UPDATE
    `status` = VALUES(`status`),
    `expiry_date` = VALUES(`expiry_date`),
    `max_machines` = VALUES(`max_machines`),
    `max_pings_per_day` = VALUES(`max_pings_per_day`);


-- ------------------------------------------------------------------------------
-- STEP 3 (Optional): Insert Pre-bound Hardware Devices (HWIDs)
-- If the clients already have machines bound, add them here.
-- license_id must match the license id from Step 2.
-- ------------------------------------------------------------------------------

-- INSERT INTO `license_hwids` (`id`, `license_id`, `hwid`, `label`, `first_seen_at`, `is_blocked`)
-- VALUES 
--     ('475583605354516701', '475583605354516601', 'HWID-WIN-8384910482', 'John Laptop (Windows 11)', NOW(), 0),
--     ('475583605354516702', '475583605354516602', 'HWID-MAC-1928374650', 'Dev Workstation (macOS)', NOW(), 0)
-- ON DUPLICATE KEY UPDATE
--     `label` = VALUES(`label`),
--     `is_blocked` = VALUES(`is_blocked`);


-- ------------------------------------------------------------------------------
-- STEP 4: Verification Queries
-- Run these to verify that all data migrated successfully into TiDB.
-- ------------------------------------------------------------------------------

SELECT 
    c.id AS client_id,
    c.org_name,
    c.contact_name,
    c.email,
    c.status AS client_status,
    l.id AS license_id,
    l.license_key,
    l.status AS license_status,
    l.max_machines,
    l.expiry_date
FROM `clients` c
LEFT JOIN `licenses` l ON l.client_id = c.id
ORDER BY c.created_at DESC;
