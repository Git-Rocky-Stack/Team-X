import type { Employee, OrgchartEdge } from '@team-x/shared-types';
import { useMemo } from 'react';


import { OrgChartNode } from './org-chart-node.js';

interface OrgChartTreeProps {
  employees: Employee[];
  edges: OrgchartEdge[];
  rootIds: string[];
  onChat: (employeeId: string) => void;
  onProfile: (employee: Employee) => void;
  onPromote: (employee: Employee) => void;
  onFire: (employee: Employee) => void;
  onSetManager: (employeeId: string, managerId: string | null) => void;
}

export function OrgChartTree({
  employees,
  edges,
  rootIds,
  onChat,
  onProfile,
  onPromote,
  onFire,
  onSetManager,
}: OrgChartTreeProps) {
  const { employeeById, childrenByManager } = useMemo(() => {
    const employeeById = new Map<string, Employee>();
    for (const employee of employees) {
      employeeById.set(employee.id, employee);
    }

    const childrenByManager = new Map<string, Employee[]>();
    for (const edge of edges) {
      const report = employeeById.get(edge.reportId);
      if (!report) continue;
      const children = childrenByManager.get(edge.managerId) ?? [];
      children.push(report);
      childrenByManager.set(edge.managerId, children);
    }

    for (const children of childrenByManager.values()) {
      children.sort((a, b) => a.name.localeCompare(b.name));
    }

    return { employeeById, childrenByManager };
  }, [employees, edges]);

  function renderNode(employee: Employee, depth: number): React.ReactNode {
    const children = childrenByManager.get(employee.id) ?? [];
    return (
      <OrgChartNode
        key={employee.id}
        employee={employee}
        depth={depth}
        childCount={children.length}
        managerOptions={employees}
        onChat={onChat}
        onProfile={onProfile}
        onPromote={onPromote}
        onFire={onFire}
        onSetManager={onSetManager}
      >
        {children.map((child) => renderNode(child, depth + 1))}
      </OrgChartNode>
    );
  }

  return (
    <ul role="tree" className="flex-1 overflow-y-auto scrollbar-thin" data-org-chart-tree="">
      {rootIds.map((rootId) => {
        const employee = employeeById.get(rootId);
        if (!employee) return null;
        return renderNode(employee, 0);
      })}
    </ul>
  );
}
