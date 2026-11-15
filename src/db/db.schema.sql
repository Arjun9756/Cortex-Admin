create table clients(
    id varchar(32) primary key,
    org_name varchar(255) not null,
    contact_name varchar(255) not null,
    email varchar(255) not null unique,
    phone varchar(20),
    status enum('active' , 'inactive' , 'suspended') default 'active',
    created_at timestamp default current_timestamp,
    updated_at timestamp default current_timestamp on update current_timestamp,

    index idx_email (email),
    index idx_status (status),
    index idx_clients_created (created_at),
    index idx_clients_status_created (status, created_at)
);

create table licenses(
    id varchar(32) primary key,
    client_id varchar(32) not null,
    license_key varchar(68) not null unique,
    status enum('active' , 'expired' , 'suspended' , 'revoked') default 'active',
    issued_at timestamp default current_timestamp,
    expiry_date datetime not null,
    last_validated_at datetime,
    max_pings_per_day int default 4,
    max_machines int default 1,

    foreign key (client_id) references clients(id) on delete cascade,
    index idx_license_key (license_key),
    index idx_status (status),
    index idx_client_id (client_id),
    index idx_licenses_status_expiry (status, expiry_date),
    index idx_licenses_expiry (expiry_date),
    index idx_licenses_issued (issued_at),
    index idx_licenses_client_status (client_id, status)
);

create table license_hwids(
    id varchar(32) primary key,
    license_id varchar(32) not null,
    hwid varchar(512) not null,
    label varchar(255),
    first_seen_at timestamp default current_timestamp,
    last_seen_at timestamp null default null,
    is_blocked tinyint(1) default 0,
    foreign key (license_id) references licenses(id) on delete cascade,
    unique key uniq_license_hwid (license_id, hwid),
    index idx_license_id (license_id),
    index idx_hwid (hwid(128)),
    index idx_hwids_license_blocked (license_id, is_blocked),
    index idx_hwids_last_seen (last_seen_at),
    index idx_hwids_first_seen (first_seen_at),
    index idx_hwids_blocked (is_blocked)
);

create table client_connectors(
    id varchar(32) primary key,
    client_id varchar(32) not null,
    license_key varchar(68) not null,
    provider enum('github', 'slack', 'jira') not null,
    status enum('connected', 'disconnected', 'needs_reauth') default 'connected',
    account_name varchar(255),
    account_email varchar(255),
    account_id varchar(255),
    scopes json,
    webhook_url varchar(500),
    connected_at timestamp default current_timestamp,
    updated_at timestamp default current_timestamp on update current_timestamp,
    foreign key (client_id) references clients(id) on delete cascade,
    unique key uniq_license_provider (license_key, provider),
    index idx_license (license_key),
    index idx_client_id (client_id),
    index idx_connectors_client_status (client_id, status)
);

create table usage_logs(
    id varchar(32) primary key,
    client_id varchar(32) null,
    license_id varchar(32) null,
    action_type enum('ping' , 'query' , 'export' , 'other') not null,
    query_count int default 0,
    status enum('success' , 'failed') default 'success',
    ip_address varchar(45),
    metadata JSON,
    created_at timestamp default current_timestamp,

    foreign key (client_id) references clients(id) on delete set null,
    foreign key (license_id) references licenses(id) on delete set null,
    index idx_client_created (client_id, created_at),
    index idx_action_type (action_type),
    index idx_created_at (created_at),
    index idx_status (status),
    index idx_usage_action_created (action_type, created_at),
    index idx_usage_action_status_created (action_type, status, created_at),
    index idx_usage_license_created (license_id, created_at),
    index idx_usage_ip_created (ip_address, created_at)
);

create table admin_users(
    id varchar(32) primary key,
    name varchar(255) not null,
    email varchar(255) not null unique,
    password_hash varchar(255) not null,
    role enum('super_admin' , 'admin' , 'viewer') default 'admin',
    created_at timestamp default current_timestamp,
    index idx_email (email)
);