import { z } from "zod";
import { roleKeys } from "./permissions";

const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const checklistKinds = ["closing", "cleaning", "maintenance"] as const;
export type ChecklistKind = (typeof checklistKinds)[number];

export const assignChecklistSchema = z
  .object({
    locationId: z.uuid(),
    kind: z.enum(checklistKinds),
    localDate,
    title: z.string().trim().min(1).max(120),
    assigneePrincipalId: z.uuid().optional(),
    assigneeRoleKey: z.enum(roleKeys).optional(),
  })
  .refine((value) => Boolean(value.assigneePrincipalId) !== Boolean(value.assigneeRoleKey), {
    message: "assignee",
  });

export const completeChecklistSchema = z.object({
  checklistId: z.uuid(),
  note: z.string().trim().min(1).max(500),
});

export const openIssueSchema = z.object({
  locationId: z.uuid(),
  description: z.string().trim().min(1).max(500),
  checklistId: z.uuid().optional(),
});

export const resolveIssueSchema = z.object({
  issueId: z.uuid(),
});

export type AssignChecklistInput = z.infer<typeof assignChecklistSchema>;
export type CompleteChecklistInput = z.infer<typeof completeChecklistSchema>;
export type OpenIssueInput = z.infer<typeof openIssueSchema>;
