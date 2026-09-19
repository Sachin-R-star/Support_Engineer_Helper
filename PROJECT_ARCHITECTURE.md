# Enterprise AI IT Support Triage Assistant - Project Architecture

## 1. Executive Summary & Overview
The **Enterprise AI IT Support Triage Assistant** is a production-grade enterprise IT helpdesk system that ingests end-user issues, performs progressive one-question-at-a-time triage, resolves ambiguities, references historical incidents/knowledge base articles, and generates structured triage results with confidence scoring and deterministic rule validation.

---

## 2. Current Codebase Status
- **Repository State**: Fresh / Empty workspace (`c:\Users\SACHIN\OneDrive\Desktop\worlds_best_project`).
- **Existing Files**: None prior to this report.
- **Environment**: Node.js `v26.5.1`, npm `11.17.0`, Python `3.8.10` on Windows OS.

---

## 3. Core Architecture & System Components

```
+-----------------------------------------------------------------------------------+
|                            ENTERPRISE FRONTEND (UX)                              |
| - Interactive Triage Console (One-question-at-a-time interactive triage)          |
| - Ambiguity Resolution & Quick Selection Chips                                    |
| - Live Ticket Workspace & Incident Drawer                                         |
| - Historical Incidents & Related Incident Linker Panel                             |
+-----------------------------------------------------------------------------------+
                                         |  REST API / WebSockets
                                         v
+-----------------------------------------------------------------------------------+
|                            BACKEND TRIAGE ENGINE                                  |
| - Intent Parser & Fallback Normalizer (Never dead-ends)                           |
| - Progressive State Machine & Triage Orchestrator                                 |
| - Deterministic Business Logic Rules Engine (Priority, Escalation, Security)      |
| - LLM / AI Reasoning Provider (OpenAI / Gemini / Local / Fallback mock engine)    |
+-----------------------------------------------------------------------------------+
                                         |
                                         v
+-----------------------------------------------------------------------------------+
|                        DATA PERSISTENCE & KNOWLEDGE LAYER                         |
| - SQLite / JSON File Database                                                     |
| - Historical Incident Store & Vector/Text Similarity Index                        |
| - Knowledge Base (KB) Articles & Known Fixes                                      |
+-----------------------------------------------------------------------------------+
```

---

## 4. Key Architectural Subsystems & Design Principles

### A. Non-Dead-Ending Intent Normalizer (Principles 1 & 2)
- Any unstructured or vague input (e.g., *"it's broken"*, *"can't login"*, *"wifi down"*) is parsed into candidate IT issue domains (Hardware, Network, Auth/Access, Software, VPN, Security).
- If intent is ambiguous, the system prompts the user with targeted multi-choice disambiguation chips instead of returning an error or generic message.

### B. Progressive Triage State Machine (Principles 3 & 4)
- **One Question at a Time**: Asks single, highly targeted follow-up questions to minimize user cognitive load.
- Tracks question history, user answers, system diagnostic tests performed, and updated belief state.

### C. Incident Memory & Knowledge Graph Linker (Principles 5 & 6)
- Keeps full session memory of answers, actions taken, and past incident outcomes.
- Automatically calculates similarity scores against historical incidents (by user, asset, app, or symptom pattern).
- Links new incidents to existing open major incidents or past resolutions.

### D. Uncertainty Representation & Final Triage Payload (Principles 7 & 8)
- Calculates a confidence score (0–100%) based on clarity of symptoms and diagnostic responses.
- Generates structured final triage output:
  - **Category**: (e.g., Network, Identity & Access, Hardware)
  - **Issue Type**: (e.g., Password Reset, VPN Gateway Timeout, Blue Screen)
  - **Priority**: (P1 - Critical, P2 - High, P3 - Medium, P4 - Low)
  - **Missing Information**: List of unconfirmed data points.
  - **Recommended Next Step**: (e.g., Self-Service Reset, Tier 2 Dispatch, Hardware Replacement)
  - **Reasoning**: Clear explanation of triage logic.
  - **Confidence Level**: High / Medium / Low + numerical score.

### E. Deterministic Rules + AI Hybrid Engine (Principle 9)
- **Deterministic Rules**: Mandatory override for critical SLA paths (e.g., executive P1 flags, account lockout security policy, active malware flags).
- **AI Engine**: Context analysis, natural language understanding, root-cause reasoning, and response generation.

### F. Enterprise IT Desk UX (Principle 10)
- Designed with professional IT Service Management (ITSM) aesthetics (dark/light theme, ticket cards, status badges, telemetry stats, execution logs, asset info sidebar).

---

## 5. Missing Architecture Pieces (To Be Built)
1. **Frontend Application**: Enterprise Triage Dashboard, Incident Drawer, Interactive Chat, Disambiguation Chips, History Linker.
2. **Backend Engine**: Express / Node.js API server handling session state, intent triage, rules engine, and incident store.
3. **Storage & KB Data Layer**: SQLite / File-backed persistence containing seed enterprise IT incidents, KB solutions, and active tickets.
4. **Deterministic Policy Rules**: Rule evaluator for SLA, Priority matrix, and Security escalations.
5. **AI Reasoning / Triage Handler**: Structured prompt manager with robust JSON output schema and fallback fallback reasoning.

---

## 6. Recommended Implementation Roadmap
- **Phase 1: Project Setup & Storage Schema**
  - Initialize Node.js TypeScript project, Express server, SQLite database, and seed data (KB & Past Incidents).
- **Phase 2: Core Triage Engine & Rules Engine**
  - Implement intent parser, progressive state machine, deterministic rules engine, and output formatter.
- **Phase 3: Incident Linking & Memory System**
  - Implement similarity matching for historical incidents and automatic incident linking.
- **Phase 4: Enterprise UX Frontend**
  - Build responsive ITSM UI console with real-time triage workspace, ticket drawer, and incident history.
- **Phase 5: Verification & End-to-End Testing**
  - Test edge cases, vague inputs, major incident linking, and SLA priority overrides.
