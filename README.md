# Enterprise IT Support Triage Assistant

A production-grade, AI-assisted ITSM Diagnostic Engine and Support Engineer Workbench designed for enterprise IT service desks.

The system combines **deterministic Knowledge Base taxonomy rules**, **explainable priority scoring**, **Hybrid AI decision engine**, **Adaptive Troubleshooting Information-Gain heuristic**, **Explainable Root Cause Analysis (RCA)**, **Human-in-the-Loop Governance**, **SQLite incident memory**, **graph relationship detection**, **non-dead-ending recovery pathways**, and **strict AI reliability guardrails** to guide users and support engineers from initial problem input to audited resolution.

---

## 1. Project Overview & Problem Statement

### Problem Statement
Enterprise IT service desks face high ticket volumes, vague user issue reports (e.g. "internet is down"), repetitive troubleshooting requests, and risk of AI hallucination or unsafe recommendations.

### Solution
The Enterprise IT Support Triage Assistant provides a hybrid decision architecture combining deterministic safety rules with AI reasoning layer validation. It features progressive one-question-at-a-time triage, Information-Gain heuristic question ranking, Root Cause Analysis (RCA) hypothesis generation, explicit human decision governance, and interactive incident timeline verification.

---

## 2. Architecture & Tech Stack

```
+-----------------------------------------------------------------------------------+
|                                 FRONTEND UX                                       |
|  [Engineer Operations Dashboard]   [New Triage Session]   [Incident History & Linker]|
|  [Why This Next Step? Adaptive UI]  [RCA Governance Panel] [Decision Trace Drawer]   |
+------------------------------------------+----------------------------------------+
                                           | HTTP / REST API
+------------------------------------------v----------------------------------------+
|                             EXPRESS BACKEND SERVER                                |
|  +-----------------------+  +----------------------+  +-------------------------+ |
|  |  Universal Search     |  |  Progressive Triage  |  |  Adaptive Engine        | |
|  |  (Fuzzy/Synonyms)     |  |  (One-Question Flow) |  |  (Information-Gain)     | |
|  +-----------+-----------+  +----------+-----------+  +------------+------------+ |
|              |                         |                       |                  |
|  +-----------v-----------+  +----------v-----------+  +------------v------------+ |
|  |   Priority Engine     |  | Recommendation Engine|  | RCA & Governance Engine | |
|  | (Deterministic Rules) |  |  (Grounded KB Steps) |  | (Human Confirm/Reject)  | |
|  +-----------------------+  +----------+-----------+  +-------------------------+ |
|                                        |                                          |
|  +-------------------------------------v----------------------------------------+ |
|  |                   HYBRID AI & RELIABILITY GUARDRAILS                         | |
|  |  - Hybrid Decision Engine   - Zod Schema Validation    - Grounding Enforcement  | |
|  |  - PII Sanitized Logger     - Grounded Fallback        - Prompt-Injection Shield| |
|  +-------------------------------------+----------------------------------------+ |
+----------------------------------------|------------------------------------------+
                                         v
+-----------------------------------------------------------------------------------+
|                             SQLITE DATABASE ENGINE                                |
|   incidents | incident_answers | incident_actions | incident_relationships        |
+-----------------------------------------------------------------------------------+
```

### Tech Stack
- **Backend**: Node.js, Express 5, TypeScript, Better-SQLite3, Zod.
- **Frontend**: React 19, TypeScript, Vanilla CSS (Linear/Notion-inspired dark mode), Vite.
- **Testing**: Vitest (19 test files, 185 unit & integration tests).
- **Execution & Tooling**: TSX, Vite.

---

## 3. Core Features & AI Architecture

### A. Universal Progressive Triage
Converts free-text user queries into structured issue candidates (Network, Account, Application, Device, Other). Asks adaptive questions one at a time, calculating priority (`P1_CRITICAL` to `P4_LOW`) and missing information.

### B. Hybrid AI Decision Engine
Combines deterministic Knowledge Base retrieval with AI reasoning. User queries pass through deterministic candidate matching, AI context parsing, Zod schema validation, and grounding verification before final decision emission.

### C. Adaptive Troubleshooting / Information-Gain Engine
Selects the next best diagnostic question or safe troubleshooting action using an explainable Information-Gain heuristic score (0–100):
$$\text{FinalScore} = \max(0, \min(100, \text{Discrimination} + \text{Relevance} + \text{SafetyBonus} - \text{UserEffort} - \text{RepetitionPenalty} - \text{PrerequisitePenalty}))$$
Reduces uncertainty while blocking high-risk actions (e.g. disk format or battery puncture).

### D. Explainable Root Cause Analysis (RCA) & Human Governance
Generates structured RCA hypotheses labeled with supporting/contradicting evidence. Human decisions (`CONFIRMED`, `REJECTED`, `UNCERTAIN`) override AI confidence and maintain complete audit trail history.

### E. Troubleshooting Verification Loop
Tracks user confirmation of troubleshooting outcomes (`YES_RESOLVED`, `NO_FAILED`, `PARTIALLY_RESOLVED`, `SOMETHING_CHANGED`). Spawns linked follow-up incidents on new symptoms.

---

## 4. Setup, Run & Test Commands

### Prerequisites
- Node.js (v18+ recommended)
- npm (v9+ recommended)

### Installation
```bash
git clone <repository-url>
cd worlds_best_project
npm install
```

### Environment Variables
Copy `.env.example` to `.env` (defaults are built in):
```env
PORT=3000
NODE_ENV=development
DATABASE_PATH=./src/backend/data/triage_memory.db
```

### Run Server & Production Build
```bash
# Production Build:
npm run build

# Start Backend Server:
npm run dev
```
Open `http://localhost:3000` in your web browser.

### Run Automated Tests
```bash
# Run 185 Unit & Integration Tests:
npm test

# Run TypeScript Type Check:
npx tsc --noEmit
```

---

## 5. Guided Demo Sequence

1. **Dashboard Overview**: Open `http://localhost:3000`. Observe real-time queue metrics and pattern alerts.
2. **New Triage Session**: Enter `"Wi-Fi is connected but I cannot access websites. Teams is also not working and I have an important client call in 30 minutes."`
3. **Progressive Question & Adaptive UI**: Answer the high-discrimination question. View the "Why this next step?" card.
4. **Diagnosis & Priority**: View `P1_CRITICAL` priority, confidence rating, missing information, and grounded recommendation.
5. **Verification Loop**: Test selecting `NO_FAILED` -> notice confidence updates and next grounded step is selected.
6. **RCA & Governance**: View RCA candidate hypotheses, inspect evidence provenance, test human `CONFIRMED` / `REJECTED` decision governance.

---

## 6. Security & AI Limitations

### Security Considerations
- All backend endpoints validate inputs with Zod schemas.
- User input is isolated as untrusted data; system prompts and scoring weights cannot be overwritten by prompt injection.
- PII (passwords, tokens) are sanitized in log outputs.
- Destructive commands receive score 0 and are blocked.

### AI Limitations & Fallbacks
- Deterministic engine is authoritative. If AI fails, retries are exhausted, or an ungrounded ID is returned, the engine falls back gracefully to grounded Knowledge Base defaults without breaking the UI.
