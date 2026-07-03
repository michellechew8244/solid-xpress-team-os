// Idea Bank shared constants — client-safe (no server imports).

export const PROPOSAL_CATEGORIES: Record<string, string> = {
  COST_SAVING: "💰 Cost Saving",
  REVENUE_GROWTH: "📈 Revenue Growth",
  CUSTOMER_SERVICE: "🤝 Customer Service Improvement",
  OPERATION_EFFICIENCY: "⚙️ Operation Efficiency",
  FINANCE_CONTROL: "🧾 Finance Control",
  SOP_IMPROVEMENT: "📋 SOP Improvement",
  AUTOMATION_AI: "🤖 Automation / AI Idea",
  TEAM_CULTURE: "🎉 Team Culture",
  RISK_PREVENTION: "🛡️ Risk Prevention",
  MARKETING: "📣 Marketing Idea",
  TRAINING: "🎓 Training Improvement",
};

export const PROPOSAL_STATUS_PILL: Record<string, string> = {
  SUBMITTED: "WARN",
  UNDER_REVIEW: "WARN",
  REVISION_REQUESTED: "WARN",
  ACCEPTED: "OK",
  IMPLEMENTED: "OK",
  REJECTED: "DANGER",
};
