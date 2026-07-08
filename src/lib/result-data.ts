/**
 * Result-oriented KPI: pure data (weights, profiles, quality gates, result
 * types, case credits, closure types). Safe to import from client components.
 */

export const RESULT_CORE_WEIGHTS = {
  businessResult: 40,
  customerOutcome: 25,
  accuracyRisk: 20,
  contribution: 10,
  discipline: 5,
} as const;

// ---------------------------------------------------------------------------
// Role profiles and their result areas (weights sum to 100)
// ---------------------------------------------------------------------------
export const CS_PROFILE_TYPES = ["CS_CUSTOMER_CARE", "CS_BOOKING_DOCUMENTATION", "CS_TRANSLOADING", "CS_HYBRID", "CS_TEAM_HEAD"] as const;
export type CSProfileType = (typeof CS_PROFILE_TYPES)[number];

export const PROFILE_RESULT_AREAS: Record<string, { area: string; weight: number }[]> = {
  CS_CUSTOMER_CARE: [
    { area: "Assigned Inquiry Resolution Outcome", weight: 25 },
    { area: "Existing Customer Service Outcome", weight: 20 },
    { area: "New Lead Progression Outcome", weight: 15 },
    { area: "Customs Inquiry / Closing Resolution", weight: 15 },
    { area: "Shipment Update Result", weight: 10 },
    { area: "Complaint Control", weight: 10 },
    { area: "Improvement Contribution", weight: 5 },
  ],
  CS_BOOKING_DOCUMENTATION: [
    { area: "Successful Booking / Job Execution Outcome", weight: 25 },
    { area: "Quote Accuracy & GP Protection", weight: 20 },
    { area: "SI / Draft BL Accuracy Outcome", weight: 20 },
    { area: "Closing / Deadline Protection", weight: 15 },
    { area: "Clearance / Haulage Coordination Result", weight: 10 },
    { area: "Error / Cost Control", weight: 5 },
    { area: "Improvement Contribution", weight: 5 },
  ],
  CS_TRANSLOADING: [
    { area: "Successful Transloading Completion", weight: 25 },
    { area: "Import Clearance / Warehouse Coordination Outcome", weight: 20 },
    { area: "Unstuffing / Stuffing Result", weight: 15 },
    { area: "Export Booking / Export Clearance Result", weight: 15 },
    { area: "Customer Update & Proof Result", weight: 10 },
    { area: "Cost / Delay / Damage Control", weight: 10 },
    { area: "Improvement Contribution", weight: 5 },
  ],
  CS_HYBRID: [
    { area: "Assigned Inquiry Resolution Outcome", weight: 20 },
    { area: "Successful Booking / Job Execution Outcome", weight: 20 },
    { area: "Existing Customer Service Outcome", weight: 15 },
    { area: "Closing / Deadline Protection", weight: 15 },
    { area: "SI / Draft BL Accuracy Outcome", weight: 10 },
    { area: "Complaint Control", weight: 10 },
    { area: "Improvement Contribution", weight: 10 },
  ],
  CS_TEAM_HEAD: [
    { area: "Team Customer Service Result", weight: 25 },
    { area: "Inquiry Allocation & Backlog Result", weight: 15 },
    { area: "Team Error / Complaint Reduction", weight: 15 },
    { area: "Staff Capability Improvement", weight: 20 },
    { area: "SOP / Process Improvement Result", weight: 10 },
    { area: "Cross-Department Coordination Result", weight: 10 },
    { area: "Team Discipline Result", weight: 5 },
  ],
  OPERATION: [
    { area: "Shipment Execution Success Rate", weight: 25 },
    { area: "Closing / ETA / ETD Protection", weight: 20 },
    { area: "Job Coordination Outcome", weight: 15 },
    { area: "Exception Resolution Result", weight: 15 },
    { area: "Cost Avoidance / No Demurrage / No Detention", weight: 15 },
    { area: "Internal Handover Result", weight: 5 },
    { area: "Improvement Contribution", weight: 5 },
  ],
  FORWARDING: [
    { area: "Customs Declaration Accuracy Outcome", weight: 30 },
    { area: "Customs Release Success / SLA Result", weight: 20 },
    { area: "Permit Approval / Submission Outcome", weight: 15 },
    { area: "HS Code / Duty / Tax Risk Control", weight: 15 },
    { area: "No Penalty / No Compound / No Avoidable Delay", weight: 10 },
    { area: "Supporting Document Control Result", weight: 5 },
    { area: "Improvement Contribution", weight: 5 },
  ],
};

// ---------------------------------------------------------------------------
// Quality gate: every result passes a gate before it counts.
// ---------------------------------------------------------------------------
export const QUALITY_GATES = [
  { pct: 100, label: "Good result, no issue" },
  { pct: 80, label: "Minor internal correction, no customer impact" },
  { pct: 50, label: "Customer complaint" },
  { pct: 25, label: "Extra cost caused (partial)" },
  { pct: 0, label: "Hidden issue (0% + deduction case)" },
] as const;

// ---------------------------------------------------------------------------
// Result types → suggested diamond rewards (result-based, not task-based).
// ---------------------------------------------------------------------------
export const RESULT_TYPES: { key: string; label: string; diamonds: number; area: string }[] = [
  { key: "INQUIRY_CONVERTED", label: "Inquiry converted to quotation / sales opportunity", diamonds: 75, area: "Assigned Inquiry Resolution Outcome" },
  { key: "NEW_CUSTOMER_FIRST_SHIPMENT", label: "New customer first shipment completed", diamonds: 150, area: "New Lead Progression Outcome" },
  { key: "CUSTOMER_RETAINED", label: "Existing customer repeat shipment retained", diamonds: 100, area: "Existing Customer Service Outcome" },
  { key: "CLOSING_PROTECTED", label: "Closing risk prevented", diamonds: 100, area: "Closing / Deadline Protection" },
  { key: "CUSTOMS_SOLVED", label: "Customs inquiry solved clearly", diamonds: 80, area: "Customs Inquiry / Closing Resolution" },
  { key: "SHIPMENT_COMPLETED", label: "Shipment completed without complaint", diamonds: 50, area: "Shipment Execution Success Rate" },
  { key: "ZERO_COMPLAINT_MONTH", label: "Zero complaint month", diamonds: 200, area: "Complaint Control" },
  { key: "COST_AVOIDED", label: "Prevented demurrage / detention / penalty", diamonds: 300, area: "Cost Avoidance / No Demurrage / No Detention" },
  { key: "TRANSLOADING_COMPLETED", label: "Transloading completed smoothly", diamonds: 150, area: "Successful Transloading Completion" },
  { key: "CUSTOMER_COMPLIMENT", label: "Customer compliment", diamonds: 100, area: "Existing Customer Service Outcome" },
  { key: "SOP_IMPROVED", label: "SOP improvement that reduces error", diamonds: 200, area: "Improvement Contribution" },
  { key: "PROPOSAL_IMPACT", label: "Proposal implemented with business impact", diamonds: 300, area: "Improvement Contribution" },
  { key: "GP_PROTECTED", label: "GP protected (quote/billing accuracy)", diamonds: 100, area: "Quote Accuracy & GP Protection" },
  { key: "DECLARATION_ACCURATE", label: "Clean declaration / release result", diamonds: 80, area: "Customs Declaration Accuracy Outcome" },
];

// Case credits — workload fairness only.
export const DEFAULT_CASE_CREDITS: { workType: string; baseCredit: number; description: string }[] = [
  { workType: "SIMPLE_INQUIRY", baseCredit: 0.5, description: "Simple inquiry / update" },
  { workType: "NEW_LEAD_INQUIRY", baseCredit: 1, description: "New lead inquiry" },
  { workType: "AGENT_RATE_REQUEST", baseCredit: 1, description: "Rate request to overseas agent" },
  { workType: "QUOTE_PREPARED", baseCredit: 1, description: "Quote prepared" },
  { workType: "BOOKING_BC", baseCredit: 1, description: "Booking / BC" },
  { workType: "OPEN_JOB", baseCredit: 0.5, description: "Open job" },
  { workType: "SI_SUBMISSION", baseCredit: 1, description: "SI submission" },
  { workType: "DRAFT_BL_CHECK", baseCredit: 1, description: "Draft BL checking" },
  { workType: "CLEARANCE_COORDINATION", baseCredit: 1.5, description: "Clearance coordination" },
  { workType: "HAULAGE_COORDINATION", baseCredit: 1.5, description: "Haulage coordination" },
  { workType: "CUSTOMS_INQUIRY_COORD", baseCredit: 1.5, description: "Customs inquiry coordination" },
  { workType: "CLOSING_DATE_CONTROL", baseCredit: 1, description: "Closing date control" },
  { workType: "COMPLAINT_HANDLING", baseCredit: 2, description: "Complaint handling" },
  { workType: "TRANSLOADING_SIMPLE", baseCredit: 5, description: "Simple transloading shipment" },
  { workType: "TRANSLOADING_FULL", baseCredit: 12, description: "Full transloading import + warehouse + export" },
];

// Valid inquiry closure types — what "properly closed" means.
export const CLOSURE_TYPES: { key: string; label: string }[] = [
  { key: "QUOTE_SENT", label: "Quote sent to customer" },
  { key: "ANSWERED_NEXT_ACTION", label: "Customer answered · next action recorded" },
  { key: "HANDED_TO_SALES", label: "Handed to Sales with complete info" },
  { key: "AWAITING_AGENT_RATE", label: "Awaiting overseas agent rate (RFQ/follow-up proof)" },
  { key: "NO_RESPONSE_LOST", label: "No response after follow-up cycle · lost reason recorded" },
  { key: "UPDATE_COMPLETED", label: "Customer update completed" },
];

