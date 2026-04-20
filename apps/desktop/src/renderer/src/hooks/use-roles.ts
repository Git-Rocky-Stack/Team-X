import { useMemo } from 'react';

export interface RoleOption {
  id: string;
  name: string;
  level: string;
}

/**
 * Bundled non-system role catalog for the M-D renderer write-side.
 *
 * There is no `roles.list` preload IPC yet. This keeps step (f) inside
 * the already-shipped M-C IPC contract while still accounting for the
 * 55 visible roles. The two system pseudo-employee roles are excluded
 * here just as `RoleLoader.listRoles()` excludes them in main.
 */
export const ROLE_OPTIONS: RoleOption[] = [
  { id: 'accessibility-engineer', name: 'Accessibility Engineer', level: 'ic' },
  { id: 'backend-developer', name: 'Backend Developer', level: 'ic' },
  { id: 'brand-designer', name: 'Brand Designer', level: 'ic' },
  { id: 'business-analyst', name: 'Business Analyst', level: 'ic' },
  { id: 'cloud-infrastructure-engineer', name: 'Cloud Infrastructure Engineer', level: 'ic' },
  { id: 'content-strategist', name: 'Content Strategist', level: 'ic' },
  { id: 'customer-support-engineer', name: 'Customer Support Engineer', level: 'ic' },
  { id: 'data-analyst', name: 'Data Analyst', level: 'ic' },
  { id: 'data-engineer', name: 'Data Engineer', level: 'ic' },
  { id: 'developer-relations-engineer', name: 'Developer Relations Engineer', level: 'ic' },
  { id: 'devops-engineer', name: 'DevOps Engineer', level: 'ic' },
  { id: 'frontend-developer', name: 'Frontend Developer', level: 'ic' },
  { id: 'growth-marketer', name: 'Growth Marketer', level: 'ic' },
  { id: 'ml-engineer', name: 'ML Engineer', level: 'ic' },
  { id: 'mobile-developer', name: 'Mobile Developer', level: 'ic' },
  { id: 'performance-engineer', name: 'Performance Engineer', level: 'ic' },
  { id: 'product-designer', name: 'Product Designer', level: 'ic' },
  { id: 'qa-engineer', name: 'QA Engineer', level: 'ic' },
  { id: 'revenue-operations-analyst', name: 'Revenue Operations Analyst', level: 'ic' },
  { id: 'security-engineer', name: 'Security Engineer', level: 'ic' },
  { id: 'senior-fullstack-engineer', name: 'Senior Fullstack Engineer', level: 'ic' },
  { id: 'solutions-architect', name: 'Solutions Architect', level: 'ic' },
  { id: 'sre-platform-engineer', name: 'SRE / Platform Engineer', level: 'ic' },
  { id: 'technical-writer', name: 'Technical Writer', level: 'ic' },
  { id: 'ui-ux-designer', name: 'UI/UX Designer', level: 'ic' },
  { id: 'content-lead', name: 'Content Lead', level: 'lead' },
  { id: 'design-lead', name: 'Design Lead', level: 'lead' },
  { id: 'ml-lead', name: 'ML Lead', level: 'lead' },
  { id: 'senior-product-manager', name: 'Senior Product Manager', level: 'lead' },
  { id: 'staff-engineer', name: 'Staff Engineer', level: 'lead' },
  { id: 'compliance-officer', name: 'Compliance Officer', level: 'management' },
  { id: 'data-engineering-manager', name: 'Data Engineering Manager', level: 'management' },
  { id: 'design-manager', name: 'Design Manager', level: 'management' },
  { id: 'engineering-manager', name: 'Engineering Manager', level: 'management' },
  { id: 'hr-manager', name: 'HR Manager', level: 'management' },
  { id: 'marketing-manager', name: 'Marketing Manager', level: 'management' },
  { id: 'product-manager', name: 'Product Manager', level: 'management' },
  { id: 'security-engineering-manager', name: 'Security Engineering Manager', level: 'management' },
  { id: 'chief-executive-officer', name: 'Chief Executive Officer', level: 'officer' },
  { id: 'chief-financial-officer', name: 'Chief Financial Officer', level: 'officer' },
  { id: 'chief-marketing-officer', name: 'Chief Marketing Officer', level: 'officer' },
  { id: 'chief-operating-officer', name: 'Chief Operating Officer', level: 'officer' },
  { id: 'chief-technology-officer', name: 'Chief Technology Officer', level: 'officer' },
  { id: 'vp-customer-success', name: 'VP of Customer Success', level: 'senior-management' },
  { id: 'vp-design', name: 'VP of Design', level: 'senior-management' },
  { id: 'vp-engineering', name: 'VP of Engineering', level: 'senior-management' },
  { id: 'vp-marketing', name: 'VP of Marketing', level: 'senior-management' },
  { id: 'vp-people', name: 'VP of People', level: 'senior-management' },
  { id: 'vp-product', name: 'VP of Product', level: 'senior-management' },
  { id: 'vp-sales', name: 'VP of Sales', level: 'senior-management' },
  { id: 'data-lead', name: 'Data Lead', level: 'supervisor' },
  { id: 'devops-lead', name: 'DevOps Lead', level: 'supervisor' },
  { id: 'qa-lead', name: 'QA Lead', level: 'supervisor' },
  { id: 'security-lead', name: 'Security Lead', level: 'supervisor' },
  { id: 'tech-lead', name: 'Tech Lead', level: 'supervisor' },
];

export function useRoles() {
  const rolesByLevel = useMemo(() => {
    const grouped = new Map<string, RoleOption[]>();
    for (const role of ROLE_OPTIONS) {
      const roles = grouped.get(role.level) ?? [];
      roles.push(role);
      grouped.set(role.level, roles);
    }
    return grouped;
  }, []);

  return {
    roles: ROLE_OPTIONS,
    rolesByLevel,
    count: ROLE_OPTIONS.length,
  };
}
