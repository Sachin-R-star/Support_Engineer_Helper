import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const DB_PATH = process.env.NODE_ENV === 'test' 
  ? ':memory:' 
  : path.join(process.cwd(), 'triage_assistant.db');

export class DatabaseService {
  private static instance: Database.Database;

  public static getDb(): Database.Database {
    if (!this.instance) {
      this.instance = new Database(DB_PATH, { verbose: process.env.DEBUG ? console.log : undefined });
      this.instance.pragma('foreign_keys = ON');
      this.initSchema();
    }
    return this.instance;
  }

  private static initSchema(): void {
    const schemaPath = path.join(__dirname, 'schema.sql');
    if (fs.existsSync(schemaPath)) {
      const schemaSql = fs.readFileSync(schemaPath, 'utf8');
      this.instance.exec(schemaSql);
    } else {
      this.instance.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'END_USER', department TEXT NOT NULL,
            is_vip INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS devices (
            id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL,
            device_type TEXT NOT NULL, os TEXT NOT NULL, serial_number TEXT UNIQUE NOT NULL,
            status TEXT NOT NULL DEFAULT 'ACTIVE', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS incidents (
            id TEXT PRIMARY KEY, ticket_number TEXT UNIQUE NOT NULL, user_id TEXT NOT NULL,
            device_id TEXT, category TEXT NOT NULL, issue_type TEXT NOT NULL,
            priority TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'OPEN',
            summary TEXT NOT NULL, description TEXT NOT NULL, resolution TEXT,
            escalation_tier TEXT DEFAULT 'NONE', missing_info TEXT NOT NULL DEFAULT '[]',
            recommended_next_step TEXT NOT NULL, reasoning TEXT NOT NULL, confidence_score INTEGER NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            resolved_at TEXT, reopened_at TEXT,
            FOREIGN KEY (user_id) REFERENCES users(id), FOREIGN KEY (device_id) REFERENCES devices(id)
        );
        CREATE TABLE IF NOT EXISTS incident_answers (
            id TEXT PRIMARY KEY, incident_id TEXT NOT NULL, question_id TEXT NOT NULL,
            question_text TEXT NOT NULL, answer_value TEXT NOT NULL, is_unsure INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS incident_actions (
            id TEXT PRIMARY KEY, incident_id TEXT NOT NULL, action_type TEXT NOT NULL,
            description TEXT NOT NULL, result_status TEXT DEFAULT 'PENDING', result_details TEXT,
            performer TEXT NOT NULL DEFAULT 'SYSTEM', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS incident_evidence (
            id TEXT PRIMARY KEY, incident_id TEXT NOT NULL, fact_key TEXT NOT NULL,
            fact_value TEXT NOT NULL, source_question_id TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS incident_events (
            id TEXT PRIMARY KEY, incident_id TEXT NOT NULL, event_type TEXT NOT NULL,
            description TEXT NOT NULL, metadata_json TEXT DEFAULT '{}', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS incident_relationships (
            id TEXT PRIMARY KEY, source_incident_id TEXT NOT NULL, target_incident_id TEXT NOT NULL,
            relationship_type TEXT NOT NULL, similarity_score REAL NOT NULL DEFAULT 0.0,
            status TEXT NOT NULL DEFAULT 'CONFIRMED', source_action_id TEXT, explanation TEXT NOT NULL DEFAULT '',
            confirmed_by TEXT, confirmed_at TEXT,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (source_incident_id) REFERENCES incidents(id) ON DELETE CASCADE,
            FOREIGN KEY (target_incident_id) REFERENCES incidents(id) ON DELETE CASCADE,
            UNIQUE(source_incident_id, target_incident_id)
        );
        CREATE TABLE IF NOT EXISTS rca_human_decisions (
            id TEXT PRIMARY KEY, incident_id TEXT NOT NULL, candidate_id TEXT NOT NULL,
            decision TEXT NOT NULL, actor_id TEXT NOT NULL DEFAULT 'USER', notes TEXT,
            ai_confidence_at_decision INTEGER NOT NULL DEFAULT 0,
            evidence_snapshot_json TEXT NOT NULL DEFAULT '[]',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS rca_verifications (
            id TEXT PRIMARY KEY, incident_id TEXT NOT NULL, candidate_id TEXT NOT NULL,
            verification_target TEXT NOT NULL, result TEXT NOT NULL, notes TEXT,
            actor_id TEXT NOT NULL DEFAULT 'USER', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE CASCADE
        );
      `);
    }

    // Run Column Migrations for existing DB file
    try {
      this.instance.exec(`
        ALTER TABLE incidents ADD COLUMN resolution TEXT;
        ALTER TABLE incidents ADD COLUMN escalation_tier TEXT DEFAULT 'NONE';
        ALTER TABLE incidents ADD COLUMN resolved_at TEXT;
        ALTER TABLE incidents ADD COLUMN reopened_at TEXT;
      `);
    } catch (e) {
      // Columns already exist
    }

    try {
      this.instance.exec(`
        ALTER TABLE incident_relationships ADD COLUMN status TEXT NOT NULL DEFAULT 'CONFIRMED';
        ALTER TABLE incident_relationships ADD COLUMN source_action_id TEXT;
        ALTER TABLE incident_relationships ADD COLUMN explanation TEXT NOT NULL DEFAULT '';
        ALTER TABLE incident_relationships ADD COLUMN confirmed_by TEXT;
        ALTER TABLE incident_relationships ADD COLUMN confirmed_at TEXT;
      `);
    } catch (e) {
      // Columns already exist
    }

    try {
      this.instance.exec(`
        ALTER TABLE rca_human_decisions ADD COLUMN ai_confidence_at_decision INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE rca_human_decisions ADD COLUMN evidence_snapshot_json TEXT NOT NULL DEFAULT '[]';
      `);
    } catch (e) {
      // Columns already exist
    }

    try {
      this.instance.exec(`
        CREATE TABLE IF NOT EXISTS rca_verifications (
            id TEXT PRIMARY KEY, incident_id TEXT NOT NULL, candidate_id TEXT NOT NULL,
            verification_target TEXT NOT NULL, result TEXT NOT NULL, notes TEXT,
            actor_id TEXT NOT NULL DEFAULT 'USER', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE CASCADE
        );
      `);
    } catch (e) {
      // Table already exists
    }
  }

  public static seedDefaults(): void {
    const db = this.getDb();
    
    const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
    if (userCount.count === 0) {
      const insertUser = db.prepare(`
        INSERT INTO users (id, email, name, role, department, is_vip)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      insertUser.run('usr_exec_01', 'alex.morgan@enterprise.com', 'Alex Morgan', 'END_USER', 'Executive Office', 1);
      insertUser.run('usr_eng_02', 'sam.lee@enterprise.com', 'Sam Lee', 'END_USER', 'Engineering', 0);
      insertUser.run('usr_agent_01', 'it.support@enterprise.com', 'IT Desk Lead', 'TIER_2_AGENT', 'IT Infrastructure', 0);

      const insertDevice = db.prepare(`
        INSERT INTO devices (id, user_id, name, device_type, os, serial_number, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      insertDevice.run('dev_mac_01', 'usr_exec_01', 'Alex-MacBookPro16', 'LAPTOP', 'macOS Sequoia 15.1', 'C02FX911MD6R', 'ACTIVE');
      insertDevice.run('dev_win_02', 'usr_eng_02', 'Sam-ThinkPad-T14', 'LAPTOP', 'Windows 11 Enterprise', 'PF29A098', 'ACTIVE');

      const insertIncident = db.prepare(`
        INSERT INTO incidents (
          id, ticket_number, user_id, device_id, category, issue_type, priority, status, 
          summary, description, resolution, missing_info, recommended_next_step, reasoning, confidence_score
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      insertIncident.run(
        'inc_hist_101',
        'INC-2026-8801',
        'usr_eng_02',
        'dev_win_02',
        'NETWORK',
        'VPN Gateway Timeout / Disconnect',
        'P2_HIGH',
        'RESOLVED',
        'VPN connection fails after 2FA auth prompt',
        'GlobalProtect VPN gateway timeout on US-East node',
        'Cleared local DNS cache and updated regional gateway tokens.',
        JSON.stringify([]),
        'Clear DNS cache and flush GlobalProtect auth tokens via self-service script.',
        'Matched past resolution for GlobalProtect US-East outage.',
        95
      );
    }
  }
}
