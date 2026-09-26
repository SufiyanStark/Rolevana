export const roleCategories = [
  "SOFTWARE_ENGINEERING", "FRONTEND_ENGINEERING", "BACKEND_ENGINEERING", "FULL_STACK_ENGINEERING", "MOBILE_ENGINEERING", "QA_SDET", "DEVOPS_CLOUD", "PLATFORM_SRE", "CYBERSECURITY", "DATA", "AI_ML", "PRODUCT", "PROJECT_PROGRAM_MANAGEMENT", "ENGINEERING_MANAGEMENT", "DESIGN_UX", "SALES", "MARKETING", "FINANCE", "HR", "OPERATIONS", "CUSTOMER_SUCCESS", "SUPPORT", "CONSULTING", "HEALTHCARE", "EDUCATION", "LEGAL", "ADMINISTRATION", "SUPPLY_CHAIN", "MANUFACTURING", "OTHER"
] as const;
export type RoleCategory = typeof roleCategories[number];

export type RoleCatalogEntry = { title: string; category: RoleCategory; aliases: string[]; relatedTitles: string[]; label?: string };
const role = (title: string, category: RoleCategory, aliases: string[] = [], relatedTitles: string[] = []): RoleCatalogEntry => ({ title, category, aliases, relatedTitles });

export const roleCatalog: RoleCatalogEntry[] = [
  role("Software Engineer", "SOFTWARE_ENGINEERING", ["Software Developer"]),
  role("Frontend Engineer", "FRONTEND_ENGINEERING", ["Front End Engineer", "Frontend Developer", "Front End Developer"], ["Frontend Developer", "React Engineer", "React Developer", "Next.js Engineer", "Next.js Developer", "UI Engineer", "Software Engineer - Frontend", "Web Frontend Engineer", "Web UI Engineer"]),
  role("Senior Frontend Engineer", "FRONTEND_ENGINEERING", ["Senior Frontend Developer"]), role("React Engineer", "FRONTEND_ENGINEERING", ["React Developer"]), role("Next.js Engineer", "FRONTEND_ENGINEERING", ["Next.js Developer"]), role("UI Engineer", "FRONTEND_ENGINEERING", ["UI Developer", "Web UI Engineer"]),
  role("Backend Engineer", "BACKEND_ENGINEERING", ["Back End Engineer", "Backend Developer", "Server Engineer"]), role("Full Stack Engineer", "FULL_STACK_ENGINEERING", ["Fullstack Engineer", "Full Stack Developer"]),
  role("Mobile Engineer", "MOBILE_ENGINEERING", ["Mobile Developer"]), role("iOS Engineer", "MOBILE_ENGINEERING", ["iOS Developer"]), role("Android Engineer", "MOBILE_ENGINEERING", ["Android Developer"]),
  role("QA Engineer", "QA_SDET", ["Quality Assurance Engineer", "Software Test Engineer"], ["QA Automation Engineer", "Quality Assurance Engineer", "SDET", "Software Test Engineer", "Test Automation Engineer", "Automation Engineer"]), role("QA Automation Engineer", "QA_SDET", ["Test Automation Engineer", "Automation Engineer"]), role("SDET", "QA_SDET", ["Software Development Engineer in Test"]),
  role("DevOps Engineer", "DEVOPS_CLOUD", ["Cloud DevOps Engineer"]), role("Cloud Engineer", "DEVOPS_CLOUD"), role("Platform Engineer", "PLATFORM_SRE"), role("Site Reliability Engineer", "PLATFORM_SRE", ["SRE"]),
  role("Cybersecurity Analyst", "CYBERSECURITY", ["Security Analyst"]), role("Security Engineer", "CYBERSECURITY"),
  role("Data Analyst", "DATA"), role("Data Engineer", "DATA"), role("Data Scientist", "DATA"), role("Business Intelligence Analyst", "DATA", ["BI Analyst"]), role("Data Annotator", "DATA", ["AI Data Annotator"]),
  role("Machine Learning Engineer", "AI_ML", ["ML Engineer"]), role("AI Engineer", "AI_ML", ["Artificial Intelligence Engineer"]),
  role("Product Manager", "PRODUCT"), role("Product Owner", "PRODUCT"), role("Technical Product Manager", "PRODUCT"),
  role("Project Manager", "PROJECT_PROGRAM_MANAGEMENT"), role("Program Manager", "PROJECT_PROGRAM_MANAGEMENT"), role("Technical Program Manager", "PROJECT_PROGRAM_MANAGEMENT", ["TPM"]),
  role("Engineering Manager", "ENGINEERING_MANAGEMENT"), role("Director of Engineering", "ENGINEERING_MANAGEMENT"),
  role("Product Designer", "DESIGN_UX"), role("UX Designer", "DESIGN_UX", ["User Experience Designer"]), role("UI Designer", "DESIGN_UX"), role("UX Researcher", "DESIGN_UX"),
  role("Sales Representative", "SALES", ["Sales Executive"]), role("Account Executive", "SALES"), role("Sales Manager", "SALES"), role("Business Development Manager", "SALES"),
  role("Marketing Manager", "MARKETING"), role("Digital Marketing Specialist", "MARKETING"), role("Content Marketing Manager", "MARKETING"), role("SEO Specialist", "MARKETING"),
  role("Financial Analyst", "FINANCE"), role("Accountant", "FINANCE"), role("Finance Manager", "FINANCE"), role("Investment Analyst", "FINANCE"),
  role("Human Resources Manager", "HR", ["HR Manager"]), role("Recruiter", "HR", ["Talent Acquisition Specialist"]), role("People Operations Specialist", "HR"),
  role("Operations Analyst", "OPERATIONS"), role("Operations Manager", "OPERATIONS"), role("Business Operations Manager", "OPERATIONS"),
  role("Customer Success Manager", "CUSTOMER_SUCCESS"), role("Customer Success Specialist", "CUSTOMER_SUCCESS"), role("Technical Support Engineer", "SUPPORT"), role("Customer Support Specialist", "SUPPORT"),
  role("Management Consultant", "CONSULTING"), role("Technology Consultant", "CONSULTING"), role("Business Consultant", "CONSULTING"),
  role("Doctor", "HEALTHCARE", ["Physician", "Medical Doctor"]), role("Registered Nurse", "HEALTHCARE", ["Nurse"]), role("Pharmacist", "HEALTHCARE"), role("Healthcare Administrator", "HEALTHCARE"),
  role("Teacher", "EDUCATION", ["Educator"]), role("Professor", "EDUCATION"), role("Instructional Designer", "EDUCATION"),
  role("Lawyer", "LEGAL", ["Attorney"]), role("Legal Counsel", "LEGAL"), role("Paralegal", "LEGAL"),
  role("Administrative Assistant", "ADMINISTRATION"), role("Executive Assistant", "ADMINISTRATION"), role("Office Manager", "ADMINISTRATION"),
  role("Supply Chain Analyst", "SUPPLY_CHAIN"), role("Procurement Manager", "SUPPLY_CHAIN"), role("Logistics Coordinator", "SUPPLY_CHAIN"),
  role("Manufacturing Engineer", "MANUFACTURING"), role("Production Manager", "MANUFACTURING"), role("Quality Engineer", "MANUFACTURING")
];

const normalized = (value: string) => value.normalize("NFKC").toLowerCase().replace(/[^a-z0-9+#.]+/g, " ").trim();
export function searchRoleCatalog(query: string, limit = 10): RoleCatalogEntry[] {
  const needle = normalized(query);
  if (!needle) return roleCatalog.slice(0, limit);
  return roleCatalog.map((entry) => { const values = [entry.title, ...entry.aliases, ...entry.relatedTitles].map(normalized); const exact = values.includes(needle); const starts = values.some((value) => value.startsWith(needle)); const contains = values.some((value) => value.includes(needle)); return { entry, score: exact ? 3 : starts ? 2 : contains ? 1 : 0 }; }).filter(({ score }) => score > 0).sort((a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title)).slice(0, limit).map(({ entry }) => entry);
}

export function findRole(value: string): RoleCatalogEntry | null {
  const needle = normalized(value);
  return roleCatalog.find((entry) => [entry.title, ...entry.aliases].some((candidate) => normalized(candidate) === needle)) ?? null;
}

export function inferRoleCategory(value: string): RoleCategory {
  const exact = findRole(value); if (exact) return exact.category;
  const text = normalized(value);
  const match = roleCatalog.find((entry) => [entry.title, ...entry.aliases, ...entry.relatedTitles].some((candidate) => { const token = normalized(candidate); return token.length > 3 && (text.includes(token) || token.includes(text)); }));
  return match?.category ?? "OTHER";
}

export function targetRoleDefaults(currentRole: string) {
  const entry = findRole(currentRole);
  const title = entry?.title ?? currentRole.trim();
  return { primaryTargetRoleTitle: title, primaryTargetRoleCategory: entry?.category ?? inferRoleCategory(title), secondaryTargetRoles: [] as string[], includeRelatedTitles: true, experienceToleranceYears: 1, minimumSeniority: "UNKNOWN" as const, maximumSeniority: "UNKNOWN" as const };
}
