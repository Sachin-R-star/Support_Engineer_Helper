-- Enterprise IT Support Triage Database Schema (SQLite compatible)

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'END_USER',
    department TEXT NOT NULL,
    is_vip INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS devices (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    device_type TEXT NOT NULL,
    os TEXT NOT NULL,
    serial_number TEXT UNIQUE NOT NULL,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS incidents (
    id TEXT PRIMARY KEY,
    ticket_number TEXT UNIQUE NOT NULL,
    user_id TEXT NOT NULL,
    device_id TEXT,
    category TEXT NOT NULL,
    issue_type TEXT NOT NULL,
    priority TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'OPEN', -- OPEN | IN_PROGRESS | RESOLVED | REOPENED | ESCALATED
    summary TEXT NOT NULL,
    description TEXT NOT NULL,
    resolution TEXT,
    escalation_tier TEXT DEFAULT 'NONE',
    missing_info TEXT NOT NULL DEFAULT '[]',
    recommended_next_step TEXT NOT NULL,
    reasoning TEXT NOT NULL,
    confidence_score INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved_at TEXT,
    reopened_at TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (device_id) REFERENCES devices(id)
);

CREATE TABLE IF NOT EXISTS incident_answers (
    id TEXT PRIMARY KEY,
    incident_id TEXT NOT NULL,
    question_id TEXT NOT NULL,
    question_text TEXT NOT NULL,
    answer_value TEXT NOT NULL,
    is_unsure INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS incident_actions (
    id TEXT PRIMARY KEY,
    incident_id TEXT NOT NULL,
    action_type TEXT NOT NULL,
    description TEXT NOT NULL,
    result_status TEXT DEFAULT 'PENDING', -- PENDING | SUCCESS | FAILURE | PARTIAL
    result_details TEXT,
    performer TEXT NOT NULL DEFAULT 'SYSTEM',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS incident_evidence (
    id TEXT PRIMARY KEY,
    incident_id TEXT NOT NULL,
    fact_key TEXT NOT NULL,
    fact_value TEXT NOT NULL,
    source_question_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS incident_events (
    id TEXT PRIMARY KEY,
    incident_id TEXT NOT NULL,
    event_type TEXT NOT NULL, -- CREATED | ANSWER_ADDED | ACTION_ADDED | RESULT_RECORDED | STATUS_CHANGED | RESOLVED | REOPENED | ESCALATED
    description TEXT NOT NULL,
    metadata_json TEXT DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS incident_relationships (
    id TEXT PRIMARY KEY,
    source_incident_id TEXT NOT NULL,
    target_incident_id TEXT NOT NULL,
    relationship_type TEXT NOT NULL,
    similarity_score REAL NOT NULL DEFAULT 0.0,
    status TEXT NOT NULL DEFAULT 'CONFIRMED', -- PROPOSED | CONFIRMED | REJECTED
    source_action_id TEXT,
    explanation TEXT NOT NULL DEFAULT '',
    confirmed_by TEXT,
    confirmed_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (source_incident_id) REFERENCES incidents(id) ON DELETE CASCADE,
    FOREIGN KEY (target_incident_id) REFERENCES incidents(id) ON DELETE CASCADE,
    UNIQUE(source_incident_id, target_incident_id)
);

CREATE TABLE IF NOT EXISTS rca_human_decisions (
    id TEXT PRIMARY KEY,
    incident_id TEXT NOT NULL,
    candidate_id TEXT NOT NULL,
    decision TEXT NOT NULL, -- CONFIRMED | REJECTED | UNCERTAIN | NONE
    actor_id TEXT NOT NULL DEFAULT 'USER',
    notes TEXT,
    ai_confidence_at_decision INTEGER NOT NULL DEFAULT 0,
    evidence_snapshot_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS rca_verifications (
    id TEXT PRIMARY KEY,
    incident_id TEXT NOT NULL,
    candidate_id TEXT NOT NULL,
    verification_target TEXT NOT NULL,
    result TEXT NOT NULL, -- CONFIRMED | DISPROVED | INCONCLUSIVE
    notes TEXT,
    actor_id TEXT NOT NULL DEFAULT 'USER',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE CASCADE
);

