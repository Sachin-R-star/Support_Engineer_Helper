export type PriorityLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface PriorityThresholds {
  CRITICAL: number; // Score >= 80 -> CRITICAL
  HIGH: number;     // Score >= 55 -> HIGH
  MEDIUM: number;   // Score >= 30 -> MEDIUM
  LOW: number;      // Score < 30  -> LOW
}

export interface PrioritySignalWeights {
  users_affected: {
    SINGLE_USER: number;        // +0
    TEAM: number;               // +20
    DEPARTMENT: number;         // +40
    ENTIRE_ORGANIZATION: number;// +65
  };
  work_completely_blocked: number;   // +35
  security_implications: number;     // +50
  critical_system_affected: number;  // +25
  client_customer_impact: number;    // +20
  urgent_meeting_deadline: number;   // +20
  is_vip_user: number;               // +30
  workaround_available: number;      // -15
}

export const DEFAULT_PRIORITY_CONFIG = {
  thresholds: {
    CRITICAL: 80,
    HIGH: 55,
    MEDIUM: 30,
    LOW: 0
  } as PriorityThresholds,

  weights: {
    users_affected: {
      SINGLE_USER: 0,
      TEAM: 20,
      DEPARTMENT: 40,
      ENTIRE_ORGANIZATION: 65
    },
    work_completely_blocked: 35,
    security_implications: 50,
    critical_system_affected: 25,
    client_customer_impact: 20,
    urgent_meeting_deadline: 20,
    is_vip_user: 30,
    workaround_available: -15
  } as PrioritySignalWeights,

  reasonCodes: {
    SECURITY_THREAT_DETECTED: 'SECURITY_THREAT_DETECTED',
    SAFETY_HAZARD_DETECTED: 'SAFETY_HAZARD_DETECTED',
    ENTIRE_ORG_OUTAGE: 'ENTIRE_ORG_OUTAGE',
    DEPARTMENT_OUTAGE: 'DEPARTMENT_OUTAGE',
    TEAM_AFFECTED: 'TEAM_AFFECTED',
    WORK_COMPLETELY_BLOCKED: 'WORK_COMPLETELY_BLOCKED',
    CRITICAL_SYSTEM_AFFECTED: 'CRITICAL_SYSTEM_AFFECTED',
    CLIENT_CUSTOMER_IMPACT: 'CLIENT_CUSTOMER_IMPACT',
    URGENT_DEADLINE: 'URGENT_DEADLINE',
    VIP_EXECUTIVE_AFFECTED: 'VIP_EXECUTIVE_AFFECTED',
    WORKAROUND_AVAILABLE_REDUCTION: 'WORKAROUND_AVAILABLE_REDUCTION',
    ROUTINE_REQUEST: 'ROUTINE_REQUEST'
  }
};
