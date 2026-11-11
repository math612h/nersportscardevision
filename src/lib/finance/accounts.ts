export const ACC = {
  bank: "1000",
  stripe: "1010",
  transit: "1020",
  receivables: "1100",
  payables: "2000",
  reimbursementDebt: "2100",
  equity: "3000",
  membership: "4000",
  donations: "4100",
  sponsorship: "4200",
  coaching: "4300",
  otherIncome: "4900",
  website: "6000",
  software: "6100",
  trophies: "6200",
  marketing: "6300",
  fees: "6400",
  otherExpense: "6900",
} as const;

export type Category = "membership" | "donation" | "sponsorship" | "coaching" | "other_income";

export const CATEGORY_ACCOUNT: Record<Category, string> = {
  membership: ACC.membership,
  donation: ACC.donations,
  sponsorship: ACC.sponsorship,
  coaching: ACC.coaching,
  other_income: ACC.otherIncome,
};

export const CATEGORY_LABEL: Record<Category, string> = {
  membership: "Kontingent",
  donation: "Donation",
  sponsorship: "Sponsorat",
  coaching: "Coaching",
  other_income: "Øvrig indtægt",
};
