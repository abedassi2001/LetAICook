
# letAIcook — Use Cases & UML Documentation

# Main Actors

1. Developer
2. Team Lead
3. Project Manager
4. AI Orchestrator
5. Jira System

---

# Primary Use Cases

## 1. Generate Project Roadmap
Actor: Developer

Flow:
- User submits project idea
- AI analyzes requirements
- System generates phases and milestones
- Tasks are stored in database

---

## 2. Create Sprint Plan
Actor: Team Lead

Flow:
- AI analyzes pending tasks
- AI groups tasks into sprint
- Sprint priorities generated
- Jira sprint updated

---

## 3. AI Task Assignment
Actor: AI Orchestrator

Flow:
- Analyze task requirements
- Match engineer skills
- Check workload balancing
- Assign Jira ticket automatically

---

## 4. Deployment Guidance
Actor: Developer

Flow:
- AI analyzes architecture
- Deployment templates generated
- CI/CD suggestions created
- Infrastructure recommendations displayed

---

# UML Class Relations

User
 ├── owns → Projects
Projects
 ├── contains → Milestones
Milestones
 ├── contains → Tasks
Tasks
 ├── assigned_to → Developers
Tasks
 ├── synced_with → JiraTickets

AIOrchestrator
 ├── generates → Tasks
 ├── analyzes → ProjectArchitecture
 ├── recommends → SprintPlans

---

# Database Models

## users
- id
- email
- password_hash
- created_at

## developers
- id
- role
- skills
- workload
- availability

## projects
- id
- title
- description
- status

## milestones
- id
- project_id
- status

## tasks
- id
- title
- priority
- depends_on
- assignee_id

## sprints
- id
- start_date
- end_date

---

# UI Pages

## Dashboard
- active projects
- sprint overview
- blockers
- progress analytics

## Task Board
- kanban view
- dependencies
- assignments

## AI Assistant Panel
- ask questions
- receive recommendations
- deployment guidance

## Team Analytics
- workload
- sprint completion
- productivity metrics

---

# Deployment Architecture

Users
  ↓
Frontend (Next.js)
  ↓
FastAPI Backend
  ↓
Redis + PostgreSQL
  ↓
AI Services
  ↓
Jira API
